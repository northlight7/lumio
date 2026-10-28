import { randomUUID } from 'node:crypto'
import { afterAll,afterEach,beforeEach,describe,expect,it,vi } from 'vitest'
import { database,query } from '../src/lib/db'
import { hash,sessionCookie,token } from '../src/lib/security'
import { getAttempt,submitAttempt } from '../src/lib/services'
import { uploadAttachment,removeAttachment } from '../src/lib/attachments'
import type { GeneratedVariant } from '../src/lib/ai-curriculum'
import type { Evaluation } from '../src/lib/types'
const grader=vi.hoisted(()=>vi.fn())
vi.mock('../src/lib/ai-curriculum',async original=>({...await original<typeof import('../src/lib/ai-curriculum')>(),gradeVariant:grader}))
let learner:string,attempt:string,variant:GeneratedVariant,request:Request
const work='I checked the supplied records, calculated the requested values and documented the limitations and a concrete follow-up for the next owner.'
const evaluation=():Evaluation=>({score:100,passed:true,source:'deepseek',rubricVersion:variant.task.rubricVersion||`${variant.provenance.promptVersion}:${variant.id}`,checks:variant.rubric.criteria.map(c=>({...c,awarded:c.points,passed:true,feedback:{en:'Supported.',zh:'證據支持。'}}))})
describe.skipIf(process.env.RUN_DB_TESTS!=='true')('identical submitted evidence preserves its absolute grade',()=>{
 beforeEach(async()=>{
  vi.stubEnv('APP_ORIGIN','http://localhost:3300')
  learner=randomUUID();attempt=randomUUID()
  await query('INSERT INTO learners(id) VALUES($1)',[learner])
  const raw=token()
  await query("INSERT INTO sessions(token_hash,learner_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[hash(raw),learner])
  request=new Request('http://localhost:3300',{headers:{cookie:sessionCookie(raw)}})
  variant=(await query<{snapshot:GeneratedVariant}>("SELECT snapshot FROM task_variants WHERE role_id='data-analyst' AND stage='taster' AND retired_at IS NULL AND catalog_hidden_at IS NULL ORDER BY variation LIMIT 1"))[0].snapshot
  await query("INSERT INTO attempts(id,learner_id,role_id,stage,locale,content_version,variant_id,started_at,deadline_at) VALUES($1,$2,$3,'taster','en','consistency-spec',$4,now(),now()+interval '20 minutes')",[attempt,learner,variant.roleId,variant.id])
  grader.mockReset();grader.mockResolvedValue(evaluation())
 })
 afterEach(async()=>{await query('DELETE FROM learners WHERE id=$1',[learner]);await query('DELETE FROM quotas WHERE key LIKE $1',[`%:${learner}:%`]);vi.unstubAllEnvs()})
 afterAll(async()=>{await database().end()})
 const submit=async(text=work,locale:'en'|'zh'='en')=>{
  const current=await getAttempt(request,attempt)
  return submitAttempt(request,attempt,{answers:variant.rubric.expectedAnswers,work:text,locale,requestId:randomUUID(),revision:current.revision,consent:true})
 }
 it('new submit request preserves identical grade while recording a fresh late receipt',async()=>{
  const first=await submit()
  expect(first.submissions[0].timing?.onTime).toBe(true)
  await query("UPDATE attempts SET started_at=now()-interval '21 minutes',deadline_at=now()-interval '1 minute' WHERE id=$1",[attempt])
  grader.mockRejectedValue(new Error('Identical evidence must not request another arbitrary grade'))
  const second=await submit()
  expect(second.submissions).toHaveLength(2)
  expect(second.submissions[1].evaluation).toEqual(first.submissions[0].evaluation)
  expect(second.submissions[1].timing?.onTime).toBe(false)
  expect(grader).toHaveBeenCalledTimes(1)
 })
 it('a substantive edit and changed locale request their own reviews',async()=>{
  await submit()
  await submit(work+' I also verified the discrepancy against record two.')
  await submit(work,'zh')
  expect(grader).toHaveBeenCalledTimes(3)
 })
 it('a provider failure cannot become a cached grade',async()=>{
  grader.mockRejectedValueOnce(new Error('Temporary provider failure'))
  await expect(submit()).rejects.toThrow('Temporary provider failure')
  const completed=await submit()
  expect(completed.submissions).toHaveLength(1)
  expect(grader).toHaveBeenCalledTimes(2)
 })
 it('reuploading exactly the same named file preserves quality while new file bytes require review',async()=>{
  const attach=async(contents:string)=>{
   const current=await getAttempt(request,attempt)
   const form=new FormData()
   form.set('revision',String(current.revision));form.set('privacyConsent','true')
   form.set('file',new File([contents],'completed-work.txt'))
   await uploadAttachment(new Request('http://localhost:3300/upload',{method:'POST',headers:{origin:'http://localhost:3300',cookie:request.headers.get('cookie')!},body:form}),attempt)
  }
  await attach(work)
  const first=await submit('')
  await removeAttachment(request,attempt,first.attachments![0].id,first.revision)
  await attach(work)
  const second=await submit('')
  expect(second.attachments![0].id).not.toBe(first.attachments![0].id)
  expect(second.submissions[1].evaluation).toEqual(first.submissions[0].evaluation)
  expect(grader).toHaveBeenCalledTimes(1)
  await removeAttachment(request,attempt,second.attachments![0].id,second.revision)
  await attach(work+' I added a new source check and documented its result.')
  await submit('')
  expect(grader).toHaveBeenCalledTimes(2)
 })
})

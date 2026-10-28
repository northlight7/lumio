import { afterAll,afterEach,beforeEach,describe,expect,it,vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { database,query } from '../src/lib/db'
import { hash,sessionCookie,token } from '../src/lib/security'
import { uploadAttachment,removeAttachment,downloadAttachment } from '../src/lib/attachments'
import { getAttempt,checkAttempt,submitAttempt,createShare,revokeShare,readShare,exportPortfolio,eraseLearner,saveAttempt,startAttempt,startSession,authenticate,getProfile,resetTaskHistory,getAttemptClock } from '../src/lib/services'
import { GET as materialsGet } from '../src/app/api/attempts/[id]/materials/route'
import type { GeneratedVariant } from '../src/lib/ai-curriculum'
import type { Evaluation } from '../src/lib/types'
const grader=vi.hoisted(()=>vi.fn())
vi.mock('../src/lib/ai-curriculum',async original=>({...await original<typeof import('../src/lib/ai-curriculum')>(),gradeVariant:grader}))
let learnerId:string,outsiderId:string,attemptId:string,request:Request,outsider:Request,variant:GeneratedVariant,extraLearners:string[]=[]
const handover='The supplied records support my decision. I verified the denominator, identified missing observations and assigned a proportionate follow-up to the analyst.'
function upload(name:string,revision:number,contents=handover,who=request){
  const form=new FormData();form.set('file',new File([contents],name));form.set('revision',String(revision));form.set('privacyConsent','true')
  return new Request(`http://localhost:3300/api/attempts/${attemptId}/attachments`,{method:'POST',headers:{origin:'http://localhost:3300',cookie:who.headers.get('cookie')!},body:form})
}
async function attach(name='handover.txt',contents=handover){const attempt=await getAttempt(request,attemptId);await uploadAttachment(upload(name,attempt.revision,contents),attemptId);return getAttempt(request,attemptId)}
function positive():Evaluation{return{score:100,passed:true,checks:variant.rubric.criteria.map(c=>({id:c.id,label:c.label,points:c.points,awarded:c.points,passed:true,feedback:{en:'Supported by supplied evidence.',zh:'由提供證據支持。'},...(c.critical?{critical:true}:{})})),rubricVersion:variant.task.rubricVersion||`${variant.provenance.promptVersion}:${variant.id}`,source:'deepseek'}}
const submit=(requestId=randomUUID())=>submitAttempt(request,attemptId,{answers:variant.rubric.expectedAnswers,work:'',locale:'en',requestId,consent:true})
describe.skipIf(process.env.RUN_DB_TESTS!=='true')('private files, immutable evidence and AI review cache',()=>{
  beforeEach(async()=>{
    vi.stubEnv('APP_ORIGIN','http://localhost:3300')
    extraLearners=[];learnerId=randomUUID();outsiderId=randomUUID();attemptId=randomUUID()
    await query('INSERT INTO learners(id) VALUES ($1),($2)',[learnerId,outsiderId])
    const ownToken=token(),otherToken=token()
    await query("INSERT INTO sessions(token_hash,learner_id,expires_at) VALUES ($1,$2,now()+interval '1 hour'),($3,$4,now()+interval '1 hour')",[hash(ownToken),learnerId,hash(otherToken),outsiderId])
    request=new Request('http://localhost:3300',{headers:{cookie:sessionCookie(ownToken)}})
    outsider=new Request('http://localhost:3300',{headers:{cookie:sessionCookie(otherToken)}})
    const row=(await query<{id:string;snapshot:GeneratedVariant}>("SELECT id,snapshot FROM task_variants WHERE role_id='data-analyst' AND stage='taster' AND retired_at IS NULL AND catalog_hidden_at IS NULL ORDER BY variation LIMIT 1"))[0]
    variant=row.snapshot
    await query("INSERT INTO attempts(id,learner_id,role_id,stage,locale,content_version,variant_id) VALUES ($1,$2,'data-analyst','taster','en','qa-upload',$3)",[attemptId,learnerId,row.id])
    grader.mockReset();grader.mockResolvedValue(positive())
  })
  afterEach(async()=>{
    await query('DELETE FROM learners WHERE id=ANY($1::uuid[])',[[learnerId,outsiderId,...extraLearners]])
    await query('DELETE FROM quotas WHERE key LIKE $1',[`%:${learnerId}:%`])
    vi.unstubAllEnvs()
  })
  afterAll(async()=>{await database().end()})
  it('persists original bytes and preview text, bumps revision and enforces ownership',async()=>{
    const attempt=await attach()
    expect(attempt.revision).toBe(1)
    expect(attempt.attachments).toHaveLength(1)
    const file=attempt.attachments![0]
    expect(file.extractedText).toBe(handover)
    expect(file.sha256).toBe(hash(handover))
    expect((await downloadAttachment(request,file.id)).headers.get('content-disposition')).toContain('attachment;')
    expect(await(await downloadAttachment(request,file.id)).text()).toBe(handover)
    await expect(downloadAttachment(outsider,file.id)).rejects.toMatchObject({code:'attachment_missing'})
    await expect(uploadAttachment(upload('forged.txt',1,handover,outsider),attemptId)).rejects.toMatchObject({code:'attempt_missing'})
    await expect(removeAttachment(outsider,attemptId,file.id,1)).rejects.toMatchObject({code:'attempt_missing'})
    await expect(uploadAttachment(upload('stale.txt',0),attemptId)).rejects.toMatchObject({code:'revision_conflict'})
    expect((await getAttempt(request,attemptId)).attachments).toHaveLength(1)
  })
  it('rejects unsupported formats, cross-origin writes and a fourth active file',async()=>{
    await expect(uploadAttachment(upload('archive.zip',0),attemptId)).rejects.toMatchObject({code:'unsupported_format'})
    const bad=upload('handover.txt',0);bad.headers.set('origin','https://outside.example')
    await expect(uploadAttachment(bad,attemptId)).rejects.toMatchObject({code:'origin_rejected'})
    for(const name of ['one.txt','two.txt','three.txt'])await attach(name)
    await expect(uploadAttachment(upload('four.txt',3),attemptId)).rejects.toMatchObject({code:'attachment_limit'})
  })
  it('requires a privacy declaration and rejects recognizable credentials before storage or AI',async()=>{
    const body=new FormData();body.set('file',new File([handover],'handover.txt'));body.set('revision','0')
    await expect(uploadAttachment(new Request('http://localhost:3300/upload',{method:'POST',headers:{origin:'http://localhost:3300',cookie:request.headers.get('cookie')!},body}),attemptId)).rejects.toMatchObject({code:'file_privacy_required'})
    await expect(uploadAttachment(upload('secret.py',0,'api_key = "sk-'+ 'a'.repeat(32)+'"'),attemptId)).rejects.toMatchObject({code:'sensitive_content'})
    expect((await getAttempt(request,attemptId)).attachments).toHaveLength(0)
    expect(grader).not.toHaveBeenCalled()
  })
  it('accepts finished source files and file-only decisions, judging the actual evidence',async()=>{
    await attach('solution.py','def summarize(records):\n    return sum(row["total"] for row in records)\n# Checked denominator and missing records against the supplied policy.')
    await submitAttempt(request,attemptId,{answers:{},work:'',locale:'en',requestId:randomUUID(),consent:true})
    expect(grader.mock.calls[0][1]).toEqual({})
    expect(grader.mock.calls[0][5][0].format).toBe('py')
    expect(grader.mock.calls[0][5][0].limitations.join(' ')).toContain('not executed')
  })
  it('keeps deadline and start fixed when reopening a new attempt, preserving untimed historical work',async()=>{
    const alternate=(await query<{id:string}>("SELECT id FROM task_variants WHERE role_id='data-analyst' AND stage='taster' AND retired_at IS NULL AND catalog_hidden_at IS NULL AND id<>$1 LIMIT 1",[variant.id]))[0]
    const opened=await startAttempt(request,{roleId:'data-analyst',stage:'taster',locale:'en',variantId:alternate.id})
    expect(opened.startedAt).toBeTruthy()
    expect(Date.parse(opened.deadlineAt!)-Date.parse(opened.startedAt!)).toBe(opened.task!.duration*60000)
    const resumed=await startAttempt(request,{roleId:'data-analyst',stage:'taster',locale:'zh',variantId:alternate.id})
    expect(resumed.id).toBe(opened.id)
    expect(resumed.startedAt).toBe(opened.startedAt)
    expect(resumed.deadlineAt).toBe(opened.deadlineAt)
    expect((await getAttempt(request,attemptId)).deadlineAt).toBeUndefined()
  })
  it('uses server receipt before AI latency for punctuality and permits separately recorded late work',async()=>{
    await attach()
    await query("UPDATE attempts SET started_at=now()-interval '20 minutes',deadline_at=now()+interval '500 milliseconds' WHERE id=$1",[attemptId])
    grader.mockImplementationOnce(async()=>{await new Promise(resolve=>setTimeout(resolve,800));return positive()})
    const onTime=await submit()
    expect(onTime.submissions[0].timing?.onTime).toBe(true)
    expect(Date.parse(onTime.submissions[0].createdAt)).toBeGreaterThan(Date.parse(onTime.deadlineAt!))
    await query("UPDATE attempts SET deadline_at=now()-interval '1 second' WHERE id=$1",[attemptId])
    const late=await submit()
    expect(late.submissions[1].timing?.onTime).toBe(false)
    expect(late.submissions[0].timing?.onTime).toBe(true)
    expect(late.submissions[1].evaluation.score).toBe(100)
  })
  it('authenticates every public material download and refuses foreign attempts and invented file IDs',async()=>{
    const ownUrl=`http://localhost:3300/api/attempts/${attemptId}/materials`
    const ownRequest=new Request(ownUrl,{headers:{cookie:request.headers.get('cookie')!}})
    const response=await materialsGet(ownRequest,{params:Promise.resolve({id:attemptId})})
    const manifest=await response.json()
    expect(manifest.files.some((file:{fileName:string})=>file.fileName==='assignment.txt')).toBe(true)
    const download=await materialsGet(new Request(ownUrl+'?file=pack',{headers:ownRequest.headers}),{params:Promise.resolve({id:attemptId})})
    expect(download.headers.get('content-type')).toBe('application/zip')
    expect(download.headers.get('cache-control')).toBe('no-store')
    const contents=Buffer.from(await download.arrayBuffer()).toString()
    expect(contents).not.toContain('expectedAnswers')
    const foreign=await materialsGet(new Request(ownUrl,{headers:{cookie:outsider.headers.get('cookie')!}}),{params:Promise.resolve({id:attemptId})})
    expect(foreign.status).toBe(404)
    const forged=await materialsGet(new Request(ownUrl+'?file=../../secret',{headers:ownRequest.headers}),{params:Promise.resolve({id:attemptId})})
    expect(forged.status).toBe(404)
    const chinese=await materialsGet(new Request(ownUrl+'?locale=zh',{headers:ownRequest.headers}),{params:Promise.resolve({id:attemptId})})
    const translated=await chinese.json()
    expect(translated.packUrl).toContain('locale=zh')
    const invalid=await materialsGet(new Request(ownUrl+'?locale=fr',{headers:ownRequest.headers}),{params:Promise.resolve({id:attemptId})})
    expect(invalid.status).toBe(400)
  })
  it('rotates guests to empty sessions, removes prior files and revokes their sharing links',async()=>{
    await attach(); await submit(); const share=await createShare(request,[attemptId]); const sharedToken=share.url.split('/').at(-1)!
    const response=await startSession(request,'en',true),fresh=await response.json()
    extraLearners.push(fresh.id)
    expect(fresh.id).not.toBe(learnerId)
    expect(fresh.attempts).toHaveLength(0)
    expect(await query('SELECT id FROM learners WHERE id=$1',[learnerId])).toHaveLength(0)
    expect(await query('SELECT id FROM attachments WHERE learner_id=$1',[learnerId])).toHaveLength(0)
    await expect(readShare(sharedToken)).rejects.toMatchObject({code:'share_missing'})
    await expect(getProfile(request)).rejects.toMatchObject({code:'session_required'})
    const freshRequest=new Request('http://localhost:3300',{headers:{cookie:response.headers.get('set-cookie')!}})
    expect((await getProfile(freshRequest)).id).toBe(fresh.id)
    expect((await getProfile(outsider)).id).toBe(outsiderId)
  })
  it('registers a separate empty account and does not rotate registered users on reload',async()=>{
    await attach()
    const email=`qa-${randomUUID()}@example.test`
    const response=await authenticate(request,{action:'register',email,password:'correct-horse-battery-staple',name:'QA learner'}),account=await response.json()
    extraLearners.push(account.id)
    expect(account.id).not.toBe(learnerId)
    expect(account.email).toBe(email)
    expect(account.attempts).toHaveLength(0)
    const accountRequest=new Request('http://localhost:3300',{headers:{cookie:response.headers.get('set-cookie')!}})
    const refreshed=await (await startSession(accountRequest,'en',true)).json()
    expect(refreshed.id).toBe(account.id)
    expect(refreshed.email).toBe(email)
    await expect(getProfile(request)).rejects.toMatchObject({code:'session_required'})
  })
  it('provides a private lightweight authoritative clock without disclosing another learner task',async()=>{
    const clock=await getAttemptClock(request,attemptId)
    expect(Number.isFinite(Date.parse(clock.serverNow))).toBe(true)
    expect(clock.startedAt).toBeUndefined()
    await expect(getAttemptClock(outsider,attemptId)).rejects.toMatchObject({code:'attempt_missing'})
  })
  it('resets only owned task history and presentation marker while keeping identity and login',async()=>{
    await attach()
    await query("UPDATE learners SET is_demo=true WHERE id=$1",[learnerId])
    const foreignAttempt=randomUUID()
    await query("INSERT INTO attempts(id,learner_id,role_id,stage,locale,content_version,variant_id) VALUES ($1,$2,'data-analyst','taster','en','reset-qa',$3)",[foreignAttempt,outsiderId,variant.id])
    const clean=await resetTaskHistory(request)
    expect(clean.id).toBe(learnerId)
    expect(clean.attempts).toHaveLength(0)
    expect(clean.demo).toBe(false)
    expect((await getProfile(request)).id).toBe(learnerId)
    expect((await getAttempt(outsider,foreignAttempt)).id).toBe(foreignAttempt)
    expect((await query('SELECT 1 FROM attachments WHERE learner_id=$1',[learnerId]))).toHaveLength(0)
  })
  it('reviews file content as handover and keeps submitted files after removing the draft attachment',async()=>{
    const uploaded=await attach(),file=uploaded.attachments![0]
    const submitted=await submit()
    expect(submitted.submissions[0].attachments![0].id).toBe(file.id)
    expect(grader.mock.calls[0][5][0].extractedText).toBe(handover)
    expect(grader.mock.calls[0][2]).toBe('')
    await removeAttachment(request,attemptId,file.id,submitted.revision)
    const changed=await getAttempt(request,attemptId)
    expect(changed.attachments).toHaveLength(0)
    expect(changed.submissions[0].attachments![0].extractedText).toBe(handover)
    expect(await(await downloadAttachment(request,file.id)).text()).toBe(handover)
  })
  it('does not reuse a cached grade request after the uploaded evidence changes',async()=>{
    const uploaded=await attach(),file=uploaded.attachments![0],requestId=randomUUID()
    const submitted=await submit(requestId)
    await submit(requestId)
    expect(grader).toHaveBeenCalledTimes(1)
    await removeAttachment(request,attemptId,file.id,submitted.revision)
    await attach('revised.txt',handover+' A revised follow-up now checks a different record.')
    await expect(submit(requestId)).rejects.toMatchObject({code:'request_conflict'})
    expect(grader).toHaveBeenCalledTimes(1)
    const revised=await submit()
    expect(grader).toHaveBeenCalledTimes(2)
    expect(revised.submissions).toHaveLength(2)
    expect(revised.submissions[0].attachments![0].id).not.toBe(revised.submissions[1].attachments![0].id)
  })
  it('rejects stale displayed revisions before feedback or final review, preserving idempotent successful retries',async()=>{
    const uploaded=await attach()
    await saveAttempt(request,attemptId,{answers:variant.rubric.expectedAnswers,work:handover,locale:'en',revision:uploaded.revision})
    await expect(checkAttempt(request,attemptId,variant.rubric.expectedAnswers,{work:handover,locale:'en',consent:true,revision:uploaded.revision})).rejects.toMatchObject({code:'revision_conflict'})
    await expect(submitAttempt(request,attemptId,{answers:variant.rubric.expectedAnswers,work:'',locale:'en',consent:true,requestId:randomUUID(),revision:uploaded.revision})).rejects.toMatchObject({code:'revision_conflict'})
    expect(grader).not.toHaveBeenCalled()
    const current=await getAttempt(request,attemptId),requestId=randomUUID()
    const payload={answers:variant.rubric.expectedAnswers,work:'',locale:'en' as const,consent:true,requestId,revision:current.revision}
    await submitAttempt(request,attemptId,payload)
    await submitAttempt(request,attemptId,payload)
    expect(grader).toHaveBeenCalledTimes(1)
  })
  it('serializes simultaneous uploads against the same displayed draft revision',async()=>{
    const results=await Promise.allSettled([uploadAttachment(upload('first.txt',0),attemptId),uploadAttachment(upload('second.txt',0),attemptId)])
    expect(results.filter(result=>result.status==='fulfilled')).toHaveLength(1)
    const failed=results.find(result=>result.status==='rejected') as PromiseRejectedResult
    expect(failed.reason).toMatchObject({code:'revision_conflict'})
    const current=await getAttempt(request,attemptId)
    expect(current.revision).toBe(1)
    expect(current.attachments).toHaveLength(1)
  })
  it('enforces the learner storage quota atomically across uploads to different attempts',async()=>{
    await query("INSERT INTO attachments(id,learner_id,attempt_id,file_name,format,size,sha256,bytes,extracted_text,substantive_characters,extraction_hash,limitations,parser_version) SELECT gen_random_uuid(),$1,$2,'quota-fixture.txt','txt',5242880,$3,convert_to(repeat('x',5242880),'UTF8'),$4,$5,$6,'[]','qa-storage-fixture' FROM generate_series(1,19)",[learnerId,attemptId,'a'.repeat(64),handover,handover.length,'b'.repeat(64)])
    const otherVariant=(await query<{id:string}>("SELECT id FROM task_variants WHERE role_id='data-analyst' AND stage='taster' AND retired_at IS NULL AND id<>$1 LIMIT 1",[variant.id]))[0]
    const secondAttempt=randomUUID()
    await query("INSERT INTO attempts(id,learner_id,role_id,stage,locale,content_version,variant_id) VALUES ($1,$2,'data-analyst','taster','en','qa-storage',$3)",[secondAttempt,learnerId,otherVariant.id])
    const fullFile=' '.repeat(5*1024*1024-handover.length)+handover
    const results=await Promise.allSettled([uploadAttachment(upload('first.txt',0,fullFile),attemptId),uploadAttachment(upload('second.txt',0,fullFile),secondAttempt)])
    expect(results.filter(result=>result.status==='fulfilled')).toHaveLength(1)
    expect((results.find(result=>result.status==='rejected') as PromiseRejectedResult).reason).toMatchObject({code:'attachment_storage_limit'})
    const total=(await query<{size:string}>('SELECT sum(size) AS size FROM attachments WHERE learner_id=$1',[learnerId]))[0]
    expect(Number(total.size)).toBe(100*1024*1024)
  })
  it('shares only submitted files from selected attempts, and revocation blocks original downloads',async()=>{
    await attach();const submitted=await submit(),file=submitted.submissions[0].attachments![0]
    const share=await createShare(request,[attemptId]),shareToken=share.url.split('/').at(-1)!
    const draft=await attach('draft-only.txt')
    const draftFile=draft.attachments!.find(f=>f.id!==file.id)!
    const shared=await readShare(shareToken)
    expect(shared.attempts[0].attachments).toHaveLength(1)
    expect(shared.attempts[0].attachments![0].downloadUrl).toContain(`share=${shareToken}`)
    expect(await(await downloadAttachment(outsider,file.id,shareToken)).text()).toBe(handover)
    await expect(downloadAttachment(outsider,draftFile.id,shareToken)).rejects.toMatchObject({code:'attachment_missing'})
    await revokeShare(request,share.id)
    await expect(downloadAttachment(outsider,file.id,shareToken)).rejects.toMatchObject({code:'attachment_missing'})
  })
  it('exports metadata and extracted content, then erases original bytes with the learner',async()=>{
    const file=(await attach()).attachments![0]
    const exported=await(await exportPortfolio(request)).json()
    expect(exported.attempts[0].attachments[0].extractedText).toBe(handover)
    expect(exported.attempts[0].attachments[0].downloadUrl).toBe(`/api/attachments/${file.id}`)
    expect(exported.description).toContain('Download original files separately')
    await eraseLearner(request)
    expect(await query('SELECT 1 FROM attachments WHERE id=$1',[file.id])).toHaveLength(0)
  })
  it('preserves the draft and rejects evidence finalization if it changes during AI review',async()=>{
    await attach()
    grader.mockImplementationOnce(async()=>{
      const current=await getAttempt(request,attemptId)
      await saveAttempt(request,attemptId,{answers:current.answers,work:'Changed during AI review. This updated draft must remain saved.',locale:'en',revision:current.revision})
      return positive()
    })
    await expect(submit()).rejects.toMatchObject({code:'revision_conflict'})
    const preserved=await getAttempt(request,attemptId)
    expect(preserved.submissions).toHaveLength(0)
    expect(preserved.work).toContain('Changed during AI review')
    expect(preserved.attachments).toHaveLength(1)
  })
})

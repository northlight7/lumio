import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Pool } from 'pg'
import { database, query, secret } from '../src/lib/db'
import { chooseVariant, listVariations, variantById } from '../src/lib/variant-store'
import { getTaskFamilies } from '../src/lib/task-families'
import { startAttempt, saveAttempt } from '../src/lib/services'
import { hash, token, sessionCookie } from '../src/lib/security'
import { reviewFamilyContrast,validateVariant,type GeneratedVariant } from '../src/lib/ai-curriculum'

const learnerId=randomUUID()
const outsiderId=randomUUID()
const ids:string[]=[]
let administrator:Pool
let first:GeneratedVariant
let second:GeneratedVariant
let historical:GeneratedVariant
let hiddenModern:GeneratedVariant
let request:Request
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals()})
function fixture(taskId?:string):GeneratedVariant {
  const bank=JSON.parse(readFileSync(resolve(process.cwd(),'curriculum/company-catalog.json'),'utf8')) as {variants:GeneratedVariant[]}
  const variant=structuredClone(bank.variants.find(v=>v.roleId==='data-analyst' && v.stage==='taster')!)
  delete variant.demoEvaluation
  delete variant.demoPoorSample
  variant.id=variant.task.generation!.variantId=randomUUID()
  variant.variation=variant.task.generation!.variation=997
  ids.push(variant.id)
  if (taskId) {
    const family=getTaskFamilies('data-analyst').find(f=>f.id===taskId)!
    variant.taskId=variant.task.taskId=taskId
    variant.task.rubricVersion=family.rubricVersion
    variant.task.criteria=structuredClone(family.criteria)
    variant.rubric.criteria=family.criteria.map((criterion,index)=>({...criterion,expectedEvidence:{en:'Justify the decision using supplied synthetic records.',zh:'引用提供的合成記錄支持決策。'},...(index===0 ? {critical:true} : {})}))
    variant.provenance.promptVersion=variant.task.generation!.promptVersion='lumio-generated-2026-10-10.family.1'
  }
  return variant
}
describe.skipIf(process.env.RUN_DB_TESTS!=='true')('task family storage isolation and archived work',()=>{
  beforeAll(async()=>{
    administrator=new Pool({host:process.env.POSTGRES_HOST,port:Number(process.env.POSTGRES_PORT||5432),database:process.env.POSTGRES_DB,user:process.env.MIGRATION_POSTGRES_USER||'lumio',password:secret('MIGRATION_POSTGRES_PASSWORD'),max:1})
    await administrator.query('SELECT pg_advisory_lock(91427833)')
    const families=getTaskFamilies('data-analyst')
    first=fixture(families[0].id)
    second=fixture(families[1].id)
    historical=fixture()
    hiddenModern=fixture(families[0].id)
    const session=token()
    request=new Request('http://localhost/api/attempts',{headers:{cookie:sessionCookie(session)}})
    await administrator.query('INSERT INTO learners(id) VALUES ($1),($2)',[learnerId,outsiderId])
    await administrator.query("INSERT INTO sessions(token_hash,learner_id,expires_at) VALUES ($1,$2,now()+interval '1 hour')",[hash(session),learnerId])
    for (const variant of [first,second,historical,hiddenModern]) await administrator.query('INSERT INTO task_variants(id,role_id,stage,task_id,variation,snapshot,catalog_hidden_at) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)',[variant.id,variant.roleId,variant.stage,variant.taskId||'legacy',variant.variation,JSON.stringify(variant),variant===historical||variant===hiddenModern ? new Date() : null])
    await query("INSERT INTO attempts(id,learner_id,role_id,stage,locale,content_version,variant_id,work) VALUES ($1,$2,'data-analyst','taster','en','qa-hidden-modern',$3,'Older modern scenario remains editable for its owner.')",[randomUUID(),learnerId,hiddenModern.id])
    await query("INSERT INTO attempts(id,learner_id,role_id,stage,locale,content_version,variant_id,work) VALUES ($1,$2,'data-analyst','taster','en','qa-family-history',$3,'My existing independent work remains intact.')",[randomUUID(),learnerId,historical.id])
  })
  afterAll(async()=>{
    await administrator.query('DELETE FROM quotas WHERE key LIKE $1',[`%:${learnerId}:%`])
    await administrator.query('DELETE FROM learners WHERE id=ANY($1::uuid[])',[[learnerId,outsiderId]])
    await administrator.query('DELETE FROM task_variants WHERE id=ANY($1::uuid[])',[ids])
    await administrator.query('SELECT pg_advisory_unlock(91427833)')
    await administrator.end()
    await database().end()
  })
  it('allows two task families to use the same scenario number without collision',async()=>{
    expect(first.variation).toBe(second.variation)
    expect((await variantById(first.id)).taskId).toBe(first.taskId)
    expect((await variantById(second.id)).taskId).toBe(second.taskId)
    const variations=await listVariations('data-analyst','taster',first.taskId)
    expect(variations.variations.some(v=>v.id===first.id)).toBe(true)
    expect(variations.variations.some(v=>v.id===second.id)).toBe(false)
    expect(variations.variations.every(v=>v.taskId===first.taskId)).toBe(true)
    const publicMetadata=variations.variations.find(v=>v.id===first.id)!
    expect(publicMetadata.taskTitle).toEqual(getTaskFamilies('data-analyst')[0].title)
    expect(JSON.stringify(publicMetadata)).not.toMatch(/expectedAnswers|expectedEvidence|exemplar|critical/)
  })
  it('rejects cross-family and cross-role requested variants before opening work',async()=>{
    await expect(chooseVariant(learnerId,'data-analyst','taster',false,second.id,first.taskId)).rejects.toMatchObject({code:'variation_mismatch'})
    await expect(chooseVariant(learnerId,'ux-designer','taster',false,first.id)).rejects.toMatchObject({code:'variation_mismatch'})
    await expect(listVariations('ux-designer','taster',first.taskId)).rejects.toMatchObject({code:'task_family_mismatch'})
  })
  it('keeps an archived draft readable and resumable only by its existing learner',async()=>{
    expect(await variantById(historical.id,true)).toEqual(historical)
    expect(await chooseVariant(learnerId,'data-analyst','taster',false,historical.id)).toEqual(historical)
    await expect(chooseVariant(outsiderId,'data-analyst','taster',false,historical.id)).rejects.toMatchObject({code:'variation_archived'})
    expect((await listVariations('data-analyst','taster')).variations.some(v=>v.id===historical.id)).toBe(false)
    const saved=await query<{work:string}>('SELECT work FROM attempts WHERE learner_id=$1 AND variant_id=$2',[learnerId,historical.id])
    expect(saved[0].work).toBe('My existing independent work remains intact.')
  })
  it('publishes a same-number replacement without retiring a valid hidden modern case',async()=>{
    expect(hiddenModern.taskId).toBe(first.taskId)
    expect(hiddenModern.variation).toBe(first.variation)
    expect(await chooseVariant(learnerId,'data-analyst','taster',false,hiddenModern.id,first.taskId)).toEqual(hiddenModern)
    await expect(chooseVariant(outsiderId,'data-analyst','taster',false,hiddenModern.id,first.taskId)).rejects.toMatchObject({code:'variation_archived'})
    const catalog=await listVariations('data-analyst','taster',first.taskId)
    expect(catalog.variations.some(v=>v.id===first.id)).toBe(true)
    expect(catalog.variations.some(v=>v.id===hiddenModern.id)).toBe(false)
    const record=await query<{retired_at:Date|null}>('SELECT retired_at FROM task_variants WHERE id=$1',[hiddenModern.id])
    expect(record[0].retired_at).toBeNull()
  })
  it('preserves separate saved drafts and resumes the same identity across tasks',async()=>{
    const one=await startAttempt(request,{roleId:'data-analyst',stage:'taster',locale:'en',taskId:first.taskId,variantId:first.id})
    const saved=await saveAttempt(request,one.id,{answers:first.rubric.expectedAnswers,work:'This first task has separate evidence and must survive task switching.',locale:'en',revision:one.revision})
    const two=await startAttempt(request,{roleId:'data-analyst',stage:'taster',locale:'zh',taskId:second.taskId,variantId:second.id})
    expect(two.id).not.toBe(one.id)
    expect(two.work).toBe('')
    const resumed=await startAttempt(request,{roleId:'data-analyst',stage:'taster',locale:'en',taskId:first.taskId,variantId:first.id})
    expect(resumed.id).toBe(saved.id)
    expect(resumed.work).toBe(saved.work)
    expect(resumed.answers).toEqual(saved.answers)
    expect(resumed.revision).toBe(saved.revision)
  })
  it('keeps the application role restricted from mutating published snapshots',async()=>{
    const privileges=await query<{insert:boolean;update:boolean;delete:boolean;alter:boolean}>("SELECT has_table_privilege(current_user,'task_variants','INSERT') AS insert,has_table_privilege(current_user,'task_variants','UPDATE') AS update,has_table_privilege(current_user,'task_variants','DELETE') AS delete,pg_has_role(current_user,'lumio','MEMBER') AS alter")
    expect(privileges[0]).toEqual({insert:true,update:false,delete:false,alter:false})
  })
  it('accepts exact fixed criteria after a real JSONB round-trip while retaining criterion order, points and version gates',async()=>{
    const stored=(await query<{snapshot:GeneratedVariant}>('SELECT snapshot FROM task_variants WHERE id=$1',[first.id]))[0].snapshot
    expect(JSON.stringify(stored.task.criteria)).not.toBe(JSON.stringify(first.task.criteria))
    expect(stored.task.criteria).toEqual(first.task.criteria)
    expect(validateVariant(stored).task.criteria).toEqual(first.task.criteria)
    vi.stubEnv('DEEPSEEK_API_KEY','test-key')
    vi.stubEnv('DEEPSEEK_API_KEY_FILE','')
    const fetch=vi.fn().mockImplementation(()=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({approved:true,issues:[]})}}]})))
    vi.stubGlobal('fetch',fetch)
    expect(await reviewFamilyContrast(stored,first)).toEqual([])
    expect(fetch).toHaveBeenCalledTimes(1)
    const reordered=structuredClone(first);reordered.task.criteria=[...reordered.task.criteria!].reverse()
    expect(await reviewFamilyContrast(stored,reordered)).toHaveLength(1)
    const differentPoints=structuredClone(first);differentPoints.task.criteria![0].points--
    expect(await reviewFamilyContrast(stored,differentPoints)).toHaveLength(1)
    const differentVersion=structuredClone(first);differentVersion.task.rubricVersion+='-different'
    expect(await reviewFamilyContrast(stored,differentVersion)).toHaveLength(1)
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})

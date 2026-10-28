import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { database, query } from '../src/lib/db'
import { ApiError } from '../src/lib/security'
import { CurriculumQualityError, type GeneratedVariant } from '../src/lib/ai-curriculum'
import { chooseVariant } from '../src/lib/variant-store'
import { getTaskFamilies } from '../src/lib/task-families'

const generationMock = vi.hoisted(() => vi.fn())
vi.mock('../src/lib/ai-curriculum', async importOriginal => ({ ...await importOriginal<typeof import('../src/lib/ai-curriculum')>(), generateVariant: generationMock }))
const roleId = 'ux-designer'
const taskId = getTaskFamilies(roleId)[0].id
const generationKey = `${roleId}:taster:${taskId}`
const originalUserLimit = process.env.AI_DAILY_USER_LIMIT
let learnerId: string
let candidate: GeneratedVariant
let originalAttempts: string[]
describe.skipIf(process.env.RUN_DB_TESTS !== 'true')('generation publication failures with real reservations', () => {
  beforeEach(async () => {
    vi.spyOn(console,'error').mockImplementation(()=>{})
    generationMock.mockReset()
    learnerId = randomUUID()
    await query('INSERT INTO learners(id) VALUES ($1)', [learnerId])
    const rows = await query<{ id: string; snapshot: GeneratedVariant }>("SELECT id,snapshot FROM task_variants WHERE retired_at IS NULL AND role_id=$1 AND stage='taster' AND snapshot->'task'->'company' IS NOT NULL", [roleId])
    expect(rows.length).toBeGreaterThan(0)
    candidate = structuredClone(rows[0].snapshot)
    candidate.id = randomUUID()
    candidate.task.generation!.variantId = candidate.id
    const familyRows = await query<{id:string}>("SELECT id FROM task_variants WHERE retired_at IS NULL AND catalog_hidden_at IS NULL AND role_id=$1 AND stage='taster' AND task_id=$2",[roleId,taskId])
    originalAttempts = []
    for (const row of familyRows.length ? familyRows : rows) {
      const id = randomUUID()
      originalAttempts.push(id)
      await query("INSERT INTO attempts(id,learner_id,role_id,stage,locale,content_version,variant_id,work) VALUES ($1,$2,$3,'taster','en','qa-generation',$4,'Existing QA evidence remains saved.')", [id, learnerId, roleId, row.id])
    }
  })
  afterEach(async () => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    if (originalUserLimit === undefined) delete process.env.AI_DAILY_USER_LIMIT
    else process.env.AI_DAILY_USER_LIMIT = originalUserLimit
    await query('DELETE FROM learners WHERE id=$1', [learnerId])
    await query('DELETE FROM quotas WHERE key LIKE $1', [`%:${learnerId}:%`])
  })
  afterAll(async () => { await database().end() })
  async function expectUnpublished() {
    expect(await query('SELECT 1 FROM task_variants WHERE id=$1', [candidate.id])).toHaveLength(0)
    expect(await query('SELECT 1 FROM generation_locks WHERE key=$1', [generationKey])).toHaveLength(0)
    expect(await query('SELECT 1 FROM provider_leases WHERE learner_id=$1', [learnerId])).toHaveLength(0)
    const evidence = await query<{ id: string; work: string }>('SELECT id,work FROM attempts WHERE learner_id=$1', [learnerId])
    expect(evidence.map(a => a.id).sort()).toEqual(originalAttempts.sort())
    expect(evidence.every(a => a.work === 'Existing QA evidence remains saved.')).toBe(true)
  }
  it('rejects an unapproved candidate without leaking its answer key or leaving a stuck generation lock', async () => {
    generationMock.mockRejectedValue(new CurriculumQualityError('PRIVATE_ANSWER_MARKER was inconsistent', candidate, ['PRIVATE_ANSWER_MARKER']))
    const rejection = await chooseVariant(learnerId, roleId, 'taster', true).catch(error => error)
    expect(rejection).toMatchObject({ status: 502, code: 'generation_quality' })
    expect(rejection.message).not.toContain('PRIVATE_ANSWER_MARKER')
    const diagnostics=vi.mocked(console.error).mock.calls.map(call=>JSON.parse(call[0]))
    expect(diagnostics[0]).toMatchObject({event:'curriculum_quality_rejected',phase:'publication',roleId,taskId,reasons:['PRIVATE_ANSWER_MARKER'],candidateId:candidate.id})
    expect(diagnostics[1]).toMatchObject({event:'curriculum_rejected_candidate',phase:'unpublished',candidate})
    expect(JSON.stringify(diagnostics)).not.toContain('Existing QA evidence remains saved.')
    await expectUnpublished()
    const quota = await query<{ count: number }>('SELECT count FROM quotas WHERE key LIKE $1', [`ai:user:${learnerId}:%`])
    expect(quota[0].count).toBe(4)
    await expect(chooseVariant(learnerId, roleId, 'taster', true)).rejects.toMatchObject({ code: 'generation_quality' })
    expect(generationMock).toHaveBeenCalledTimes(2)
    await expectUnpublished()
  })
  it.each(['csv','tsv'])('refuses malformed public %s before publication without changing existing learner evidence',async format=>{
    candidate.task.documents[0].body.en+=format==='csv'?'\n```csv\na,b\n1,2,3\n```':'\n```tsv\na\tb\n1\t2\t3\n```'
    generationMock.mockResolvedValue(candidate)
    const rejection=await chooseVariant(learnerId,roleId,'taster',true).catch(error=>error)
    expect(rejection).toMatchObject({status:502,code:'generation_quality'})
    const diagnostics=vi.mocked(console.error).mock.calls.map(call=>JSON.parse(call[0]))
    expect(diagnostics[0].reasons[0]).toContain('CSV or TSV source must have valid syntax and consistent columns')
    await expectUnpublished()
  })
  it('passes every active prior family case to one contrast request without private answer fields', async () => {
    generationMock.mockRejectedValue(new ApiError(502, 'Stop after observing the request', 'ai_timeout'))
    await expect(chooseVariant(learnerId, roleId, 'taster', true)).rejects.toMatchObject({code: 'ai_timeout'})
    const rows = await query<{snapshot: GeneratedVariant}>("SELECT snapshot FROM task_variants WHERE retired_at IS NULL AND catalog_hidden_at IS NULL AND role_id=$1 AND stage='taster' AND task_id=$2 ORDER BY variation", [roleId, taskId])
    const history = generationMock.mock.calls[0][9]
    expect(history).toEqual(rows.map(row => row.snapshot.task))
    expect(history.length).toBeGreaterThanOrEqual(2)
    expect(JSON.stringify(history)).not.toContain('expectedAnswers')
    await expectUnpublished()
  })
  it('retains a provider configuration error and releases reservations without publishing', async () => {
    generationMock.mockRejectedValue(new ApiError(503, 'Provider configuration needs attention.', 'ai_provider_configuration'))
    await expect(chooseVariant(learnerId, roleId, 'taster', true)).rejects.toMatchObject({ status: 503, code: 'ai_provider_configuration' })
    expect(generationMock).toHaveBeenCalledTimes(1)
    await expectUnpublished()
  })
  it('reserves the complete generation budget atomically before invoking authoring', async () => {
    process.env.AI_DAILY_USER_LIMIT = '2'
    await expect(chooseVariant(learnerId, roleId, 'taster', true)).rejects.toMatchObject({ status: 429, code: 'quota_exceeded' })
    expect(generationMock).not.toHaveBeenCalled()
    expect(await query('SELECT 1 FROM quotas WHERE key LIKE $1', [`ai:user:${learnerId}:%`])).toHaveLength(0)
    await expectUnpublished()
  })
  it('an old request cannot release a newer owner after its generation lock expires and is taken over',async()=>{
    let newIdentity=''
    generationMock.mockImplementation(async()=>{
      await query("UPDATE generation_locks SET expires_at=now()-interval '1 second' WHERE key=$1",[generationKey])
      const acquired=await query<{identity:string}>("INSERT INTO generation_locks(key,expires_at) VALUES ($1,now()+interval '120 seconds') ON CONFLICT(key) DO UPDATE SET expires_at=EXCLUDED.expires_at WHERE generation_locks.expires_at<now() RETURNING expires_at::text AS identity",[generationKey])
      expect(acquired).toHaveLength(1)
      newIdentity=acquired[0].identity
      throw new ApiError(502,'Simulated older provider timeout','ai_timeout')
    })
    try{
      await expect(chooseVariant(learnerId,roleId,'taster',true)).rejects.toMatchObject({code:'ai_timeout'})
      const locks=await query<{identity:string}>('SELECT expires_at::text AS identity FROM generation_locks WHERE key=$1',[generationKey])
      expect(locks).toEqual([{identity:newIdentity}])
      expect(await query('SELECT 1 FROM provider_leases WHERE learner_id=$1',[learnerId])).toHaveLength(0)
    }finally{await query('DELETE FROM generation_locks WHERE key=$1',[generationKey])}
  })
  it('reserves all eight possible calls before a two-round generation and invokes none if the budget is insufficient',async()=>{
    vi.stubEnv('AI_GENERATION_REPAIR_ATTEMPTS','1')
    process.env.AI_DAILY_USER_LIMIT='6'
    await expect(chooseVariant(learnerId,roleId,'taster',true)).rejects.toMatchObject({code:'quota_exceeded'})
    expect(generationMock).not.toHaveBeenCalled()
    expect(await query('SELECT 1 FROM quotas WHERE key LIKE $1',[`ai:user:${learnerId}:%`])).toHaveLength(0)
    await expectUnpublished()
  })
})

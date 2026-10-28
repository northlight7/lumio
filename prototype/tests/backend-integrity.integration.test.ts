import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Pool } from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { database, query, secret } from '../src/lib/db'
import { hash, token } from '../src/lib/security'
import { checkAttempt, getAttempt, saveAttempt, submitAttempt } from '../src/lib/services'
import { validateGrade, type GeneratedVariant } from '../src/lib/ai-curriculum'
import type { Evaluation } from '../src/lib/types'

const provider = vi.hoisted(() => vi.fn())
vi.mock('../src/lib/ai-curriculum', async original => ({ ...await original<typeof import('../src/lib/ai-curriculum')>(), gradeVariant: provider }))
const isolated = process.env.RUN_DB_TESTS === 'true' && /^lumio_backend_integrity_qa_/.test(process.env.POSTGRES_DB || '')
let admin: Pool
let learnerId: string
let attemptId: string
let variant: GeneratedVariant
let request: Request
let evaluation: Evaluation
let sequence = 900
let payload: { answers: GeneratedVariant['rubric']['expectedAnswers']; work: string; locale: 'en'; consent: true; requestId: string; revision: number }

async function fixture(stage: 'taster' | 'assessment') {
  const catalog = JSON.parse(readFileSync(resolve(process.cwd(), 'curriculum/company-catalog.json'), 'utf8')) as { variants: GeneratedVariant[] }
  variant = structuredClone(catalog.variants.find(v => v.stage === stage && v.roleId === (stage === 'assessment' ? 'ai-engineer' : 'data-analyst') && v.task.company)!)
  expect(variant).toBeDefined()
  delete variant.demoEvaluation
  delete variant.demoPoorSample
  variant.id = randomUUID()
  variant.variation = sequence++
  Object.assign(variant.task.generation!, { variantId: variant.id, variation: variant.variation })
  await admin.query('INSERT INTO task_variants(id,role_id,stage,variation,snapshot) VALUES ($1,$2,$3,$4,$5::jsonb)', [variant.id, variant.roleId, variant.stage, variant.variation, JSON.stringify(variant)])
  await query("INSERT INTO attempts(id,learner_id,role_id,stage,locale,content_version,variant_id,started_at,deadline_at) VALUES ($1,$2,$3,$4,'en',$5,$6,now()-interval '5 minutes',now()+interval '15 minutes')", [attemptId, learnerId, variant.roleId, variant.stage, `integrity-qa:${variant.id}`, variant.id])
  payload = { answers: variant.rubric.expectedAnswers, work: variant.rubric.exemplar.en, locale: 'en', consent: true, requestId: randomUUID(), revision: 0 }
  evaluation = validateGrade(variant, { criteria: variant.rubric.criteria.map(c => ({ id: c.id, awarded: c.points, feedback: { en: 'The source evidence supports this decision.', zh: '來源證據支持這項決定。' } })), summary: { en: 'Checked against supplied evidence.', zh: '已按所提供的證據檢查。' }, nextSteps: { en: 'Verify the next source record.', zh: '核實下一項來源記錄。' } }, payload.work)
  provider.mockResolvedValue(evaluation)
}
const state = async () => (await query<{ practice_feedback_count: number; revision: number; started_at: Date; deadline_at: Date; updated_at: Date }>('SELECT practice_feedback_count,revision,started_at,deadline_at,updated_at FROM attempts WHERE id=$1', [attemptId]))[0]

describe.skipIf(!isolated)('backend integrity on an isolated database with a mocked AI provider', () => {
  beforeAll(() => {
    admin = new Pool({ host: process.env.POSTGRES_HOST, port: Number(process.env.POSTGRES_PORT || 5432), database: process.env.POSTGRES_DB, user: process.env.MIGRATION_POSTGRES_USER || 'lumio', password: secret('MIGRATION_POSTGRES_PASSWORD'), max: 1 })
  })
  beforeEach(async () => {
    provider.mockReset()
    learnerId = randomUUID()
    attemptId = randomUUID()
    const raw = token()
    await query('INSERT INTO learners(id) VALUES ($1)', [learnerId])
    await query("INSERT INTO sessions(token_hash,learner_id,expires_at) VALUES ($1,$2,now()+interval '1 hour')", [hash(raw), learnerId])
    request = new Request('http://localhost:3100/api/attempts', { headers: { cookie: `lumio_session=${raw}` } })
  })
  afterEach(async () => {
    await query('DELETE FROM learners WHERE id=$1', [learnerId])
    await query('DELETE FROM quotas WHERE key LIKE $1', [`%:${learnerId}:%`])
    if (variant) await admin.query('DELETE FROM task_variants WHERE id=$1', [variant.id])
  })
  afterAll(async () => { await admin.end(); await database().end() })

  it('recovers a lost assessment reply using the exact saved request, without regrading or creating another version', async () => {
    await fixture('assessment')
    let savedId: string | undefined
    const droppedReply = async () => {
      const saved = await submitAttempt(request, attemptId, payload)
      savedId = saved.submissions[0].id
      throw new Error('Simulated network loss after the server committed the final receipt')
    }
    await expect(droppedReply()).rejects.toThrow('Simulated network loss')
    provider.mockRejectedValue(new Error('A retry must not contact the provider'))
    const recovered = await submitAttempt(request, attemptId, payload)
    expect(recovered.submissions).toHaveLength(1)
    expect(recovered.submissions[0].id).toBe(savedId)
    expect(recovered.submissions[0].evaluation).toEqual(evaluation)
    expect(recovered.revision).toBe(1)
    expect(provider).toHaveBeenCalledTimes(1)
    expect((await query<{ count: number }>('SELECT count FROM quotas WHERE key LIKE $1', [`ai:user:${learnerId}:%`]))[0].count).toBe(1)
  })

  it('keeps final assessment evidence single-shot and rejects changed answers, work or language under the old request ID', async () => {
    await fixture('assessment')
    const first = await submitAttempt(request, attemptId, payload)
    await expect(submitAttempt(request, attemptId, { ...payload, requestId: randomUUID(), revision: first.revision })).rejects.toMatchObject({ status: 409, code: 'assessment_already_submitted' })
    await expect(submitAttempt(request, attemptId, { ...payload, work: `${payload.work}\nA substantive change.` })).rejects.toMatchObject({ status: 409, code: 'request_conflict' })
    await expect(submitAttempt(request, attemptId, { ...payload, locale: 'zh' })).rejects.toMatchObject({ status: 409, code: 'request_conflict' })
    const numberQuestion = variant.task.questions.find(q => q.type === 'number')!
    expect(numberQuestion).toBeDefined()
    const changed = { ...payload.answers, [numberQuestion.id]: Number(payload.answers[numberQuestion.id]) + 1 }
    await expect(submitAttempt(request, attemptId, { ...payload, answers: changed })).rejects.toMatchObject({ status: 409, code: 'request_conflict' })
    expect(provider).toHaveBeenCalledTimes(1)
    expect((await getAttempt(request, attemptId)).submissions).toHaveLength(1)
    expect((await state()).practice_feedback_count).toBe(0)
  })

  it('records successful practice feedback without changing revision, draft timestamps or deadlines', async () => {
    await fixture('taster')
    const before = await state()
    await checkAttempt(request, attemptId, payload.answers, payload)
    await checkAttempt(request, attemptId, payload.answers, payload)
    expect(await state()).toEqual({ ...before, practice_feedback_count: 2 })
    expect((await getAttempt(request, attemptId)).submissions).toHaveLength(0)
  })

  it('does not count failed, stale or retired practice checks as delivered assistance', async () => {
    await fixture('taster')
    provider.mockRejectedValueOnce(new Error('The upstream provider failed'))
    await expect(checkAttempt(request, attemptId, payload.answers, payload)).rejects.toThrow('upstream provider failed')
    expect((await state()).practice_feedback_count).toBe(0)
    provider.mockImplementationOnce(async () => {
      await saveAttempt(request, attemptId, { answers: payload.answers, work: `${payload.work}\nNew draft.`, locale: 'en', revision: 0 })
      return evaluation
    })
    await expect(checkAttempt(request, attemptId, payload.answers, payload)).rejects.toMatchObject({ code: 'revision_conflict' })
    expect((await state()).practice_feedback_count).toBe(0)
    provider.mockImplementationOnce(async () => {
      await admin.query('UPDATE task_variants SET retired_at=now() WHERE id=$1', [variant.id])
      return evaluation
    })
    await expect(checkAttempt(request, attemptId, payload.answers, { ...payload, revision: 1 })).rejects.toMatchObject({ code: 'variation_retired' })
    expect((await state()).practice_feedback_count).toBe(0)
  })

  it('snapshots current feedback plus chat assistance on each receipt while reusing unchanged quality', async () => {
    await fixture('taster')
    const aiId = randomUUID()
    await query("INSERT INTO ai_requests(id,attempt_id,learner_id,request_id,persona,user_content,state) VALUES ($1,$2,$3,$4,'coach','A QA help request','complete')", [aiId, attemptId, learnerId, randomUUID()])
    await query("INSERT INTO messages(id,attempt_id,request_id,role,persona,content,source) VALUES ($1,$2,$3,'assistant','coach','An authored QA coaching reply.','deepseek')", [randomUUID(), attemptId, aiId])
    await checkAttempt(request, attemptId, payload.answers, payload)
    const first = await submitAttempt(request, attemptId, payload)
    expect(first.submissions[0].assistance).toBe(2)
    await checkAttempt(request, attemptId, payload.answers, { ...payload, revision: first.revision })
    provider.mockRejectedValue(new Error('Cached quality must not request another review'))
    const second = await submitAttempt(request, attemptId, { ...payload, requestId: randomUUID(), revision: first.revision })
    expect(second.submissions).toHaveLength(2)
    expect(second.submissions[0].assistance).toBe(2)
    expect(second.submissions[1].assistance).toBe(3)
    expect(second.submissions[1].evaluation).toEqual(second.submissions[0].evaluation)
    expect(second.submissions[1].id).not.toBe(second.submissions[0].id)
    expect(provider).toHaveBeenCalledTimes(3)
    expect((await state()).practice_feedback_count).toBe(2)
    expect(second.deadlineAt).toBe(first.deadlineAt)
  })

  it('does not count a concurrency-rejected check while another feedback request completes', async () => {
    await fixture('taster')
    let complete!: (value: Evaluation) => void
    let signal!: () => void
    const started = new Promise<void>(resolve => { signal = resolve })
    provider.mockImplementationOnce(() => { signal(); return new Promise<Evaluation>(resolve => { complete = resolve }) })
    const first = checkAttempt(request, attemptId, payload.answers, payload)
    await started
    await expect(checkAttempt(request, attemptId, payload.answers, payload)).rejects.toMatchObject({ code: 'ai_concurrency_limit' })
    complete(evaluation)
    await first
    expect((await state()).practice_feedback_count).toBe(1)
    expect(provider).toHaveBeenCalledTimes(1)
  })
})

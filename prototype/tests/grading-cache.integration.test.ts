import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { database, query, secret } from '../src/lib/db'
import { hash, token } from '../src/lib/security'
import { checkAttempt, saveAttempt, submitAttempt } from '../src/lib/services'
import { validateGrade, type GeneratedVariant } from '../src/lib/ai-curriculum'
import type { Evaluation } from '../src/lib/types'

const gradeMock = vi.hoisted(() => vi.fn())
vi.mock('../src/lib/ai-curriculum', async importOriginal => ({ ...await importOriginal<typeof import('../src/lib/ai-curriculum')>(), gradeVariant: gradeMock }))
let administrator: Pool
let variantId: string
let learnerId: string
let attemptId: string
let request: Request
let variant: GeneratedVariant
let evaluation: Evaluation
let payload: { answers: GeneratedVariant['rubric']['expectedAnswers']; work: string; locale: 'en'; consent: true; requestId: string }

describe.skipIf(process.env.RUN_DB_TESTS !== 'true')('durable grading cache with real transactions and a mocked provider', () => {
  beforeAll(() => {
    administrator = new Pool({ host: process.env.POSTGRES_HOST, port: Number(process.env.POSTGRES_PORT || 5432), database: process.env.POSTGRES_DB, user: process.env.MIGRATION_POSTGRES_USER || 'lumio', password: secret('MIGRATION_POSTGRES_PASSWORD'), max: 1 })
  })
  beforeEach(async () => {
    gradeMock.mockReset()
    learnerId = randomUUID()
    attemptId = randomUUID()
    const raw = token()
    request = new Request('http://localhost:3100/api/attempts', { headers: { cookie: `lumio_session=${raw}` } })
    const rows = await query<{ id: string; snapshot: GeneratedVariant; presentation: object }>("SELECT id,snapshot,presentation FROM task_variants WHERE retired_at IS NULL AND role_id='data-analyst' AND stage='taster' AND snapshot->'task'->'company' IS NOT NULL ORDER BY variation LIMIT 1")
    expect(rows).toHaveLength(1)
    variant = structuredClone(rows[0].snapshot)
    delete variant.demoEvaluation
    delete variant.demoPoorSample
    variantId = randomUUID()
    variant.id = variantId
    variant.variation = 998
    variant.task.generation!.variantId = variantId
    variant.task.generation!.variation = 998
    await administrator.query('INSERT INTO task_variants(id,role_id,stage,variation,snapshot) VALUES ($1,$2,$3,$4,$5::jsonb)', [variantId, variant.roleId, variant.stage, variant.variation, JSON.stringify(variant)])
    await query('INSERT INTO learners(id) VALUES ($1)', [learnerId])
    await query("INSERT INTO sessions(token_hash,learner_id,expires_at) VALUES ($1,$2,now()+interval '1 hour')", [hash(raw), learnerId])
    await query("INSERT INTO attempts(id,learner_id,role_id,stage,locale,content_version,variant_id) VALUES ($1,$2,$3,'taster','en',$4,$5)", [attemptId, learnerId, variant.roleId, `qa:${variant.id}`, variant.id])
    payload = { answers: variant.rubric.expectedAnswers, work: variant.rubric.exemplar.en, locale: 'en', consent: true, requestId: randomUUID() }
    evaluation = validateGrade(variant, { criteria: variant.rubric.criteria.map(c => ({ id: c.id, awarded: c.points, feedback: { en: 'Source evidence supports the decision.', zh: '文件證據支持此決策。' } })), summary: { en: 'Evidence-based analysis.', zh: '以證據為本的分析。' }, nextSteps: { en: 'Verify the next source record.', zh: '核實下一項文件記錄。' } }, payload.work)
    gradeMock.mockResolvedValue(evaluation)
  })
  afterEach(async () => {
    await query('DELETE FROM learners WHERE id=$1', [learnerId])
    await query('DELETE FROM quotas WHERE key LIKE $1', [`%:${learnerId}:%`])
    await administrator.query('DELETE FROM task_variants WHERE id=$1', [variantId])
  })
  afterAll(async () => { await administrator.end(); await database().end() })
  it('returns the exact original submission on retry without another provider call or quota charge', async () => {
    const first = await submitAttempt(request, attemptId, payload)
    const second = await submitAttempt(request, attemptId, payload)
    expect(second.submissions).toEqual(first.submissions)
    expect(second.submissions).toHaveLength(1)
    expect(gradeMock).toHaveBeenCalledTimes(1)
    const reservations = await query<{ count: number }>('SELECT count FROM quotas WHERE key LIKE $1', [`ai:user:${learnerId}:%`])
    expect(reservations[0].count).toBe(1)
    await expect(submitAttempt(request, attemptId, { ...payload, work: `${payload.work}\nAltered evidence` })).rejects.toMatchObject({ status: 409, code: 'request_conflict' })
    expect(gradeMock).toHaveBeenCalledTimes(1)
  })
  it('rejects a fresh submission if its exercise is retired during the provider call', async () => {
    gradeMock.mockImplementation(async () => {
      await administrator.query('UPDATE task_variants SET retired_at=now() WHERE id=$1', [variantId])
      return evaluation
    })
    await expect(submitAttempt(request, attemptId, payload)).rejects.toMatchObject({ status: 409, code: 'variation_retired' })
    expect(await query('SELECT 1 FROM submissions WHERE attempt_id=$1', [attemptId])).toHaveLength(0)
    expect(gradeMock).toHaveBeenCalledTimes(1)
  })
  it('rejects practice feedback if its exercise is retired while the provider is reviewing', async () => {
    gradeMock.mockImplementation(async () => {
      await administrator.query('UPDATE task_variants SET retired_at=now() WHERE id=$1', [variantId])
      return evaluation
    })
    await expect(checkAttempt(request, attemptId, payload.answers, payload)).rejects.toMatchObject({ status: 409, code: 'variation_retired' })
    expect(await query('SELECT 1 FROM submissions WHERE attempt_id=$1', [attemptId])).toHaveLength(0)
    expect(gradeMock).toHaveBeenCalledTimes(1)
  })
  it('preserves an exact historical submission retry after later retirement', async () => {
    const first = await submitAttempt(request, attemptId, payload)
    await administrator.query('UPDATE task_variants SET retired_at=now() WHERE id=$1', [variantId])
    const second = await submitAttempt(request, attemptId, payload)
    expect(second.submissions).toEqual(first.submissions)
    expect(second.retired).toBe(true)
    expect(gradeMock).toHaveBeenCalledTimes(1)
  })
  it('preserves a completed grade across a draft conflict and reuses it on an identical explicit retry', async () => {
    gradeMock.mockImplementation(async () => {
      await saveAttempt(request, attemptId, { answers: payload.answers, work: `${payload.work}\nA newer draft was saved while reviewing.`, locale: 'en', revision: 0 })
      return evaluation
    })
    await expect(submitAttempt(request, attemptId, payload)).rejects.toMatchObject({ status: 409, code: 'revision_conflict' })
    expect(await query('SELECT 1 FROM submissions WHERE attempt_id=$1', [attemptId])).toHaveLength(0)
    const completed = await query<{ state: string; evaluation: Evaluation }>('SELECT state,evaluation FROM grading_requests WHERE attempt_id=$1', [attemptId])
    expect(completed[0]).toEqual({ state: 'complete', evaluation })
    const retried = await submitAttempt(request, attemptId, payload)
    expect(retried.submissions).toHaveLength(1)
    expect(retried.submissions[0].evaluation).toEqual(evaluation)
    expect(gradeMock).toHaveBeenCalledTimes(1)
    const reservations = await query<{ count: number }>('SELECT count FROM quotas WHERE key LIKE $1', [`ai:user:${learnerId}:%`])
    expect(reservations[0].count).toBe(1)
  })
})

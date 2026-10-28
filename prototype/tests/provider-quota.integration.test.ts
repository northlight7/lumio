import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { database, query } from '../src/lib/db'
import { withProviderLease } from '../src/lib/provider-quota'

const learnerId = randomUUID()
const secondLearnerId = randomUUID()
const previousConcurrency = process.env.AI_GLOBAL_CONCURRENCY
const previousUserLimit = process.env.AI_DAILY_USER_LIMIT
describe.skipIf(process.env.RUN_DB_TESTS !== 'true')('real PostgreSQL provider reservations', () => {
  beforeAll(async () => { await query('INSERT INTO learners(id) VALUES ($1),($2)', [learnerId, secondLearnerId]) })
  afterEach(() => {
    vi.unstubAllEnvs()
    if (previousConcurrency === undefined) delete process.env.AI_GLOBAL_CONCURRENCY
    else process.env.AI_GLOBAL_CONCURRENCY = previousConcurrency
    if (previousUserLimit === undefined) delete process.env.AI_DAILY_USER_LIMIT
    else process.env.AI_DAILY_USER_LIMIT = previousUserLimit
  })
  afterAll(async () => {
    await query('DELETE FROM learners WHERE id=ANY($1::uuid[])', [[learnerId, secondLearnerId]])
    await query('DELETE FROM quotas WHERE key LIKE $1', [`ai:user:${secondLearnerId}:%`])
    await query('DELETE FROM quotas WHERE key LIKE $1', [`ai:user:${learnerId}:%`])
    await database().end()
  })
  it('rejects a second in-flight provider call for the same learner before invoking the provider', async () => {
    let begin!: () => void
    let release!: () => void
    const started = new Promise<void>(resolve => { begin = resolve })
    const waiting = new Promise<void>(resolve => { release = resolve })
    const first = withProviderLease(learnerId, 'qa-first', async () => { begin(); await waiting; return 'first result' }, false)
    await started
    let invoked = false
    try {
      await expect(withProviderLease(learnerId, 'qa-second', async () => { invoked = true }, false)).rejects.toMatchObject({ status: 429, code: 'ai_concurrency_limit' })
      expect(invoked).toBe(false)
    } finally { release(); await first }
    expect(await query('SELECT 1 FROM provider_leases WHERE learner_id=$1', [learnerId])).toHaveLength(0)
  })
  it('releases reservations after a failed provider call so a learner can retry', async () => {
    await expect(withProviderLease(learnerId, 'qa-failing', async () => { throw new Error('QA simulated transport failure') }, false)).rejects.toThrow('simulated transport failure')
    expect(await withProviderLease(learnerId, 'qa-retry', async () => 'retry result', false)).toBe('retry result')
    expect(await query('SELECT 1 FROM provider_leases WHERE learner_id=$1', [learnerId])).toHaveLength(0)
  })
  it('rolls back a lease when daily quota reservation is denied', async () => {
    process.env.AI_DAILY_USER_LIMIT = '1'
    expect(await withProviderLease(learnerId, 'qa-quota-first', async () => 'allowed')).toBe('allowed')
    let invoked = false
    await expect(withProviderLease(learnerId, 'qa-quota-denied', async () => { invoked = true })).rejects.toMatchObject({ status: 429, code: 'quota_exceeded' })
    expect(invoked).toBe(false)
    expect(await query('SELECT 1 FROM provider_leases WHERE learner_id=$1', [learnerId])).toHaveLength(0)
    expect(await withProviderLease(learnerId, 'qa-cached-retry', async () => 'cached grade', false)).toBe('cached grade')
  })
  it('rejects another learner at global capacity while retaining the first reservation', async () => {
    let begin!: () => void
    let release!: () => void
    const started = new Promise<void>(resolve => { begin = resolve })
    const waiting = new Promise<void>(resolve => { release = resolve })
    const first = withProviderLease(learnerId, 'qa-capacity-first', async () => { begin(); await waiting }, false)
    await started
    process.env.AI_GLOBAL_CONCURRENCY = '1'
    let invoked = false
    try {
      await expect(withProviderLease(secondLearnerId, 'qa-capacity-second', async () => { invoked = true }, false)).rejects.toMatchObject({ status: 429, code: 'ai_capacity' })
      expect(invoked).toBe(false)
      expect(await query('SELECT 1 FROM provider_leases WHERE learner_id=$1', [learnerId])).toHaveLength(1)
      expect(await query('SELECT 1 FROM provider_leases WHERE learner_id=$1', [secondLearnerId])).toHaveLength(0)
    } finally { release(); await first }
  })
  it('reserves capacity for three simultaneous generation reviewers',async()=>{
    let begin!:()=>void
    let release!:()=>void
    const started=new Promise<void>(resolve=>{begin=resolve})
    const waiting=new Promise<void>(resolve=>{release=resolve})
    const generation=withProviderLease(learnerId,'generation',async()=>{begin();await waiting},false)
    await started
    process.env.AI_GLOBAL_CONCURRENCY='3'
    let invoked=false
    try {
      await expect(withProviderLease(secondLearnerId,'feedback',async()=>{invoked=true},false)).rejects.toMatchObject({code:'ai_capacity'})
      expect(invoked).toBe(false)
    } finally {release();await generation}
  })
  it('keeps a generation reservation active beyond every configured provider phase and publication margin',async()=>{
    vi.stubEnv('CURRICULUM_OFFLINE_TIMEOUT_MS','')
    vi.stubEnv('AI_GENERATION_AUTHOR_TIMEOUT_MS','90000')
    vi.stubEnv('AI_GENERATION_REVIEW_TIMEOUT_MS','90000')
    await withProviderLease(learnerId,'generation',async()=>{
      const rows=await query<{remaining:number}>("SELECT EXTRACT(EPOCH FROM expires_at-now())::double precision AS remaining FROM provider_leases WHERE learner_id=$1",[learnerId])
      expect(rows[0].remaining).toBeGreaterThan(195)
      expect(rows[0].remaining).toBeLessThanOrEqual(200)
    },false)
  })
  it('charges a retry atomically and denies its provider call when the learner quota is exhausted', async () => {
    process.env.AI_DAILY_USER_LIMIT = '1'
    let retryInvoked = false
    await expect(withProviderLease(secondLearnerId, 'qa-retry-quota', async reserveAdditional => {
      await reserveAdditional()
      retryInvoked = true
    })).rejects.toMatchObject({ status: 429, code: 'quota_exceeded' })
    expect(retryInvoked).toBe(false)
    expect(await query('SELECT 1 FROM provider_leases WHERE learner_id=$1', [secondLearnerId])).toHaveLength(0)
    const quota = await query<{ count: number }>('SELECT count FROM quotas WHERE key LIKE $1', [`ai:user:${secondLearnerId}:%`])
    expect(quota[0].count).toBe(1)
  })
  it('blocks a retry reservation after the learner is erased during the first provider call', async () => {
    const erasedId = randomUUID()
    await query('INSERT INTO learners(id) VALUES ($1)', [erasedId])
    let retryInvoked = false
    try {
      await expect(withProviderLease(erasedId, 'qa-erased-retry', async reserveAdditional => {
        await query('DELETE FROM learners WHERE id=$1', [erasedId])
        await reserveAdditional()
        retryInvoked = true
      }, false)).rejects.toMatchObject({ status: 410, code: 'session_erased' })
      expect(retryInvoked).toBe(false)
      expect(await query('SELECT 1 FROM provider_leases WHERE learner_id=$1', [erasedId])).toHaveLength(0)
      expect(await query('SELECT 1 FROM quotas WHERE key LIKE $1', [`ai:user:${erasedId}:%`])).toHaveLength(0)
    } finally { await query('DELETE FROM learners WHERE id=$1', [erasedId]) }
  })
  it('does not invoke a provider for an erased learner', async () => {
    let invoked = false
    await expect(withProviderLease(randomUUID(), 'qa-erased', async () => { invoked = true }, false)).rejects.toMatchObject({ status: 410, code: 'session_erased' })
    expect(invoked).toBe(false)
  })
})

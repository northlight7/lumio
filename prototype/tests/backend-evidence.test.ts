import { describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
vi.mock('../src/lib/content', () => ({ CONTENT_VERSION: 'v1', getRole: () => ({}), getTask: () => ({ questions: [{ id: 'decision', type: 'select', options: [{ value: 'policy' }, { value: 'guess' }] }, { id: 'value', type: 'number' }, { id: 'checks', type: 'multi', options: [{ value: 'source' }, { value: 'calculation' }] }] }) }))
import { publicEvidence, validateAnswers } from '../src/lib/services'
import type { Attempt } from '../src/lib/types'

describe('authored decisions and shared evidence', () => {
  it('rejects unknown fields, invalid selections and incomplete submissions', () => {
    expect(() => validateAnswers('role', 'taster', { grade: 100 }, false)).toThrow('does not belong')
    expect(() => validateAnswers('role', 'taster', { decision: 'injected' }, false)).toThrow('invalid')
    expect(() => validateAnswers('role', 'taster', { decision: 'policy' }, true)).toThrow('Complete all decisions')
    expect(() => validateAnswers('role', 'taster', { decision: 'policy', value: 42, checks: ['source'] }, true)).not.toThrow()
    expect(() => validateAnswers('role', 'taster', { checks: ['source', 'source'] }, false)).toThrow('invalid')
  })
  it('exposes submitted evidence without later private draft or conversation', () => {
    const attempt = { id: 'id', roleId: 'role', stage: 'taster', locale: 'en', answers: { decision: 'private-draft' }, work: 'Private unfinished draft', revision: 9, status: 'draft', messages: [{ id: 'chat', role: 'user', persona: 'coach', content: 'Private conversation', source: 'learner', createdAt: '2026-10-09T00:00:00Z' }], submissions: [{ id: 'sub', version: 1, answers: { decision: 'policy' }, work: 'Submitted work', evaluation: { score: 100, passed: true, checks: [], rubricVersion: 'v1' }, assistance: 0, createdAt: '2026-10-08T00:00:00Z' }], createdAt: '2026-10-07T00:00:00Z', updatedAt: '2026-10-09T00:00:00Z', contentVersion: 'v1' } satisfies Attempt
    const shared = publicEvidence(attempt)
    expect(shared.work).toBe('Submitted work')
    expect(shared.answers).toEqual({ decision: 'policy' })
    expect(shared.messages).toEqual([])
    expect(shared.updatedAt).toBe('2026-10-08T00:00:00Z')
    expect(attempt.messages).toHaveLength(1)
  })
})

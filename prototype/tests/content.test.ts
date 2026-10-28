import { describe, expect, it } from 'vitest'
import { getRole, getTask, roles } from '../src/lib/content'

describe('authored curriculum contract', () => {
  it('contains twenty-five roles and preserves the original deep AI pathway', () => {
    expect(roles).toHaveLength(25)
    expect(new Set(roles.map(role => role.id)).size).toBe(25)
    expect(getRole('ai-engineer')?.tasks.map(task => task.stage)).toEqual(['taster', 'diagnose', 'fix', 'adapt', 'assessment'])
    expect(roles.filter(role => role.id !== 'ai-engineer').every(role => role.tasks.length === 1 && role.tasks[0].stage === 'taster')).toBe(true)
    expect(getRole('does-not-exist')).toBeUndefined()
    expect(getTask('data-analyst', 'assessment')).toBeUndefined()
  })

  it('has a complete bilingual brief, sources, question labels and options for every task', () => {
    for (const role of roles) {
      for (const locale of ['en', 'zh'] as const) {
        expect(role.title[locale].trim()).not.toBe('')
        expect(role.company[locale].trim()).not.toBe('')
        for (const task of role.tasks) {
          expect(task.title[locale].trim()).not.toBe('')
          expect(task.brief[locale].trim()).not.toBe('')
          expect(task.starter[locale].trim()).not.toBe('')
          expect(task.documents.length).toBeGreaterThan(0)
          for (const source of task.documents) {
            expect(source.title[locale].trim()).not.toBe('')
            expect(source.body[locale].trim()).not.toBe('')
          }
          expect(new Set(task.questions.map(question => question.id)).size).toBe(task.questions.length)
          for (const question of task.questions) {
            expect(question.label[locale].trim()).not.toBe('')
            if (question.type !== 'number') {
              expect(question.options!.length).toBeGreaterThan(1)
              expect(new Set(question.options!.map(option => option.value)).size).toBe(question.options!.length)
              expect(question.options!.every(option => option.label[locale].trim())).toBe(true)
            }
          }
        }
      }
    }
  })

  it('keeps the assessment unfamiliar and coaching off', () => {
    const task = getTask('ai-engineer', 'assessment')!
    expect(task.coaching).toBe('off')
    expect(task.documents.map(document => document.id)).not.toContain('active-policy')
    expect(task.questions.map(question => question.id)).not.toContain('refundWindowDays')
    expect(task.documents.find(document => document.id === 'warranty-current')?.body.en).toContain('collection')
    expect(task.documents.find(document => document.id === 'rainstorm-bulletin')?.body.en).toContain('Black Rainstorm')
  })
})


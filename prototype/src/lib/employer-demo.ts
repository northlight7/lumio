import type { TaskFamily } from './types'
import type { EmployerEvidence } from './employer-scoring'

export type DemoScenario = { id: string; taskId: string; rubricVersion: string; duration: number }
export type EmployerDemoCandidate = { id: string; name: string; evidence: EmployerEvidence[] }
export const EMPLOYER_DEMO_SEED = 'lumio-employer-fixtures-2026-10-13.1'
// Fictional display names belong to stable fixture IDs. They never identify real learners.
export const EMPLOYER_DEMO_NAMES = [
  'Alex Chan', 'Jordan Wong', 'Taylor Lee', 'Jamie Lam', 'Casey Cheung', 'Morgan Ho',
  'Riley Ng', 'Cameron Lau', 'Avery Choi', 'Robin Leung', 'Sophie Tan', 'Ethan Lo',
  'Chloe Ma', 'Lucas Tang', 'Grace Yip', 'Daniel Fung', 'Emily Cheng', 'Ryan Kwok',
  'Natalie Chan', 'Marcus Wong', 'Isabella Lau', 'Adrian Cheung', 'Olivia Ng', 'Oscar Lam',
  'Vivian Ho', 'Leo Choi', 'Hannah Lee', 'Aaron Yuen', 'Zoe Leung', 'Felix Mak',
  'Amelia Li', 'Nathan Chow', 'Ella Wu', 'Justin Tsang', 'Clara Wong', 'Benjamin Poon',
] as const
export const EMPLOYER_DEMO_COUNT = EMPLOYER_DEMO_NAMES.length
const seedHash = (value: string) => [...value].reduce((n, char) => Math.imul(n ^ char.charCodeAt(0), 16777619) >>> 0, 2166136261)

/** Fictional criterion awards, not an AI measurement. No source learner records are read or written. */
export function buildEmployerDemo(families: TaskFamily[], scenarios: DemoScenario[]): EmployerDemoCandidate[] {
  return Array.from({ length: EMPLOYER_DEMO_COUNT }, (_, person) => {
    // The first two share an ability fixture to exercise transparent ties.
    const ability = person === 1 ? 0 : person
    const evidence = families.flatMap(family => {
      const available = scenarios.filter(s => s.taskId === family.id && s.rubricVersion === family.rubricVersion).sort((a, b) => a.id.localeCompare(b.id)).slice(0, 3)
      const familyHash = seedHash(family.id)
      const partialFixture = person === 33 || person === 34
      if (person === 35 || (!partialFixture && person >= 28 && familyHash % 3 !== person % 3)) return []
      const count = person < 18 ? available.length : Math.min(1, available.length)
      return available.slice(0, count).flatMap((scenario, sample) => {
        const generalAbility = [.94, .94, .84, .71, .63, .89, .77, .56, .82][ability % 9]
        // Stable role strengths belong to each profile, independent of the active scorecard.
        // Different positions select different evidence, not a shuffled ranking or changed grades.
        const roleStrength = .48 + (seedHash(`${ability}:${family.roleId}:role-strength`) % 49) / 100
        const taskStrength = (seedHash(`${ability}:${family.id}:task-strength`) % 15 - 7) / 100
        const scoreBase = generalAbility * .3 + roleStrength * .7 + taskStrength
        const checks = family.criteria.map((criterion, index) => {
          const jitter = (seedHash(`${ability}:${family.id}:${criterion.id}:${sample}`) % 11 - 5) / 100
          const ratio = Math.max(0, Math.min(1, scoreBase + jitter + (ability % 3 === index % 3 ? .04 : -.02)))
          const awarded = Math.round(criterion.points * ratio)
          return { id: criterion.id, label: criterion.label, points: criterion.points, awarded, passed: awarded >= criterion.points * .7, feedback: { en: `Synthetic fixture: ${criterion.label.en} earned ${awarded}/${criterion.points}. ${awarded >= criterion.points * .85 ? 'The supplied records support the decision and verification plan.' : 'The decision needs a clearer evidence reference and acceptance check.'}`, zh: `合成測試資料：${criterion.label.zh}得分 ${awarded}/${criterion.points}。${awarded >= criterion.points * .85 ? '提供的記錄支持決策及核實計劃。' : '決策需要更清晰的證據引用及接納檢查。'}` } }
        })
        // These two profiles have genuinely absent rubric evidence, not zero or invalid awards.
        // The omissions belong to the seed, independent of selected weights or filters.
        if (partialFixture) {
          const ratio = person === 33 ? .8 : .4
          const observedCount = Math.min(family.criteria.length - 1, Math.max(1, Math.floor(family.criteria.length * ratio)))
          checks.splice(Math.max(0, observedCount))
        }
        const score = checks.reduce((sum, c) => sum + (c.awarded || 0), 0)
        const started = new Date(Date.UTC(2026, 9, 10, 8 + sample, person % 40))
        const deadline = new Date(started.getTime() + scenario.duration * 60000)
        const late = ability % 6 === 4 && sample === 0
        const received = new Date(deadline.getTime() + (late ? 120000 : -180000))
        const record: EmployerEvidence = {
          attemptId: `fixture-${person}-${scenario.id}-latest`, taskId: family.id, scenarioId: scenario.id,
          evaluation: { score, passed: score >= 70, source: 'authored', rubricVersion: family.rubricVersion, checks },
          assistance: ability % 4 === 2 ? 2 : 0, assessment: ability % 3 !== 2,
          submittedAt: received.toISOString(), timing: person % 11 === 5 ? undefined : { receivedAt: received.toISOString(), deadlineAt: deadline.toISOString(), onTime: !late, elapsedSeconds: Math.round((received.getTime() - started.getTime()) / 1000) },
        }
        // A superseded revision demonstrates that retries do not inflate the sample count.
        return person % 5 === 0 && sample === 0 ? [{ ...record, attemptId: `fixture-${person}-${scenario.id}-old`, submittedAt: new Date(received.getTime() - 60000).toISOString(), evaluation: { ...record.evaluation, score: 0, checks: checks.map(c => ({ ...c, awarded: 0, passed: false })) } }, record] : [record]
      })
    })
    return { id: `synthetic-${String(person + 1).padStart(2, '0')}`, name: EMPLOYER_DEMO_NAMES[person], evidence }
  })
}

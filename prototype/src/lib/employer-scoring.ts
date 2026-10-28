import type { Evaluation, Submission, TaskFamily, Text } from './types'

export type EmployerEvaluation = Pick<Evaluation,'checks'|'rubricVersion'|'source'> & Partial<Pick<Evaluation,'score'|'passed'>>
export type EmployerRequirement = { taskId: string; weights: Record<string, number> }
export type EmployerEvidence = { attemptId: string; taskId: string; scenarioId: string; evaluation: EmployerEvaluation; assistance: number; assessment: boolean; submittedAt: string; timing?: Submission['timing'] }
export type CriterionEvidence = { id: string; label: Text; score: number | null; weight: number; samples: number; feedback: Text[] }
export type TaskEvidence = { taskId: string; title: Text; score: number | null; observedScore: number | null; criteria: CriterionEvidence[]; samples: number; assessmentSamples: number; assistance: number; onTimeSamples:number; lateSamples:number; untimedSamples:number }
export type EmployerScore = { score: number | null; observedScore: number | null; coverage: number; observedCriteria: number; requiredCriteria: number; tasks: TaskEvidence[]; samples: number }
const rounded = (n: number) => Math.round(n * 10) / 10

function safeAwardFeedback(awarded:number|undefined,points:number):Text {
  if(awarded===undefined||!Number.isFinite(awarded)||!Number.isFinite(points)||points<=0||awarded<0||awarded>points)return {en:'No valid criterion award is available.',zh:'沒有有效的準則評分。'}
  if(awarded===points)return {en:'The recorded award meets the full criterion standard.',zh:'記錄的評分已完全達到此項準則。'}
  if(awarded>=points*0.7)return {en:'The recorded award meets most of the criterion standard.',zh:'記錄的評分已達到此項準則的大部分要求。'}
  if(awarded>0)return {en:'The recorded award shows partial criterion achievement.',zh:'記錄的評分顯示此項準則已部分達成。'}
  return {en:'The recorded award shows the criterion standard was not demonstrated.',zh:'記錄的評分顯示尚未證明已達到此項準則。'}
}
/** A consented employer receives awards, public labels and deterministic feedback only. */
export function sanitizeEmployerEvaluation(evaluation:Evaluation,family:TaskFamily|undefined):EmployerEvaluation {
  return {rubricVersion:evaluation.rubricVersion,source:evaluation.source,checks:evaluation.checks.map(check=>({
    id:check.id,points:check.points,...(check.awarded!==undefined?{awarded:check.awarded}:{}),
    label:family?.criteria.find(criterion=>criterion.id===check.id)?.label||{en:'Unrecognized criterion',zh:'未識別的準則'},
    passed:check.awarded===undefined?evaluation.source==='authored'&&check.passed===true:Number.isFinite(check.awarded)&&check.awarded>=check.points*0.7&&check.awarded<=check.points,
    feedback:safeAwardFeedback(check.awarded,check.points),
  }))}
}

function coherentEvaluation(family:TaskFamily,evaluation:EmployerEvaluation):boolean {
  if(evaluation.rubricVersion!==family.rubricVersion)return false
  const seen=new Set<string>()
  for(const check of evaluation.checks){
    const criterion=family.criteria.find(c=>c.id===check.id)
    if(!criterion||seen.has(check.id)||check.points!==criterion.points)return false
    seen.add(check.id)
    // Absent criteria/awards are unknown. A contradictory present award invalidates the record.
    if(check.awarded!==undefined&&(!Number.isFinite(check.awarded)||check.awarded<0||check.awarded>criterion.points))return false
  }
  return true
}

/** Criterion-referenced evidence. Sorting never changes absolute rubric achievement. */
export function scoreEmployerEvidence(requirements: EmployerRequirement[], families: TaskFamily[], evidence: EmployerEvidence[]): EmployerScore {
  let weighted = 0, observedWeight = 0, required = 0, observed = 0
  const countedScenarios = new Set<string>()
  const tasks = requirements.map(requirement => {
    const family = families.find(f => f.id === requirement.taskId)
    if (!family) throw new Error('Unknown task requirement')
    const latest = new Map<string, EmployerEvidence>()
    for (const item of evidence) {
      if (item.taskId !== family.id) continue
      const old = latest.get(item.scenarioId)
      if (!old || Date.parse(item.submittedAt) > Date.parse(old.submittedAt) || (Date.parse(item.submittedAt) === Date.parse(old.submittedAt) && item.attemptId.localeCompare(old.attemptId) > 0)) latest.set(item.scenarioId, item)
    }
    // Select the latest record before validation. Invalid new work cannot resurrect an older high score.
    const records = [...latest.values()].filter(record=>coherentEvaluation(family,record.evaluation))
    const validRecords = new Set<EmployerEvidence>()
    let taskWeighted = 0, taskObservedWeight = 0
    const criteria = family.criteria.filter(c => (requirement.weights[c.id] || 0) > 0).map(criterion => {
      const weight = requirement.weights[criterion.id]
      required++
      const matched = records.flatMap(record => {
        const checks = record.evaluation.checks.filter(c => c.id === criterion.id)
        if (checks.length !== 1) return []
        const check = checks[0]
        // Points and version must match. Missing/invalid partial awards are not silently guessed.
        const award = check.awarded ?? (record.evaluation.source === 'authored' ? (check.passed ? check.points : 0) : undefined)
        if (check.points !== criterion.points || award === undefined || !Number.isFinite(award) || award < 0 || award > criterion.points) return []
        countedScenarios.add(`${family.id}:${record.scenarioId}`)
        validRecords.add(record)
        return [{ score: 100 * award / criterion.points, feedback: record.evaluation.source==='authored'?check.feedback:safeAwardFeedback(award,criterion.points) }]
      })
      const score = matched.length ? matched.reduce((sum, x) => sum + x.score, 0) / matched.length : null
      if (score !== null) {
        observed++
        weighted += score * weight
        observedWeight += weight
        taskWeighted += score * weight
        taskObservedWeight += weight
      }
      return { id: criterion.id, label: criterion.label, score: score === null ? null : rounded(score), weight, samples: matched.length, feedback: matched.map(x => x.feedback) }
    })
    const observedScore = taskObservedWeight ? rounded(taskWeighted / taskObservedWeight) : null
    return { taskId: family.id, title: family.title, score: criteria.length && criteria.every(c => c.score !== null) ? observedScore : null, observedScore, criteria, samples: validRecords.size, assessmentSamples: [...validRecords].filter(r => r.assessment).length, assistance: [...validRecords].reduce((sum, r) => sum + r.assistance, 0), onTimeSamples:[...validRecords].filter(r=>r.timing?.onTime===true).length, lateSamples:[...validRecords].filter(r=>r.timing?.onTime===false).length, untimedSamples:[...validRecords].filter(r=>!r.timing).length }
  })
  const observedScore = observedWeight ? rounded(weighted / observedWeight) : null
  return { score: required && observed === required ? observedScore : null, observedScore, coverage: required ? rounded(100 * observed / required) : 0, observedCriteria: observed, requiredCriteria: required, tasks, samples: countedScenarios.size }
}

export type RankedEmployerCandidate<T> = T & { scoring: EmployerScore; rank: number | null }
/** Complete cases are ordered by fixed score. Equal displayed scores share a competition rank. */
export function rankEmployerCandidates<T extends { id: string; scoring: EmployerScore }>(candidates: T[]): RankedEmployerCandidate<T>[] {
  const ordered = [...candidates].sort((a, b) => {
    if (a.scoring.score !== null && b.scoring.score === null) return -1
    if (a.scoring.score === null && b.scoring.score !== null) return 1
    return (b.scoring.score ?? -1) - (a.scoring.score ?? -1) || b.scoring.coverage - a.scoring.coverage || a.id.localeCompare(b.id)
  })
  let previous: number | null = null, rank = 0
  return ordered.map((candidate, index) => {
    if (candidate.scoring.score === null) return { ...candidate, rank: null }
    if (candidate.scoring.score !== previous) rank = index + 1
    previous = candidate.scoring.score
    return { ...candidate, rank }
  })
}

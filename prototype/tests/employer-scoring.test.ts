import { describe, expect, it } from 'vitest'
import { rankEmployerCandidates, scoreEmployerEvidence, sanitizeEmployerEvaluation, type EmployerEvidence } from '../src/lib/employer-scoring'
import type { TaskFamily, Evaluation } from '../src/lib/types'
import { validateRequirements } from '../src/lib/employer'
import { taskFamilies } from '../src/lib/task-families'
const text = { en: 'Evidence', zh: '證據' }
const family = { id: 'task', roleId: 'role', title: text, description: text, objective: text, duration: 20, rubricVersion: 'v1', variationGuideline: text, criteria: [{ id: 'accuracy', label: text, description: text, points: 20 }, { id: 'handover', label: text, description: text, points: 10 }] } satisfies TaskFamily
function sample(id: string, accuracy: number, handover: number, time = '2026-10-11T00:00:00Z'): EmployerEvidence { return { attemptId: id, scenarioId: id, taskId: 'task', submittedAt: time, assistance: 1, assessment: false, evaluation: { rubricVersion: 'v1', score: 999, passed: true, source: 'deepseek', checks: [{ id: 'accuracy', label: text, points: 20, awarded: accuracy, passed: true, feedback: text }, { id: 'handover', label: text, points: 10, awarded: handover, passed: true, feedback: text }] } } }
const requirement = [{ taskId: 'task', weights: { accuracy: 3, handover: 1 } }]
describe('absolute employer scorecard', () => {
  it('uses criterion awards and employer weights, never overall score or pass flags', () => {
    const result = scoreEmployerEvidence(requirement, [family], [sample('a', 20, 0), sample('b', 10, 10)])
    expect(result.score).toBe(68.8)
    expect(result.coverage).toBe(100)
    expect(result.samples).toBe(2)
    expect(result.tasks[0].criteria.map(c => c.score)).toEqual([75, 50])
  })
  it('counts only latest submitted evidence per scenario and does not inflate repeat submissions', () => {
    const old = sample('same-scenario', 0, 0)
    const next = sample('same-scenario', 20, 10, '2026-10-12T00:00:00Z')
    expect(scoreEmployerEvidence(requirement, [family], [next, old])).toMatchObject({ score: 100, samples: 1 })
  })
  it('keeps unobserved criteria missing rather than scoring them as zero', () => {
    const item = sample('a', 20, 10)
    item.evaluation.checks.pop()
    const result = scoreEmployerEvidence(requirement, [family], [item])
    expect(result).toMatchObject({ score: null, observedScore: 100, observedCriteria: 1, requiredCriteria: 2, coverage: 50 })
    expect(result.tasks[0].criteria[1].score).toBeNull()
  })
  it.each(['version', 'points', 'missing-award', 'negative', 'over-maximum', 'duplicate'])('rejects incompatible or invalid %s criterion evidence', reason => {
    const item = sample('a', 20, 10)
    if (reason === 'version') item.evaluation.rubricVersion = 'v2'
    if (reason === 'points') item.evaluation.checks[0].points = 25
    if (reason === 'missing-award') delete item.evaluation.checks[0].awarded
    if (reason === 'negative') item.evaluation.checks[0].awarded = -1
    if (reason === 'over-maximum') item.evaluation.checks[0].awarded = 21
    if (reason === 'duplicate') item.evaluation.checks.push(item.evaluation.checks[0])
    expect(scoreEmployerEvidence(requirement, [family], [item]).score).toBeNull()
  })
  it('excludes zero-weight criteria and preserves a valid zero achievement score', () => {
    expect(scoreEmployerEvidence([{ taskId: 'task', weights: { accuracy: 2, handover: 0 } }], [family], [sample('a', 0, 10)])).toMatchObject({ score: 0, coverage: 100, requiredCriteria: 1 })
  })
  it('counts assessments separately from coached work and records assistance', () => {
    const assessment = sample('assessment', 20, 10)
    assessment.assessment = true
    assessment.assistance = 0
    expect(scoreEmployerEvidence(requirement, [family], [sample('practice', 10, 5), assessment]).tasks[0]).toMatchObject({ samples: 2, assessmentSamples: 1, assistance: 1 })
  })
  it('reports timeliness separately without changing rubric achievement', () => {
    const late = sample('late', 20, 10)
    late.timing = { receivedAt: '2026-10-11T00:21:00Z', deadlineAt: '2026-10-11T00:20:00Z', onTime: false, elapsedSeconds: 1260 }
    const result = scoreEmployerEvidence(requirement, [family], [late, sample('untimed', 20, 10)])
    expect(result.score).toBe(100)
    expect(result.tasks[0]).toMatchObject({ lateSamples: 1, onTimeSamples: 0, untimedSamples: 1 })
  })
  it('cannot assign fake criteria or duplicate task families', () => {
    const id = taskFamilies[0].id
    expect(() => validateRequirements([{ taskId: id, weights: { inventedSkill: 2 } }])).toThrow()
    expect(() => validateRequirements([{ taskId: id, weights: { 'domain-accuracy': 0 } }])).toThrow()
    expect(() => validateRequirements([{ taskId: id, weights: { 'domain-accuracy': 2 } }, { taskId: id, weights: { 'domain-accuracy': 2 } }])).toThrow()
  })
})

describe('evidence validity and transparent ordering',()=>{
  it('counts only scenarios with a valid selected criterion and excludes their timing/help metadata otherwise',()=>{
    const invalid=sample('bad',20,10);invalid.evaluation.checks=[];invalid.assessment=true;invalid.assistance=9;invalid.timing={receivedAt:'2026-10-11T01:00:00Z',deadlineAt:'2026-10-11T00:20:00Z',onTime:false,elapsedSeconds:3600}
    expect(scoreEmployerEvidence(requirement,[family],[invalid]).tasks[0]).toMatchObject({samples:0,assessmentSamples:0,assistance:0,lateSamples:0,untimedSamples:0})
  })
  it('latest timestamp ties resolve consistently by attempt ID, independent of input order',()=>{
    const a=sample('a',0,0),b=sample('b',20,10);a.scenarioId=b.scenarioId='shared'
    expect(scoreEmployerEvidence(requirement,[family],[a,b])).toEqual(scoreEmployerEvidence(requirement,[family],[b,a]))
    expect(scoreEmployerEvidence(requirement,[family],[a,b]).score).toBe(100)
    b.submittedAt='2026-10-10T20:00:00-04:00'
    expect(scoreEmployerEvidence(requirement,[family],[a,b])).toEqual(scoreEmployerEvidence(requirement,[family],[b,a]))
    expect(scoreEmployerEvidence(requirement,[family],[a,b]).score).toBe(100)
  })
  it('assigns equal competition ranks and leaves partial evidence unranked',()=>{
    const scoring=(accuracy:number,handover:number)=>scoreEmployerEvidence(requirement,[family],[sample('a',accuracy,handover)])
    const missing=sample('missing',20,10);missing.evaluation.checks.pop()
    const candidates=[{id:'z',scoring:scoring(20,10)},{id:'a',scoring:scoring(20,10)},{id:'b',scoring:scoring(10,10)},{id:'p',scoring:scoreEmployerEvidence(requirement,[family],[missing])}]
    expect(rankEmployerCandidates(candidates).map(c=>[c.id,c.rank])).toEqual([['a',1],['z',1],['b',3],['p',null]])
    expect(candidates[0]).not.toHaveProperty('rank')
  })
})

describe('whole-record contradiction guard',()=>{
  it('does not count the five-criterion reviewer counterexample as a valid work sample',()=>{
    const actual=taskFamilies[0]
    const record:EmployerEvidence={attemptId:'counterexample',scenarioId:'counterexample',taskId:actual.id,submittedAt:'2026-10-12T00:00:00Z',assistance:4,assessment:true,evaluation:{score:100,passed:true,source:'deepseek',rubricVersion:actual.rubricVersion,checks:actual.criteria.map((c,index)=>({id:c.id,label:c.label,points:c.points,awarded:index===0?c.points+1:c.points,passed:true,feedback:text}))}}
    const weights=Object.fromEntries(actual.criteria.map(c=>[c.id,1]))
    const result=scoreEmployerEvidence([{taskId:actual.id,weights}],[actual],[record])
    expect(result).toMatchObject({score:null,observedScore:null,samples:0,coverage:0})
    expect(result.tasks[0]).toMatchObject({samples:0,assessmentSamples:0,assistance:0,untimedSamples:0})
  })

  it.each(['max','over','negative','nan','infinity','duplicate','unknown'])('rejects the whole latest record for %s while other criterion awards are valid',reason=>{
    const old=sample('old',20,10,'2026-10-11T00:00:00Z')
    const current=sample('latest',20,10,'2026-10-12T00:00:00Z');old.scenarioId=current.scenarioId='shared'
    current.assessment=true;current.assistance=6;current.timing={receivedAt:'2026-10-12T00:21:00Z',deadlineAt:'2026-10-12T00:20:00Z',onTime:false,elapsedSeconds:1260}
    if(reason==='max')current.evaluation.checks[0].points=30
    if(reason==='over')current.evaluation.checks[0].awarded=21
    if(reason==='negative')current.evaluation.checks[0].awarded=-1
    if(reason==='nan')current.evaluation.checks[0].awarded=NaN
    if(reason==='infinity')current.evaluation.checks[0].awarded=Infinity
    if(reason==='duplicate')current.evaluation.checks.push({...current.evaluation.checks[0]})
    if(reason==='unknown')current.evaluation.checks.push({...current.evaluation.checks[0],id:'invented'})
    for(const rows of [[old,current],[current,old]]){
      const result=scoreEmployerEvidence(requirement,[family],rows)
      expect(result).toMatchObject({score:null,observedScore:null,samples:0,coverage:0})
      expect(result.tasks[0]).toMatchObject({samples:0,assessmentSamples:0,assistance:0,lateSamples:0,onTimeSamples:0,untimedSamples:0})
      expect(rankEmployerCandidates([{id:'candidate',scoring:result}])[0].rank).toBeNull()
    }
  })
  it('rejects contradiction in an excluded criterion rather than hiding it behind a zero weight',()=>{
    const item=sample('bad',21,10)
    expect(scoreEmployerEvidence([{taskId:'task',weights:{accuracy:0,handover:1}}],[family],[item])).toMatchObject({score:null,observedScore:null,samples:0})
  })
  it('does not fall back to an older compatible rubric when the latest scenario uses another version',()=>{
    const old=sample('old',20,10,'2026-10-11T00:00:00Z'),current=sample('new',20,10,'2026-10-12T00:00:00Z');old.scenarioId=current.scenarioId='same';current.evaluation.rubricVersion='other'
    expect(scoreEmployerEvidence(requirement,[family],[old,current])).toMatchObject({score:null,observedScore:null,samples:0})
  })
  it('keeps an actually missing criterion partial without replacing it with an old award',()=>{
    const old=sample('old',0,10,'2026-10-11T00:00:00Z'),current=sample('new',20,10,'2026-10-12T00:00:00Z');old.scenarioId=current.scenarioId='same';current.evaluation.checks.pop()
    const result=scoreEmployerEvidence(requirement,[family],[old,current])
    expect(result).toMatchObject({score:null,observedScore:100,samples:1,coverage:50})
    expect(result.tasks[0].criteria.map(c=>c.score)).toEqual([100,null])
  })
})

describe('consented employer evaluation privacy boundary',()=>{
  it('discloses only awards, canonical labels and deterministic feedback without grading narratives',()=>{
    const value=sample('privacy',20,5).evaluation as Evaluation
    const marker={en:'PRIVATE_HOLDOUT_NARRATIVE',zh:'PRIVATE_HOLDOUT_NARRATIVE'}
    value.summary=marker;value.nextSteps=marker;value.model='PRIVATE_HOLDOUT_NARRATIVE';value.gradedAt='PRIVATE_HOLDOUT_NARRATIVE'
    value.simulations=[{id:'simulation',label:marker,actual:'PRIVATE_HOLDOUT_NARRATIVE',expected:'PRIVATE_HOLDOUT_NARRATIVE',passed:true}]
    for(const check of value.checks){check.label=marker;check.feedback=marker}
    const safe=sanitizeEmployerEvaluation(value,family)
    expect(Object.keys(safe).sort()).toEqual(['checks','rubricVersion','source'])
    expect(JSON.stringify(safe)).not.toContain('PRIVATE_HOLDOUT_NARRATIVE')
    expect(safe.checks[0].label).toEqual(family.criteria[0].label)
    expect(safe.checks.map(c=>c.awarded)).toEqual([20,5])
    const scoring=scoreEmployerEvidence(requirement,[family],[{...sample('privacy',20,5),evaluation:safe}])
    expect(scoring.score).toBe(87.5)
    expect(JSON.stringify(scoring)).not.toContain('PRIVATE_HOLDOUT_NARRATIVE')
    // Defense in depth: direct real DeepSeek inputs cannot leak narratives into scorecard feedback either.
    expect(JSON.stringify(scoreEmployerEvidence(requirement,[family],[{...sample('privacy',20,5),evaluation:value}]))).not.toContain('PRIVATE_HOLDOUT_NARRATIVE')
  })
  it.each(['duplicate','unknown','bad-award','missing-criterion'])('preserves %s integrity instead of filtering or repairing evidence',reason=>{
    const value=sample('privacy',20,10).evaluation as Evaluation
    if(reason==='duplicate')value.checks.push({...value.checks[0]})
    if(reason==='unknown')value.checks.push({...value.checks[0],id:'unknown'})
    if(reason==='bad-award')value.checks[0].awarded=21
    if(reason==='missing-criterion')value.checks.pop()
    const safe=sanitizeEmployerEvaluation(value,family)
    expect(safe.checks.map(c=>[c.id,c.points,c.awarded])).toEqual(value.checks.map(c=>[c.id,c.points,c.awarded]))
    const score=scoreEmployerEvidence(requirement,[family],[{...sample('privacy',20,10),evaluation:safe}])
    expect(score.score).toBeNull()
    expect(score.coverage).toBe(reason==='missing-criterion'?50:0)
  })
})

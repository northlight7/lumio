import { describe, expect, it } from 'vitest'
import { buildEmployerDemo, EMPLOYER_DEMO_COUNT } from '../src/lib/employer-demo'
import { rankEmployerCandidates, scoreEmployerEvidence } from '../src/lib/employer-scoring'
import { taskFamilies } from '../src/lib/task-families'
const families=taskFamilies.slice(0,3)
const scenarios=families.flatMap(f=>[0,1].map(i=>({id:`published-${f.id}-${i}`,taskId:f.id,rubricVersion:f.rubricVersion,duration:f.duration})))
const requirements=families.map(f=>({taskId:f.id,weights:Object.fromEntries(f.criteria.map(c=>[c.id,1]))}))
describe('isolated stable employer seed fixtures',()=>{
  it('supplies36 stable fictional profiles and never mutates source families or records',()=>{
    const before=JSON.stringify({families,scenarios});const candidates=buildEmployerDemo(families,scenarios)
    expect(candidates).toHaveLength(EMPLOYER_DEMO_COUNT);expect(new Set(candidates.map(c=>c.id)).size).toBe(36)
    expect(new Set(candidates.map(c=>c.name)).size).toBe(36)
    expect(candidates.every(c=>/^[A-Z][a-z]+ [A-Z][a-z]+$/.test(c.name))).toBe(true)
    expect(candidates.find(c=>c.id==='synthetic-19')?.name).toBe('Natalie Chan')
    expect(candidates.find(c=>c.id==='synthetic-21')?.name).toBe('Isabella Lau')
    expect(candidates.find(c=>c.id==='synthetic-11')?.name).toBe('Sophie Tan')
    expect(JSON.stringify({families,scenarios})).toBe(before)
  })
  it('uses supplied source IDs and rubric versions, and excludes incompatible/unavailable cases',()=>{
    const candidates=buildEmployerDemo(families,[...scenarios,{...scenarios[0],id:'stale',rubricVersion:'wrong'}])
    for(const c of candidates)for(const e of c.evidence){expect(scenarios.some(s=>s.id===e.scenarioId&&s.rubricVersion===e.evaluation.rubricVersion)).toBe(true);expect(e.evaluation.source).toBe('authored');expect(e.evaluation.checks.every(check=>check.feedback.en.startsWith('Synthetic fixture:'))).toBe(true)}
    expect(buildEmployerDemo(families,[]).every(c=>c.evidence.length===0)).toBe(true)
  })
  it('keeps identical evidence on repeat loads and task subset changes',()=>{
    const all=buildEmployerDemo(families,scenarios),subset=buildEmployerDemo(families.slice(0,1),scenarios)
    expect(buildEmployerDemo(families,scenarios)).toEqual(all)
    for(let i=0;i<all.length;i++){expect(subset[i].name).toBe(all[i].name);expect(subset[i].evidence).toEqual(all[i].evidence.filter(e=>e.taskId===families[0].id))}
  })
  it('includes stable80%and40% partial profiles for the default three tasks, with real positive observed awards',()=>{
    const generated=buildEmployerDemo(families,scenarios)
    const weighted=requirements.map(r=>({...r,weights:Object.fromEntries(Object.keys(r.weights).map((id,i)=>[id,i===0?10:1]))}))
    for(const [id,coverage,observed] of [['synthetic-34',80,12],['synthetic-35',40,6]] as const){
      const candidate=generated.find(c=>c.id===id)!
      const before=JSON.stringify(candidate.evidence)
      const score=scoreEmployerEvidence(requirements,families,candidate.evidence)
      expect(score).toMatchObject({score:null,coverage,observedCriteria:observed,requiredCriteria:15,samples:3})
      expect(score.observedScore).toBeGreaterThan(0)
      expect(rankEmployerCandidates([{id,scoring:score}])[0].rank).toBeNull()
      expect(score.tasks.every(task=>task.samples===1&&task.criteria.some(c=>c.score===null)&&task.criteria.some(c=>c.score!==null))).toBe(true)
      for(const evidence of candidate.evidence)for(const check of evidence.evaluation.checks){expect(check.awarded).toBeGreaterThanOrEqual(0);expect(check.awarded).toBeLessThanOrEqual(check.points);expect(scenarios.some(s=>s.id===evidence.scenarioId)).toBe(true)}
      const changed=scoreEmployerEvidence(weighted,families,candidate.evidence)
      expect(changed.score).toBeNull();expect(changed.coverage).toBe(coverage)
      expect(changed.observedScore).not.toBe(score.observedScore)
      expect(JSON.stringify(candidate.evidence)).toBe(before)
      for(const family of families){
        const subset=buildEmployerDemo([family],scenarios).find(c=>c.id===id)!
        expect(subset.evidence).toEqual(candidate.evidence.filter(e=>e.taskId===family.id))
        const one=scoreEmployerEvidence(requirements.filter(r=>r.taskId===family.id),[family],subset.evidence)
        expect(one).toMatchObject({score:null,coverage,samples:1})
        expect(one.observedScore).toBeGreaterThan(0)
      }
    }
    expect(generated.find(c=>c.id==='synthetic-36')?.evidence).toHaveLength(0)
  })
  it('calculates seed ordering from absolute criterion awards, with ties and unranked missing work',()=>{
    const candidates=buildEmployerDemo(families,scenarios).map(c=>({...c,scoring:scoreEmployerEvidence(requirements,families,c.evidence)}))
    const ranked=rankEmployerCandidates(candidates)
    expect(ranked.filter(c=>c.rank===null).length).toBeGreaterThan(0)
    expect(ranked.find(c=>c.id==='synthetic-01')?.rank).toBe(ranked.find(c=>c.id==='synthetic-02')?.rank)
    const before=JSON.stringify(candidates.map(c=>c.evidence));const newWeights=requirements.map(r=>({...r,weights:Object.fromEntries(Object.keys(r.weights).map((id,i)=>[id,i===0?10:1]))}))
    const weighted=candidates.map(c=>({...c,scoring:scoreEmployerEvidence(newWeights,families,c.evidence)}))
    expect(weighted.some((c,i)=>c.scoring.score!==candidates[i].scoring.score)).toBe(true)
    expect(JSON.stringify(candidates.map(c=>c.evidence))).toBe(before)
    expect(candidates.some(c=>c.scoring.tasks.some(t=>t.lateSamples>0))).toBe(true)
    expect(candidates.some(c=>c.scoring.tasks.some(t=>t.assistance>0))).toBe(true)
  })
  it('gives distinct positions distinct rankings while preserving candidate identities and repeatable evidence',()=>{
    const roles=[...new Set(taskFamilies.map(f=>f.roleId))]
    const signatures=roles.map(roleId=>{
      const selected=taskFamilies.filter(f=>f.roleId===roleId).slice(0,3)
      const published=selected.flatMap(f=>[0,1].map(i=>({id:`published-${f.id}-${i}`,taskId:f.id,rubricVersion:f.rubricVersion,duration:f.duration})))
      const priorities=selected.map(f=>({taskId:f.id,weights:Object.fromEntries(f.criteria.map(c=>[c.id,1]))}))
      const profiles=buildEmployerDemo(selected,published)
      expect(profiles.map(c=>c.id)).toEqual(buildEmployerDemo(families,scenarios).map(c=>c.id))
      expect(buildEmployerDemo(selected,published)).toEqual(profiles)
      const ranked=rankEmployerCandidates(profiles.map(c=>({...c,scoring:scoreEmployerEvidence(priorities,selected,c.evidence)})))
      expect(ranked.find(c=>c.id==='synthetic-01')?.rank).toBe(ranked.find(c=>c.id==='synthetic-02')?.rank)
      return ranked.filter(c=>c.rank!==null).map(c=>c.id).join(',')
    })
    expect(new Set(signatures).size).toBe(roles.length)
  })
})

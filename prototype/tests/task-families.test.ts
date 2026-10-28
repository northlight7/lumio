import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { roles } from '../src/lib/content'
import { getTaskFamily, getTaskFamilies, taskFamilies } from '../src/lib/task-families'
import { normalizeOptionIdentifiers, reviewFamilyContrast, solvePublicTask, validateGrade, validateVariant, type GeneratedVariant } from '../src/lib/ai-curriculum'

function familyFixture(): GeneratedVariant {
  const bank = JSON.parse(readFileSync(resolve(process.cwd(),'curriculum/company-catalog.json'),'utf8')) as {variants:GeneratedVariant[]}
  const variant = structuredClone(bank.variants.find(v=>v.roleId==='data-analyst' && v.stage==='taster')!)
  const family=getTaskFamilies('data-analyst')[0]
  delete variant.demoEvaluation
  delete variant.demoPoorSample
  variant.taskId=variant.task.taskId=family.id
  variant.task.rubricVersion=family.rubricVersion
  variant.task.criteria=structuredClone(family.criteria)
  variant.rubric.criteria=family.criteria.map((criterion,index)=>({...criterion,expectedEvidence:{en:'Use supplied case sources to justify this decision.',zh:'引用已提供個案文件，支持這項決策。'},...(index===0 ? {critical:true} : {})}))
  variant.provenance.promptVersion=variant.task.generation!.promptVersion='lumio-generated-2026-10-10.family.1'
  return variant
}
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs()})
describe('distinct task families and stable assessment contracts',()=>{
  it('offers at least two genuinely distinct tasks for every one of twenty-five roles',()=>{
    expect(roles).toHaveLength(25)
    expect(taskFamilies).toHaveLength(138)
    expect(new Set(taskFamilies.map(f=>f.id)).size).toBe(taskFamilies.length)
    for (const role of roles) {
      const families=getTaskFamilies(role.id)
      expect(families.length,role.id).toBeGreaterThanOrEqual(2)
      expect(new Set(families.map(f=>f.title.en)).size).toBe(families.length)
      expect(new Set(families.map(f=>f.objective.en)).size).toBe(families.length)
      for (const family of families) {
        expect(getTaskFamily(role.id,family.id)).toEqual(family)
        expect(family.criteria.reduce((n,c)=>n+c.points,0)).toBe(100)
        expect(family.criteria.length).toBeGreaterThanOrEqual(4)
        expect(family.criteria.length).toBeLessThanOrEqual(6)
        expect(new Set(family.criteria.map(c=>c.id)).size).toBe(family.criteria.length)
        expect(family.variationGuideline.en.length).toBeGreaterThan(30)
        expect(family.rubricVersion.length).toBeGreaterThan(5)
        expect(JSON.stringify(family)).not.toMatch(/"(?:expectedAnswers|expectedEvidence|exemplar|critical)":/)
        for (const locale of ['en','zh'] as const) expect([family.title[locale],family.description[locale],family.objective[locale],family.variationGuideline[locale]].every(v=>v.trim().length)).toBe(true)
      }
    }
    expect(getTaskFamily('ux-designer',getTaskFamilies('data-analyst')[0].id)).toBeUndefined()
  })
  it('keeps old immutable snapshots valid and validates new family metadata',()=>{
    const variant=familyFixture()
    expect(validateVariant(variant)).toEqual(variant)
    const mismatch=structuredClone(variant)
    mismatch.taskId=getTaskFamilies('ux-designer')[0].id
    expect(()=>validateVariant(mismatch)).toThrow('task family metadata mismatch')
    const roleMismatch=structuredClone(variant)
    roleMismatch.taskId=roleMismatch.task.taskId=getTaskFamilies('ux-designer')[0].id
    expect(()=>validateVariant(roleMismatch)).toThrow('unknown task family')
    const missing=structuredClone(variant)
    delete missing.taskId
    delete missing.task.taskId
    delete missing.task.rubricVersion
    expect(()=>validateVariant(missing)).toThrow('task family missing')
  })
  it('accepts company-free core snapshots while rejecting an employer attached to core practice',()=>{
    const variant=structuredClone(JSON.parse(readFileSync(resolve(process.cwd(),'curriculum/core-catalog.json'),'utf8')).variants.find((v:GeneratedVariant)=>v.roleId==='core-manufacturing-analyst')) as GeneratedVariant
    const employer=familyFixture().task.company
    expect(validateVariant(variant)).toEqual(variant)
    variant.task.company=employer
    expect(()=>validateVariant(variant)).toThrow('company and role mismatch')
  })
  it('records the identical stable rubric version across different scenarios of one task',()=>{
    const first=familyFixture()
    const second=structuredClone(first)
    second.id=second.task.generation!.variantId='52023542-4f43-41c5-84c0-cd83f1e336a'
    second.variation=second.task.generation!.variation=2
    const grade={criteria:first.rubric.criteria.map(c=>({id:c.id,awarded:c.points,feedback:{en:'The evidence supports this decision.',zh:'證據支持這項決策。'}})),summary:{en:'The work is complete.',zh:'工作完整。'},nextSteps:{en:'Try another case.',zh:'嘗試另一個案。'}}
    expect(validateGrade(first,grade,first.rubric.exemplar.en).rubricVersion).toBe(first.task.rubricVersion)
    expect(validateGrade(second,grade,second.rubric.exemplar.en).rubricVersion).toBe(first.task.rubricVersion)
  })
  it('binds cosmetic choice identifiers bijectively without changing labels or meaning',()=>{
    const label={en:'HTTP 200',zh:'HTTP 200'}
    const questions=[{id:'status',type:'select',options:[{value:'200',label},{value:'choice-1-normalized',label:{en:'Other',zh:'其他'}},{value:'Bad_Request',label:{en:'HTTP 400',zh:'HTTP 400'}}]}]
    const answers={status:'200'}
    const normalized=normalizeOptionIdentifiers(questions,answers) as typeof questions
    expect(normalized[0].options[0].label).toEqual(label)
    expect(normalized[0].options.map(o=>o.value)).toEqual(['choice-1-normalized-1','choice-1-normalized','choice-3-normalized'])
    expect(answers.status).toBe('choice-1-normalized-1')
    expect(questions[0].options[0].value).toBe('200')
    expect(()=>normalizeOptionIdentifiers([{id:'status',type:'select',options:[{value:'same'},{value:'same'}]}],{status:'same'})).toThrow('ambiguous or duplicated')
    expect(()=>normalizeOptionIdentifiers(questions,{status:'not-an-option'})).toThrow('does not match')
  })
  it('solves using public task evidence without transmitting a private rubric or exemplar',async()=>{
    vi.stubEnv('DEEPSEEK_API_KEY','test-key')
    vi.stubEnv('DEEPSEEK_API_KEY_FILE','')
    const variant=familyFixture()
    const answer={answers:variant.rubric.expectedAnswers,work:{en:'The supplied public records support this decision. I would verify the remaining missing observations and limit the recommendation to this fictional scenario.',zh:'提供的公開記錄支持這項決策。我會核實其餘欠缺觀察，把建議限於此虛構情境，並向負責人說明計算、不確定性及下一步。'}}
    const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(answer)}}]})))
    vi.stubGlobal('fetch',fetch)
    expect(await solvePublicTask(variant.task)).toEqual(answer)
    const sent=JSON.parse(fetch.mock.calls[0][1].body)
    expect(JSON.parse(sent.messages[1].content)).toEqual({publicTask:variant.task})
    expect(sent.messages[1].content).not.toMatch(/"(?:expectedAnswers|expectedEvidence|exemplar|critical)"\s*:/)
  })
  it('reviews actual public scenario contrast without sending private answer keys',async()=>{
    vi.stubEnv('DEEPSEEK_API_KEY','test-key')
    vi.stubEnv('DEEPSEEK_API_KEY_FILE','')
    const first=familyFixture()
    const second=structuredClone(first)
    second.id=second.task.generation!.variantId='52023542-4f43-41c5-84c0-cd83f1e336a'
    const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({approved:false,issues:['The source evidence changes only names while keeping all facts and answers identical.']})}}]})))
    vi.stubGlobal('fetch',fetch)
    expect(await reviewFamilyContrast(first,second)).toEqual(['The source evidence changes only names while keeping all facts and answers identical.'])
    const payload=JSON.parse(fetch.mock.calls[0][1].body)
    expect(payload.messages[1].content).not.toMatch(/expectedAnswers|expectedEvidence|exemplar|critical/)
    const comparison=JSON.parse(payload.messages[1].content)
    expect(comparison.first.documents).toEqual(first.task.documents)
    expect(comparison.family.criteria).toEqual(first.task.criteria)
    expect(comparison.family).not.toHaveProperty('variationGuideline')
  })
  it('rejects unrelated family scenarios before spending a provider call',async()=>{
    const first=familyFixture()
    const second=structuredClone(first)
    second.taskId=getTaskFamilies('data-analyst')[1].id
    const fetch=vi.fn()
    vi.stubGlobal('fetch',fetch)
    expect((await reviewFamilyContrast(first,second))[0]).toContain('share one task family')
    expect(fetch).not.toHaveBeenCalled()
  })
  it('rejects changed criterion points, labels, descriptions, versions and critical gates',()=>{
    const fixture=familyFixture()
    for (const mutation of [
      (v:GeneratedVariant)=>{v.task.criteria![0].points-=5;v.task.criteria![1].points+=5},
      (v:GeneratedVariant)=>{v.task.criteria![0].label.en='Altered rubric'},
      (v:GeneratedVariant)=>{v.task.criteria![0].description.zh='不同評估要求'},
      (v:GeneratedVariant)=>{v.task.rubricVersion='unreviewed-version'},
    ]) {
      const variant=structuredClone(fixture)
      mutation(variant)
      expect(()=>validateVariant(variant)).toThrow('stable task rubric drift')
    }
    const gate=structuredClone(fixture)
    delete gate.rubric.criteria[0].critical
    expect(()=>validateVariant(gate)).toThrow('stable task critical gate drift')
    const privateDrift=structuredClone(fixture)
    privateDrift.rubric.criteria[0].points-=5
    privateDrift.rubric.criteria[1].points+=5
    expect(()=>validateVariant(privateDrift)).toThrow('public rubric mismatch')
  })
})

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { validateVariant, type GeneratedVariant } from '../src/lib/ai-curriculum'
import { coreRoles } from '../src/lib/core-roles'
import { getTaskFamilies } from '../src/lib/task-families'

const bank=JSON.parse(readFileSync(resolve(process.cwd(),'curriculum/core-catalog.json'),'utf8')) as {variants:GeneratedVariant[]}

describe('published core industry bank',()=>{
  it('contains two reviewed scenarios for each of six distinct task families',()=>{
    expect(bank.variants).toHaveLength(12)
    expect(new Set(bank.variants.map(variant=>variant.id)).size).toBe(12)
    for(const role of coreRoles){
      for(const family of getTaskFamilies(role.id).filter(family=>bank.variants.some(variant=>variant.taskId===family.id))){
        const pair=bank.variants.filter(variant=>variant.taskId===family.id).sort((a,b)=>a.variation-b.variation)
        expect(pair.map(variant=>variant.variation)).toEqual([1,2])
        for(const variant of pair){
          expect(validateVariant(variant)).toEqual(variant)
          expect(variant.task.company).toBeUndefined()
          expect(variant.task.criteria).toEqual(family.criteria)
          expect(variant.task.rubricVersion).toBe(family.rubricVersion)
          expect(variant.demoEvaluation?.score).toBeGreaterThanOrEqual(85)
          expect(variant.demoEvaluation?.passed).toBe(true)
        }
        expect(pair[0].task.documents.map(document=>document.body.en)).not.toEqual(pair[1].task.documents.map(document=>document.body.en))
        expect(pair[0].rubric.expectedAnswers).not.toEqual(pair[1].rubric.expectedAnswers)
      }
    }
  })

  it('supplies input-only cash reconciliation files that require a learner result',()=>{
    for(const variant of bank.variants.filter(variant=>variant.taskId?.endsWith('bank-reconciliation'))){
      for(const locale of ['en','zh'] as const){
        const blocks=variant.task.documents.flatMap(document=>[...document.body[locale].matchAll(/```csv\s*\n([\s\S]*?)```/g)].map(match=>match[1]))
        expect(blocks).toHaveLength(1)
        expect(blocks[0].trim().split('\n')).toHaveLength(4)
        expect(blocks[0]).not.toMatch(/,result\s*$|,compare\s*$/m)
      }
    }
  })

  it('defines the planned participant total before assessing a minimum completion count',()=>{
    for(const variant of bank.variants.filter(variant=>variant.taskId?.endsWith('research-experiment'))){
      expect(variant.task.documents.map(document=>document.body.en).join('\n')).toContain('exactly the maximum')
    }
  })
})

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { validateVariant, type GeneratedVariant } from '../src/lib/ai-curriculum'
import { roles } from '../src/lib/content'
import { expansionTaskFamilies } from '../src/lib/expansion-task-families'
import { baselineTaskFamilies, getTaskFamily } from '../src/lib/task-families'
import { parse as parseCsv } from 'csv-parse/sync'

const bank = JSON.parse(readFileSync(resolve(process.cwd(),'curriculum/expansion-catalog.json'),'utf8')) as {variants:GeneratedVariant[]}

describe('additional workplace competencies',()=>{
  it('adds exactly three distinct new task types to every role with fresh assessment identities',()=>{
    expect(expansionTaskFamilies).toHaveLength(75)
    const oldIds=new Set(baselineTaskFamilies.map(f=>f.id))
    expect(new Set(expansionTaskFamilies.map(f=>f.id)).size).toBe(75)
    for(const role of roles){
      const families=expansionTaskFamilies.filter(f=>f.roleId===role.id)
      expect(families,role.id).toHaveLength(3)
      expect(new Set(families.map(f=>f.objective.en)).size).toBe(3)
      for(const family of families){
        expect(oldIds.has(family.id)).toBe(false)
        expect(family.criteria.reduce((total,c)=>total+c.points,0)).toBe(100)
        expect(family.rubricVersion).toBe(`lumio-family-2026-10-12.1:${family.id}`)
        expect(JSON.stringify(family)).not.toMatch(/"(?:expectedAnswers|expectedEvidence|exemplar|critical)":/)
      }
    }
  })

  it('keeps provider implementation names out of learner-facing task content and feedback',()=>{
    for(const variant of bank.variants){
      const {generation:_generation,...task}=variant.task
      const evaluation=variant.demoEvaluation
      const feedback=evaluation?{checks:evaluation.checks,summary:evaluation.summary,nextSteps:evaluation.nextSteps}:undefined
      expect(JSON.stringify({task,feedback}),variant.id).not.toMatch(/deepseek/i)
    }
  })

  it('publishes two reviewed bilingual cases per additional task under an identical fixed rubric',()=>{
    expect(bank.variants).toHaveLength(150)
    expect(new Set(bank.variants.map(v=>v.id)).size).toBe(150)
    for(const family of expansionTaskFamilies){
      const pair=bank.variants.filter(v=>v.taskId===family.id).sort((a,b)=>a.variation-b.variation)
      expect(pair.map(v=>v.variation),family.id).toEqual([1,2])
      for(const variant of pair){
        expect(validateVariant(variant)).toEqual(variant)
        expect(getTaskFamily(variant.roleId,variant.taskId!)).toEqual(family)
        expect(variant.task.criteria).toEqual(family.criteria)
        expect(variant.task.rubricVersion).toBe(family.rubricVersion)
        expect(variant.demoEvaluation?.score).toBeGreaterThanOrEqual(85)
        expect(variant.demoEvaluation?.passed).toBe(true)
        for(const locale of ['en','zh'] as const){
          for(const doc of variant.task.documents){
            for(const match of doc.body[locale].matchAll(/```csv\s*\n([\s\S]*?)```/g)){
              const rows=parseCsv(match[1],{skip_empty_lines:true}) as string[][]
              expect(rows.length).toBeGreaterThan(1)
              expect(new Set(rows.map(row=>row.length)).size).toBe(1)
            }
          }
          if(variant.roleId.startsWith('core-'))expect(variant.task.documents.some(d=>/```csv\s*\n/.test(d.body[locale]))).toBe(true)
        }
      }
      expect(pair[0].task.documents.map(d=>d.body.en)).not.toEqual(pair[1].task.documents.map(d=>d.body.en))
    }
  })
})

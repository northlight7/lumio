import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { query } from '../src/lib/db'
import { chooseVariant, listVariations } from '../src/lib/variant-store'
import type { GeneratedVariant } from '../src/lib/ai-curriculum'
import { validateVariant } from '../src/lib/ai-curriculum'

vi.mock('../src/lib/db', () => ({ query: vi.fn() }))
const db=vi.mocked(query)
const fixture=JSON.parse(readFileSync(resolve(process.cwd(),'curriculum/core-catalog.json'),'utf8')).variants[0] as GeneratedVariant

beforeEach(()=>db.mockReset())
describe('core practice catalog selection',()=>{
  it('rejects missing, one-locale-only and malformed downloadable data before publication',()=>{
    for(const locale of ['en','zh'] as const){
      const missing=structuredClone(fixture)
      for(const document of missing.task.documents)document.body[locale]=document.body[locale].replace(/```csv[\s\S]*?```/gi,'Data described in prose only.')
      expect(()=>validateVariant(missing)).toThrow('downloadable CSV')
    }
    const malformed=structuredClone(fixture)
    malformed.task.documents[0].body.en+='\n```csv\nfirst,second\nonly-one-field\n```'
    expect(()=>validateVariant(malformed)).toThrow('structurally valid')
  })
  it('lists company-free core cases without exposing assessment answers',async()=>{
    db.mockResolvedValueOnce([{id:fixture.id,role_id:fixture.roleId,stage:fixture.stage,task_id:fixture.taskId,variation:fixture.variation,snapshot:fixture}])
    const result=await listVariations(fixture.roleId,fixture.stage,fixture.taskId)
    expect(result.variations[0].id).toBe(fixture.id)
    expect(result.variations[0].taskId).toBe(fixture.taskId)
    expect(db.mock.calls[0][1]).toEqual([fixture.roleId,fixture.stage,fixture.taskId,true])
    expect(JSON.stringify(result)).not.toMatch(/expectedAnswers|expectedEvidence|exemplar/)
  })

  it('resumes an existing core attempt instead of generating another assignment',async()=>{
    db.mockResolvedValueOnce([{variant_id:fixture.id}])
    db.mockResolvedValueOnce([{snapshot:fixture,presentation:{},retired_at:null}])
    expect((await chooseVariant('learner-id',fixture.roleId,fixture.stage,false,undefined,fixture.taskId)).id).toBe(fixture.id)
    expect(db).toHaveBeenCalledTimes(2)
    expect(db.mock.calls[0][1]?.at(-1)).toBe(true)
  })

  it('selects unused core practice from the accepted bank before requesting AI authoring',async()=>{
    db.mockResolvedValueOnce([{id:fixture.id}])
    db.mockResolvedValueOnce([{snapshot:fixture,presentation:{},retired_at:null}])
    expect((await chooseVariant('learner-id',fixture.roleId,fixture.stage,true,undefined,fixture.taskId)).id).toBe(fixture.id)
    expect(db).toHaveBeenCalledTimes(2)
    expect(db.mock.calls[0][1]?.at(-1)).toBe(true)
  })

  it('retains the company-snapshot filter for real-company careers',async()=>{
    db.mockResolvedValueOnce([])
    await listVariations('data-analyst','taster')
    expect(db.mock.calls[0][1]?.at(-1)).toBe(false)
  })
})

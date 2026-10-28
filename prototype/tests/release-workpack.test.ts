import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parse as parseCsv } from 'csv-parse/sync'
import { buildWorkMaterials, zipFiles, assertPublicationWorkMaterials } from '../src/lib/work-materials'
import { expansionTaskFamilies } from '../src/lib/expansion-task-families'
import type { GeneratedVariant } from '../src/lib/ai-curriculum'
import type { Task } from '../src/lib/types'
const require=createRequire(import.meta.url)
const yauzl=require('yauzl')
const {extract}=require('../scripts/parse-attachment.cjs')
const bank=JSON.parse(readFileSync('curriculum/expansion-catalog.json','utf8')).variants as GeneratedVariant[]
const representatives=expansionTaskFamilies.flatMap(family=>{
  const sample=bank.filter(v=>v.taskId===family.id).sort((a,b)=>a.variation-b.variation)[0]
  return sample?[sample]:[]
})
async function archiveEntries(bytes:Buffer):Promise<Map<string,Buffer>>{
  return new Promise((resolve,reject)=>yauzl.fromBuffer(bytes,{lazyEntries:true},(error:Error|null,archive:any)=>{
    if(error)return reject(error)
    const entries=new Map<string,Buffer>()
    archive.on('error',reject)
    archive.on('end',()=>resolve(entries))
    archive.on('entry',(entry:any)=>{
      if(entry.uncompressedSize>8*1024*1024||entries.has(entry.fileName))return reject(Error('Oversized or duplicate archive member'))
      archive.openReadStream(entry,(failure:Error|null,stream:any)=>{
        if(failure)return reject(failure)
        const chunks:Buffer[]=[]
        stream.on('data',(chunk:Buffer)=>chunks.push(chunk))
        stream.on('error',reject)
        stream.on('end',()=>{entries.set(entry.fileName,Buffer.concat(chunks));archive.readEntry()})
      })
    })
    archive.readEntry()
  }))
}
const poisonedTask=(task:Task):Task=>{
  const copy=structuredClone(task) as Task & Record<string,unknown>
  Object.assign(copy,{privateRubric:'PRIVATE_PACK_TOP',rubric:{expectedAnswers:'PRIVATE_PACK_ANSWERS',expectedEvidence:'PRIVATE_PACK_EVIDENCE',exemplar:'PRIVATE_PACK_EXEMPLAR'},demoEvaluation:'PRIVATE_PACK_GRADE',demoPoorSample:'PRIVATE_PACK_POOR'})
  for(const doc of copy.documents)Object.assign(doc,{privateNotes:'PRIVATE_PACK_DOCUMENT'})
  for(const question of copy.questions){
    Object.assign(question,{expectedAnswer:'PRIVATE_PACK_QUESTION'})
    for(const option of question.options||[])Object.assign(option,{correct:true,privateExplanation:'PRIVATE_PACK_OPTION'})
  }
  return copy
}

describe('independent public workpack release checks',()=>{
  it('validates every selected case public pack with the runtime publication gate',()=>{
    for(const variant of bank)expect(()=>assertPublicationWorkMaterials(variant.task),variant.id).not.toThrow()
  })
  it.skipIf(bank.length!==150)('covers one representative of all75 additional task families after final publication',()=>{
    expect(representatives).toHaveLength(75)
    expect(new Set(representatives.map(v=>v.taskId))).toEqual(new Set(expansionTaskFamilies.map(f=>f.id)))
  })
  for(const variant of representatives){
    it(`${variant.taskId}: bilingual archive retains public sources and excludes private grading data`,async()=>{
      for(const locale of ['en','zh'] as const){
        const files=buildWorkMaterials(poisonedTask(variant.task),locale)
        expect(new Set(files.map(file=>file.fileName)).size).toBe(files.length)
        const zipped=await archiveEntries(zipFiles(files))
        expect(zipped.size).toBe(files.length)
        for(const file of files){
          expect(file.fileName).not.toMatch(/[/\\]|\.\./)
          expect(zipped.get(file.fileName)).toEqual(file.bytes)
          expect(file.bytes.toString()).not.toContain('PRIVATE_PACK_')
          expect(file.bytes.toString()).not.toMatch(/"(?:expectedAnswers|expectedEvidence|demoEvaluation|demoPoorSample|privateRubric)"\s*:/)
          if(file.format==='csv'){
            const rows=parseCsv(file.bytes,{skip_empty_lines:true}) as string[][]
            expect(rows.length).toBeGreaterThan(1)
            expect(new Set(rows.map(row=>row.length)).size).toBe(1)
            for(const row of rows)for(const cell of row)expect(/^\s*[=+@]/.test(cell)).toBe(false)
          }
          if(file.format==='xlsx'){
            const worksheetEntries=await archiveEntries(file.bytes)
            expect(worksheetEntries.has('[Content_Types].xml')).toBe(true)
            expect(worksheetEntries.has('xl/workbook.xml')).toBe(true)
            for(const [name,content] of worksheetEntries)if(name.startsWith('xl/worksheets/')){
              expect(content.toString()).not.toMatch(/<f(?:\s|>)/)
              expect(content.toString()).not.toContain('PRIVATE_PACK_')
            }
            const readable=await extract(file.bytes,'xlsx')
            expect(readable.extractedText.length).toBeGreaterThan(10)
          }
        }
        expect(files.find(f=>f.fileName==='assignment.txt')!.bytes.toString()).toContain(variant.task.brief[locale])
        for(const doc of variant.task.documents)expect(files.filter(f=>f.format==='txt').some(f=>f.bytes.toString().includes(doc.body[locale]))).toBe(true)
        expect(files.find(f=>f.fileName==='handover.txt')!.bytes.toString()).not.toContain(variant.rubric.exemplar[locale])
        for(const document of variant.task.documents){
          for(const fence of document.body[locale].matchAll(/```(\w+)[^\r\n]*\r?\n([\s\S]*?)```/g)){
            const extensions:Record<string,string>={js:'js',javascript:'js',ts:'ts',typescript:'ts',jsx:'jsx',tsx:'tsx',py:'py',python:'py',sql:'sql',html:'html',css:'css',json:'json'}
            const extension=extensions[fence[1].toLowerCase()]
            if(extension)expect(files.some(f=>f.format===extension&&f.bytes.toString()===fence[2])).toBe(true)
          }
        }
      }
    })
  }
  it('keeps explicitly supplied sibling module imports resolvable and labels contextual source review',()=>{
    for(const variant of bank){
      for(const locale of ['en','zh'] as const){
        const files=buildWorkMaterials(variant.task,locale)
        const snippets=files.filter(f=>['js','ts','py','jsx','tsx','sql','html','css'].includes(f.format))
        if(!snippets.length)continue
        expect(files.some(f=>f.fileName==='source-code-notes.txt')).toBe(true)
        for(const source of snippets){
          for(const dependency of source.bytes.toString().matchAll(/(?:from\s*|require\s*\()(['"])(\.\/[A-Za-z0-9_.-]+)\1/g)){
            const name=dependency[2].slice(2)
            const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')
            const isSupplied=variant.task.documents.some(doc=>new RegExp(`^\\s*(?://|#)\\s*${escaped}(?:\\s|$)`,'m').test(doc.body[locale]))
            // Contextual helpers described in prose remain review inputs. Supplied code siblings must retain their declared names.
            if(isSupplied)expect(files.some(file=>file.fileName===name)).toBe(true)
          }
        }
      }
    }
  })
  it('respects safe explicit basenames and keeps unsafe, confidential and colliding declarations out of archive paths',()=>{
    const task=structuredClone(bank[0].task)
    const body=['```js\n// helper.js\nexport const value=1;\n```','```js file=consumer.js\nimport {value} from "./helper.js";\n```','```js filename=../escape.js\nexport const unrelated=2;\n```','```js\n// credentials.js\nexport const placeholder="redacted";\n```','```js\n// helper.js\nexport const other=3;\n```'].join('\n')
    task.documents=[{id:'source',kind:'brief',title:{en:'Source',zh:'原始碼'},body:{en:body,zh:body}}]
    const files=buildWorkMaterials(task,'en')
    expect(files.some(f=>f.fileName==='helper.js')).toBe(true)
    expect(files.some(f=>f.fileName==='consumer.js')).toBe(true)
    expect(files.some(f=>f.fileName==='credentials.js')).toBe(false)
    expect(new Set(files.map(f=>f.fileName)).size).toBe(files.length)
    expect(files.every(f=>!f.fileName.includes('/')&&!f.fileName.includes('..'))).toBe(true)
    expect(files.filter(f=>f.format==='js')).toHaveLength(5)
  })
})

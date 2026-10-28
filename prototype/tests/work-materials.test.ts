import { describe,it,expect } from 'vitest'
import { parse } from 'csv-parse/sync'
import { readFileSync,existsSync } from 'node:fs'
import { createRequire } from 'node:module'
const require=createRequire(import.meta.url)
const {extract}=require('../scripts/parse-attachment.cjs')
import { buildWorkMaterials,workbook,zipFiles,assertPublicationWorkMaterials } from '../src/lib/work-materials'
import { parseAttachment } from '../src/lib/attachments'
import { assertNoRecognizableSecrets } from '../src/lib/privacy'
import { submissionTiming } from '../src/lib/workspace-timing'
import type { Task } from '../src/lib/types'
const task:Task={stage:'taster',title:{en:'Resolve a batch',zh:'處理批次'},brief:{en:'Review the data and complete the task.',zh:'檢視資料及完成工作。'},manager:'A',managerRole:{en:'Lead',zh:'主管'},duration:20,documents:[{id:'source/unsafe',kind:'data',title:{en:'Production',zh:'生產'},body:{en:'| Batch | Quantity | Note |\n| --- | --- | --- |\n| 0012 | 12 | =1+1 |\n| B | -2 | Review |',zh:'| 批次 | 數量 | 備註 |\n| --- | --- | --- |\n| 0012 | 12 | =1+1 |\n| B | -2 | 檢視 |'}},{id:'implementation',kind:'brief',title:{en:'Code',zh:'程式'},body:{en:'```python\ndef batch_total(rows):\n    return 0\n```',zh:'```python\ndef batch_total(rows):\n    return 0\n```'}}],questions:[],starter:{en:'',zh:''},coaching:'request'}
describe('public workpacks, confidentiality guard and authoritative timer metadata',()=>{
  it('creates genuine XLSX data with exact identifiers, numeric cells and inert formula strings',async()=>{
    const bytes=workbook([{name:'Production',rows:[['id','qty','note'],['0012','12','=IMPORTDATA("url")'],['B','-2','A&B <records>']]}])
    const result=await parseAttachment(bytes,'xlsx')
    expect(result.extractedText).toContain('A2: 0012')
    expect(result.extractedText).toContain('B2: 12')
    expect(result.extractedText).toContain('C2: =IMPORTDATA("url")')
    expect(result.extractedText).toContain('A&B <records>')
    expect(result.extractedText).not.toContain('formula ')
  })
  it('exports original public data, useful code starters and CSV with formula injection protection',async()=>{
    const files=buildWorkMaterials({...task,privateRubric:'DO NOT LEAK'} as Task,'en')
    expect(files.find(file=>file.fileName.endsWith('.py'))?.bytes.toString()).toContain('def batch_total')
    expect(files.find(file=>file.fileName.endsWith('.csv'))?.bytes.toString()).toContain("'=1+1")
    expect(files.some(file=>file.fileName.includes('/'))).toBe(false)
    const pack=zipFiles(files)
    expect(pack.subarray(0,4)).toEqual(Buffer.from([0x50,0x4b,0x03,0x04]))
    expect(pack.toString()).not.toContain('DO NOT LEAK')
    expect((await parseAttachment(files.find(file=>file.format==='xlsx')!.bytes,'xlsx')).extractedText).toContain('0012')
    expect(buildWorkMaterials(task,'zh')[0].bytes.toString()).toContain('處理批次')
    expect(()=>zipFiles([{fileName:'../secret',bytes:Buffer.from('bad')}])).toThrow('Unsafe archive path')
  })
  it('extracts explicit column and row contracts into editable data without losing duplicates or blank markers',async()=>{
    const source={...task,documents:[{...task.documents[0],body:{en:'Fictional extract, 8 rows. Columns: order_id, status, duration_min. Rows: O-101 delivered 32; O-102 delivered 41; O-102 delivered 41; O-103 cancelled blank; O-104 delivered 28; O-105 delivered blank; O-106 delivered 55; O-107 delivered 39. Rule: exclude cancelled and blank durations.',zh:'虛構摘錄，8 行。欄位：order_id、status、duration_min。內容：O-101 delivered 32；O-102 delivered 41；O-102 delivered 41；O-103 cancelled 空白；O-104 delivered 28；O-105 delivered 空白；O-106 delivered 55；O-107 delivered 39。規則：排除取消及空白時長。'}}]}
    for(const locale of ['en','zh'] as const){
      const files=buildWorkMaterials(source,locale),data=files.find(file=>file.format==='csv')!.bytes.toString()
      expect(data.split('\r\n').filter(Boolean)).toHaveLength(9)
      expect(data.split('"O-102"')).toHaveLength(3)
      expect(data).toContain(locale==='zh'?'空白':'blank')
      const workbookFile=files.find(file=>file.format==='xlsx')!
      const read=await parseAttachment(workbookFile.bytes,'xlsx')
      expect(read.extractedText).toContain('A1: order_id')
      expect(read.extractedText).toContain('A9: O-107')
      expect(read.extractedText).toContain('C9: 39')
      expect(files.find(file=>file.fileName.endsWith('.txt')&&file.fileName.startsWith('1-'))!.bytes.toString()).toContain(source.documents[0].body[locale])
    }
    for(const body of ['Columns: order_id, value. Rows: 0012 5; 0013 extra 7. Rule: no repair.','Fictional extract, 3 rows. Columns: order_id, value. Rows: 0012 5; 0013 7. Rule: no invention.']){
      const files=buildWorkMaterials({...task,documents:[{...task.documents[0],body:{en:body,zh:body}}]},'en')
      expect(files.some(file=>file.format==='csv')).toBe(false)
    }
    const leading=buildWorkMaterials({...task,documents:[{...task.documents[0],body:{en:'Columns: record_id, amount. Rows: 0012 12; 0013 0.75. Rule: preserve IDs.',zh:''}}]},'en')
    expect((await parseAttachment(leading.find(file=>file.format==='xlsx')!.bytes,'xlsx')).extractedText).toContain('A2: 0012')
  })
  it('extracts explicit bare CSV tables while preserving source bytes and rejecting prose or code as data',async()=>{
    const body='Synthetic source values only.\nrecord_id,amount_hkd,note\n0012,12.50,"quoted, note"\nR-2,0.75,=1+1\n\nSecond table:\nrecord_id,minutes\nE-1,32\nE-2,41\nAll observations are synthetic, no claims beyond the table.\n\n```ts\nconst example = `record_id,amount\nR-99,400`\n```'
    const files=buildWorkMaterials({...task,documents:[{...task.documents[0],body:{en:body,zh:body}}]},'en')
    const data=files.filter(file=>file.format==='csv')
    expect(data).toHaveLength(2)
    expect(data[0].bytes.toString()).toContain('"0012","12.50","quoted, note"')
    expect(data[0].bytes.toString()).toContain("'=1+1")
    expect(data[1].bytes.toString()).not.toContain('All observations')
    expect(data.map(file=>file.bytes.toString()).join('\n')).not.toContain('R-99')
    const read=await parseAttachment(files.find(file=>file.format==='xlsx')!.bytes,'xlsx')
    expect(read.extractedText).toContain('A2: 0012')
    expect(read.extractedText).toContain('B2: 12.5')
    expect(files.find(file=>file.fileName.startsWith('1-')&&file.format==='txt')!.bytes.toString()).toContain(body)
    for(const prose of ['Please compare amount, count and timing\nThe service is late, check the source','record_id,amount\nR-1,12,extra','record_id,status\nR1,yes,extra\nR2,no\nR3,yes','alpha,alpha\nR-1,12']){
      const rejected=buildWorkMaterials({...task,documents:[{...task.documents[0],body:{en:prose,zh:prose}}]},'en')
      expect(rejected.some(file=>file.format==='csv')).toBe(false)
    }
  })
  it('preserves established precision strings and identifier columns while keeping quantities numeric',async()=>{
    const body='Fictional precision records.\nrecord_id,raw_result,quantity\n12345,12563.0,5\n12346,0.0098765,12.50'
    const files=buildWorkMaterials({...task,documents:[{...task.documents[0],body:{en:body,zh:body}}]},'en')
    const read=await parseAttachment(files.find(file=>file.format==='xlsx')!.bytes,'xlsx')
    expect(read.extractedText).toContain('B2: 12563.0')
    expect(read.extractedText).toContain('B3: 0.0098765')
    expect(read.extractedText).toContain('C3: 12.5')
    expect(files.find(file=>file.format==='xlsx')!.bytes.toString()).toContain('<c r="A2" t="inlineStr">')
    expect(files.find(file=>file.format==='xlsx')!.bytes.toString()).toContain('<c r="C2"><v>5</v>')
  })
  it('preserves rich valid fenced CSV and TSV while rejecting malformed tables only at publication',async()=>{
    const rich='```csv\nrecord_id,value,note\n0012,12.50,"quoted, note"\nR-2,-0.75,"first line\nsecond line"\nR-3,0,"say ""hello"""\n```\n\n```tsv\nrecord_id\tvalue\nT-1\t5\n```'
    const source={...task,documents:[{...task.documents[0],body:{en:rich,zh:rich}}]}
    expect(()=>assertPublicationWorkMaterials(source)).not.toThrow()
    const files=buildWorkMaterials(source,'en')
    const csvs=files.filter(file=>file.format==='csv')
    expect(csvs).toHaveLength(2)
    expect(parse(csvs[0].bytes,{skip_empty_lines:true})).toEqual([['record_id','value','note'],['0012','12.50','quoted, note'],['R-2','-0.75','first line\nsecond line'],['R-3','0','say "hello"']])
    const result=await parseAttachment(files.find(file=>file.format==='xlsx')!.bytes,'xlsx')
    expect(result.extractedText).toContain('first line\nsecond line')
    for(const malformed of ['```csv\na,b\n1,2,3\n```','```csv\na,b\n"unterminated,2\n```','```tsv\na\tb\n1\t2\t3\n```','```csv\n```']){
      const historical={...task,documents:[{...task.documents[0],body:{en:malformed,zh:malformed}}]}
      expect(()=>assertPublicationWorkMaterials(historical)).toThrow('CSV or TSV source')
      const old=buildWorkMaterials(historical,'en')
      expect(old.some(file=>file.format==='csv')).toBe(false)
      expect(old.find(file=>file.fileName==='1-source-unsafe.txt')!.bytes.toString()).toContain(malformed)
      expect(old.find(file=>file.fileName.endsWith('-table-review-notes.txt'))!.bytes.toString()).toContain('not exported as a table')
      const workbook=await parseAttachment(old.find(file=>file.format==='xlsx')!.bytes,'xlsx')
      expect(workbook.extractedText).toContain('Original text')
    }
  })
  it('builds and reads every committed public scenario workpack in both languages',async()=>{
    let cases=0,books=0,codeFiles=0
    for(const name of ['company-catalog.json','task-family-catalog.json','core-catalog.json','expansion-catalog.json'].filter(name=>existsSync(`curriculum/${name}`))){
      const catalog=JSON.parse(readFileSync(`curriculum/${name}`,'utf8'))
      for(const variant of Array.isArray(catalog)?catalog:catalog.variants){
        for(const locale of ['en','zh'] as const){
          const files=buildWorkMaterials(variant.task,locale)
          const names=files.map(file=>file.fileName)
          expect(new Set(names).size).toBe(names.length)
          expect(files[0].bytes.toString()).toContain(variant.task.title[locale])
          expect(zipFiles(files).length).toBeGreaterThan(100)
          for(const file of files){
            if(file.format==='xlsx'){const read=await extract(file.bytes,'xlsx');expect(read.extractedText.length).toBeGreaterThan(1);books++}
            if(['py','js','ts','sql'].includes(file.format)){const read=await extract(file.bytes,file.format);expect(read.extractedText.length).toBeGreaterThan(1);codeFiles++}
          }
        }
        cases++
      }
    }
    expect(cases).toBeGreaterThanOrEqual(126)
    expect(books).toBeGreaterThan(100)
    expect(codeFiles).toBeGreaterThan(20)
  })
  it('rejects recognizable real credentials without rejecting ordinary data or placeholder code',()=>{
    for(const secret of ['-----BEGIN OPENSSH PRIVATE KEY-----','sk-'+ 'a'.repeat(32),'postgres://worker:secret@db.example/data','client_secret = "'+ 'z'.repeat(30)+'"'])expect(()=>assertNoRecognizableSecrets(secret)).toThrow()
    expect(()=>assertNoRecognizableSecrets('api_key = "YOUR_API_KEY"\npassword = "[redacted]"\nBatch A quantity 12345')).not.toThrow()
  })
  it('records inclusive deadline receipt separately from grading time and tolerates untimed legacy work',()=>{
    expect(submissionTiming('2026-10-11T10:00:00Z','2026-10-11T10:20:00Z','2026-10-11T10:20:00Z')).toMatchObject({onTime:true,elapsedSeconds:1200})
    expect(submissionTiming('2026-10-11T10:00:00Z','2026-10-11T10:20:00Z','2026-10-11T10:20:01Z')).toMatchObject({onTime:false,elapsedSeconds:1201})
    expect(submissionTiming(undefined,undefined,'2026-10-11T10:20:01Z')).toBeUndefined()
  })
})

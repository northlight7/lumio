import { parse } from 'csv-parse/sync'
import type { Locale, Task } from './types'
export type WorkMaterial = {id:string;fileName:string;label:string;format:string;bytes:Buffer}
const escapeXml=(value:string)=>value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g,'')
const safeName=(value:string)=>value.replace(/[^a-zA-Z0-9_-]/g,'-').replace(/-+/g,'-').slice(0,60)||'source'
function publicCodeName(metadata:string,code:string,extension:string):string|undefined {
  const fence=metadata.trim().match(/^(?:(?:file|filename)=)?([A-Za-z0-9_.-]+)$/i)?.[1]
  const comment=code.split(/\r?\n/,1)[0].match(/^\s*(?:\/\/|#|--|\/\*|<!--)\s*(?:file:\s*)?([A-Za-z0-9_.-]+)(?=\s|$)/i)?.[1]
  const name=fence||comment
  if(!name||name.length>100||!/^([A-Za-z0-9_-][A-Za-z0-9_.-]*)$/.test(name)||name.includes('..')||!name.endsWith(`.${extension}`))return
  if(/^(?:credentials|secrets?|passwords?|private[-_]key|api[-_]key)(?:\.|$)/i.test(name))return
  return name
}

const crcTable=Array.from({length:256},(_,index)=>{let value=index;for(let bit=0;bit<8;bit++)value=(value&1)?(0xedb88320^(value>>>1)):(value>>>1);return value>>>0})
function crc32(bytes:Buffer){let value=0xffffffff;for(const byte of bytes)value=crcTable[(value^byte)&255]^(value>>>8);return (value^0xffffffff)>>>0}
/** Deterministic, uncompressed ZIP. File names come only from this module. */
export function zipFiles(files:{fileName:string;bytes:Buffer}[]):Buffer {
  const body:Buffer[]=[],directory:Buffer[]=[];let offset=0
  for(const file of files){
    if(!/^[A-Za-z0-9_[\]./-]+$/.test(file.fileName)||file.fileName.includes('..')||file.fileName.startsWith('/'))throw new Error('Unsafe archive path')
    const name=Buffer.from(file.fileName),checksum=crc32(file.bytes),local=Buffer.alloc(30),central=Buffer.alloc(46)
    local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(0x21,12);local.writeUInt32LE(checksum,14);local.writeUInt32LE(file.bytes.length,18);local.writeUInt32LE(file.bytes.length,22);local.writeUInt16LE(name.length,26)
    central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(0x21,14);central.writeUInt32LE(checksum,16);central.writeUInt32LE(file.bytes.length,20);central.writeUInt32LE(file.bytes.length,24);central.writeUInt16LE(name.length,28);central.writeUInt32LE(offset,42)
    body.push(local,name,file.bytes);directory.push(central,name);offset+=local.length+name.length+file.bytes.length
  }
  const dir=Buffer.concat(directory),end=Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(dir.length,12);end.writeUInt32LE(offset,16)
  return Buffer.concat([...body,dir,end])
}
const columnName=(index:number)=>{let value=index+1,result='';while(value){value--;result=String.fromCharCode(65+value%26)+result;value=Math.floor(value/26)}return result}
export function workbook(sheets:{name:string;rows:string[][];textColumns?:string[]}[]):Buffer {
  const xml=(name:string,text:string)=>({fileName:name,bytes:Buffer.from(text)})
  const namespace='http://schemas.openxmlformats.org/spreadsheetml/2006/main'
  const files=[
    xml('[Content_Types].xml',`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_,index)=>`<Override PartName="/xl/worksheets/sheet${index+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`),
    xml('_rels/.rels','<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
    xml('xl/workbook.xml',`<?xml version="1.0"?><workbook xmlns="${namespace}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((sheet,index)=>`<sheet name="${escapeXml(sheet.name.slice(0,31))}" sheetId="${index+1}" r:id="rId${index+1}"/>`).join('')}</sheets></workbook>`),
    xml('xl/_rels/workbook.xml.rels',`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_,index)=>`<Relationship Id="rId${index+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index+1}.xml"/>`).join('')}</Relationships>`),
    ...sheets.map((sheet,index)=>xml(`xl/worksheets/sheet${index+1}.xml`,`<?xml version="1.0"?><worksheet xmlns="${namespace}"><sheetData>${sheet.rows.map((row,rowIndex)=>`<row r="${rowIndex+1}">${row.map((value,column)=>{
      // Preserve identifiers and formula-looking source strings as text. Plain decimal data becomes editable numeric cells.
      const preserveText=sheet.textColumns?.includes(sheet.rows[0]?.[column])
      const numeric=!preserveText&&/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)&&Number.isFinite(Number(value))&&value.replace(/[-.]/g,'').length<16
      return numeric?`<c r="${columnName(column)}${rowIndex+1}"><v>${value}</v></c>`:`<c r="${columnName(column)}${rowIndex+1}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`
    }).join('')}</row>`).join('')}</sheetData></worksheet>`)),
  ]
  return zipFiles(files)
}
function sourceTables(body:string):{tables:string[][][];invalidFencedTables:number} {
  const tables:string[][][]=[]
  let invalidFencedTables=0
  for(const match of body.matchAll(/```(?:csv|tsv)\s*\n([\s\S]*?)```/gi)){
    try{const rows=parse(match[1],{delimiter:/^```tsv/i.test(match[0])?'\t':',',skip_empty_lines:true,max_record_size:24000}) as string[][];if(rows.length)tables.push(rows);else invalidFencedTables++}catch{invalidFencedTables++}
  }
  // A bare CSV extract is still explicit tabular input. Recognize only a unique machine-header
  // line followed by complete CSV rows. Fenced code and ordinary prose are never inferred as data.
  let insideFence=false
  const bareLines=body.split('\n').map(line=>{if(/^\s*```/.test(line)){insideFence=!insideFence;return ''}return insideFence?'':line})
  for(let index=0;index<bareLines.length;index++){
    if(!bareLines[index].includes(','))continue
    let headers:string[]
    try{
      const parsed=parse(bareLines[index],{skip_empty_lines:true,max_record_size:24000}) as string[][]
      if(parsed.length!==1)continue
      headers=parsed[0]
    }catch{continue}
    if(headers.length<2||headers.length>40||new Set(headers.map(h=>h.trim())).size!==headers.length||!headers.every(h=>/^[A-Za-z_][A-Za-z0-9_]*$/.test(h.trim())))continue
    const rows:string[][]=[headers]
    let malformed=false
    let next=index+1
    for(;next<bareLines.length&&bareLines[next].trim();next++){
      try{
        const parsed=parse(bareLines[next],{skip_empty_lines:true,max_record_size:24000}) as string[][]
        if(parsed.length!==1)break
        // Stable IDs, simple values and explicitly quoted names can begin a row.
        // A prose sentence containing commas cannot silently become another source record.
        const first=parsed[0][0].trim()
        if(!/^[A-Za-z0-9_][A-Za-z0-9_.:/+\-]*$/.test(first)&&!/^\d{4}-\d{2}-\d{2} [\d:TZ+\- ]+$/.test(first)&&!bareLines[next].trimStart().startsWith('"'))break
        if(parsed[0].length!==headers.length){malformed=true;continue}
        rows.push(parsed[0])
      }catch{malformed=true;break}
    }
    if(rows.length>1&&!malformed)tables.push(rows)
    if(rows.length>1||malformed)index=next-1
  }
  // Only parse an explicit machine-column / semicolon-row contract. Never infer tabular facts from ordinary prose.
  const structured=body.match(/Columns:\s*([A-Za-z0-9_, \t]+)\.\s*Rows:\s*([\s\S]*?)(?:\.\s+(?=[A-Z][a-z]+:)|\.\s*$)/)
    ||body.match(/欄位[：:]\s*([A-Za-z0-9_、,， \t]+)。\s*內容[：:]\s*([\s\S]*?)。(?:\s*規則[：:]|\s*$)/)
  if(structured){
    const headers=structured[1].split(/[,、，]/).map(value=>value.trim())
    const rows=structured[2].split(/[;；]/).map(row=>row.trim().split(/\s+/))
    const statedCount=body.match(/\b(\d+)\s+rows?\b/i)||body.match(/(\d+)\s*行/)
    if(headers.length>1&&headers.length<=40&&new Set(headers).size===headers.length&&headers.every(header=>/^[A-Za-z_][A-Za-z0-9_]*$/.test(header))&&rows.length>0&&rows.every(row=>row.length===headers.length)&&(!statedCount||rows.length===Number(statedCount[1]))){
      tables.push([headers,...rows])
    }
  }
  const lines=body.split('\n')
  for(let i=0;i<lines.length-1;i++){
    if(!lines[i].includes('|')||!/^\s*\|?\s*:?-{3,}/.test(lines[i+1]))continue
    const row=(line:string)=>line.trim().replace(/^\|/,'').replace(/\|$/,'').split(/(?<!\\)\|/).map(cell=>cell.trim().replace(/\\\|/g,'|'))
    const rows=[row(lines[i])];i+=2
    for(;i<lines.length&&lines[i].includes('|');i++)rows.push(row(lines[i]))
    tables.push(rows)
  }
  return {tables,invalidFencedTables}
}
const csv=(rows:string[][])=>rows.map(row=>row.map(value=>`"${value.replace(/"/g,'""')}"`).join(',')).join('\r\n')+'\r\n'
export function buildWorkMaterials(task:Task,locale:Locale):WorkMaterial[] {
  const files:WorkMaterial[]=[]
  const add=(fileName:string,label:string,content:string|Buffer)=>files.push({id:`file-${files.length+1}`,fileName,label,format:fileName.split('.').at(-1)!,bytes:Buffer.isBuffer(content)?content:Buffer.from(content)})
  const zh=locale==='zh'
  const notice=zh?'本練習只使用虛構資料。請勿加入公司機密、個人資料或憑證。使用你自己的工具完成工作，然後上載完成檔案。':'This exercise uses synthetic data. Do not add company secrets, personal records or credentials. Complete the work in your own tools, then upload your finished files.'
  add('assignment.txt',zh?'工作簡報':'Assignment brief',`${task.title[locale]}\n\n${task.brief[locale]}\n\n${zh?'限時':'Time window'}: ${task.duration} ${zh?'分鐘':'minutes'}\n\n${notice}\n\n${task.questions.map(question=>`${question.id}: ${question.label[locale]}${question.options?'\n'+question.options.map(option=>`${option.value}: ${option.label[locale]}`).join('\n'):''}`).join('\n\n')}`)
  const sheets:{name:string;rows:string[][];textColumns?:string[]}[]=[],codeExtensions:Record<string,string>={javascript:'js',js:'js',typescript:'ts',ts:'ts',tsx:'tsx',jsx:'jsx',python:'py',py:'py',sql:'sql',json:'json',html:'html',css:'css'}
  for(const [index,document] of task.documents.entries()){
    const name=`${index+1}-${safeName(document.id)}`,body=document.body[locale]
    add(`${name}.txt`,document.title[locale],`${document.title[locale]}\n\n${body}`)
    const {tables,invalidFencedTables}=sourceTables(body)
    if(invalidFencedTables)add(`${name}-table-review-notes.txt`,zh?'資料格式檢視說明':'Source table review notes',zh?'原始 CSV 或 TSV 區塊的欄位結構不一致或格式無效，因此沒有匯出為表格。完整原文保留在同名 TXT 檔。請檢視原文及公開工作要求，勿假定系統已修正資料。':'An original CSV or TSV block has inconsistent columns or invalid syntax, so it was not exported as a table. The complete original remains in the matching TXT file. Review the source and public task contract. No corrected data has been assumed.')
    for(const [tableIndex,rows] of tables.entries()){
      // CSV formula strings are prefixed for spreadsheet safety. The original source remains exact in its TXT and XLSX.
      const safeRows=rows.map(row=>row.map(value=>/^\s*[=+@-]/.test(value)&&!/^\s*-\d+(?:\.\d+)?\s*$/.test(value)?`'${value}`:value))
      add(`${name}-table-${tableIndex+1}.csv`,`${document.title[locale]} · ${zh?'資料表':'Data table'} ${tableIndex+1}`,csv(safeRows))
      sheets.push({name:`Source ${index+1} Table ${tableIndex+1}`,rows,textColumns:rows[0].filter(header=>/(?:^|_)(?:id|code|reference)$/.test(header)||header==='raw_result')})
    }
    if(!tables.length&&document.kind==='data')sheets.push({name:`Source ${index+1}`,rows:[[zh?'資料來源':'Source',zh?'原文':'Original text'],...body.split('\n').map(line=>[document.id,line])]})
    for(const [codeIndex,match] of [...body.matchAll(/```([a-z]+)([^\r\n]*)\r?\n([\s\S]*?)```/gi)].entries()){
      const extension=codeExtensions[match[1].toLowerCase()]
      if(extension){
        const declared=publicCodeName(match[2],match[3],extension)
        const fileName=declared&&!files.some(file=>file.fileName===declared)?declared:`${name}-starter-${codeIndex+1}.${extension}`
        add(fileName,`${document.title[locale]} · ${zh?'原始碼':'Source code'}`,match[3])
      }
    }
  }
  if(files.some(file=>Object.values(codeExtensions).includes(file.format))){
    add('source-code-notes.txt',zh?'原始碼檢視說明':'Source review notes',zh?'這些檔案是供你使用自己的工具檢視及改寫的原始碼片段。部分片段依賴參考文字檔所述的輔助程式或測試工具環境。請按公開的工作要求檢視片段及其證據。':'These files are source snippets for review and editing in your own tools. Some depend on helper or test-runner context described in the reference TXT documents. Review the snippets and their evidence against the public task contract.')
  }
  if(sheets.length){
    // Keep downloads readable by the same bounded file reader used for finished uploads.
    const sourceSheets=sheets.slice(0,18)
    add('source-data.xlsx',zh?'資料工作簿':'Source data workbook',workbook([...sourceSheets,{name:'Instructions',rows:[[notice],[zh?'表格由公開練習資料匯出，完整上下文請參閱原始文字檔。':'Tables are exported from public exercise sources. Read the original text files for complete context.'],[zh?'公式尚未執行，原始碼尚未執行。':'Formulas and source code have not been executed.']]}]))
  }
  add('handover.txt',zh?'交接範本':'Handover template',`${notice}\n\n${zh?'我的決定、計算及證據：':'My decisions, calculations and evidence:'}\n\n${zh?'建議、限制及下一步：':'Recommendation, limitations and next steps:'}\n`)
  return files
}

/** Publication checks are separate from historical snapshot reads. */
export function assertPublicationWorkMaterials(task:Task):void {
  for(const locale of ['en','zh'] as const){
    for(const document of task.documents){
      if(sourceTables(document.body[locale]).invalidFencedTables)throw new Error(`Public ${locale} CSV or TSV source must have valid syntax and consistent columns.`)
    }
    const files=buildWorkMaterials(task,locale)
    const names=files.map(file=>file.fileName)
    if(new Set(names).size!==names.length||!files.length||files.some(file=>!file.bytes.length))throw new Error('Public workpack contains missing or duplicate files.')
    if(zipFiles(files).length>8*1024*1024)throw new Error('Public workpack exceeds the publication size bound.')
  }
}

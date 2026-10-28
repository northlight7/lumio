'use strict'
const yauzl=require('yauzl')
const {SaxesParser}=require('saxes')
const {parse}=require('csv-parse/sync')
const path=require('node:path').posix
const {crc32}=require('node:zlib')
const MAX_FILE=5*1024*1024, MAX_TEXT=24000
class ParseError extends Error {constructor(code){super(code);this.code=code}}
const reject=code=>{throw new ParseError(code)}
const utf8=buffer=>{try{return new TextDecoder('utf-8',{fatal:true}).decode(buffer)}catch{reject('invalid_file')}}
function xml(buffer){
  const text=utf8(buffer)
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) reject('unsafe_file')
  let count=0
  const root={name:'root',children:[],attributes:{},text:''},stack=[root]
  const parser=new SaxesParser({xmlns:true})
  parser.on('error',()=>reject('invalid_file'))
  parser.on('opentag',tag=>{
    if(++count>100000||stack.length>64)reject('extraction_too_large')
    const node={name:tag.local,children:[],attributes:Object.fromEntries(Object.values(tag.attributes).map(a=>[a.name,a.value])),text:''}
    stack.at(-1).children.push(node);stack.push(node)
  })
  parser.on('text',text=>{stack.at(-1).text+=text})
  parser.on('cdata',text=>{stack.at(-1).text+=text})
  parser.on('closetag',()=>stack.pop())
  parser.write(text).close()
  return root
}
const children=(n,name)=>n.children.filter(c=>c.name===name)
function find(n,name){return n.children.flatMap(c=>[...(c.name===name?[c]:[]),...find(c,name)])}
const textOf=n=>n.text+n.children.map(textOf).join('')
const paragraphText=n=>{if(n.name==='t')return textOf(n);if(n.name==='tab')return '\t';if(n.name==='br'||n.name==='cr')return '\n';return n.children.map(paragraphText).join('')}
const relationshipId=n=>Object.entries(n.attributes).find(([key])=>key.includes(':')&&key.split(':').at(-1)==='id')?.[1]
const attr=(n,key)=>n.attributes[key]??Object.entries(n.attributes).find(([k])=>k.split(':').at(-1)===key)?.[1]
function validateRelationships(root){
  const ids=new Set()
  for(const relation of find(root,'Relationship')){
    const id=attr(relation,'Id'),target=attr(relation,'Target')||'',mode=attr(relation,'TargetMode'),type=attr(relation,'Type')||''
    if(!id||ids.has(id))reject('invalid_file')
    ids.add(id)
    if(mode&&mode!=='External'&&mode!=='Internal')reject('invalid_file')
    if(mode==='External'){
      const passive=['http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink','http://purl.oclc.org/ooxml/officeDocument/relationships/hyperlink'].includes(type)
      let url;try{url=new URL(target)}catch{reject('unsafe_file')}
      if(!passive||!['https:','http:','mailto:'].includes(url.protocol))reject('unsafe_file')
    }else if(/^[a-z]+:|^\/\/|\\|\0/i.test(target))reject('unsafe_file')
  }
}
function relationships(files,name,base){
  const map=new Map()
  if(!files.has(name))return map
  for(const relation of find(xml(files.get(name)),'Relationship')){
    if(attr(relation,'TargetMode')==='External')continue
    const target=attr(relation,'Target')||''
    if(/^[a-z]+:|\\|\0/i.test(target))reject('unsafe_file')
    const resolved=target.startsWith('/')?target.slice(1):path.normalize(path.join(base,target))
    if(resolved.startsWith('../'))reject('unsafe_file')
    map.set(attr(relation,'Id'),resolved)
  }
  return map
}
async function unzip(buffer){
  let zip
  try{zip=await yauzl.fromBufferPromise(buffer,{lazyEntries:true,strictFileNames:true,validateEntrySizes:true})}catch{reject('invalid_file')}
  const files=new Map(),seen=new Set()
  let total=0,count=0
  try{
    for await(const entry of zip.eachEntry()){
      if(++count>1000||seen.has(entry.fileName))reject('unsafe_file')
      seen.add(entry.fileName)
      if(entry.generalPurposeBitFlag&1)reject('unsafe_file')
      if((entry.externalFileAttributes>>>16 & 0o170000)===0o120000)reject('unsafe_file')
      if(entry.fileName.endsWith('/'))continue
      if(/vbaProject|activeX|embeddings\/|externalLinks\/|\.exe$|\.js$|\.html?$/i.test(entry.fileName))reject('unsafe_file')
      total+=entry.uncompressedSize
      if(entry.uncompressedSize>8*1024*1024||total>30*1024*1024||entry.uncompressedSize>Math.max(1024*1024,entry.compressedSize*300))reject('extraction_too_large')
      if(!/\.xml$|\.rels$/i.test(entry.fileName))continue
      const chunks=[];let size=0
      const stream=await zip.openReadStreamPromise(entry)
      for await(const chunk of stream){size+=chunk.length;if(size>8*1024*1024)reject('extraction_too_large');chunks.push(chunk)}
      const bytes=Buffer.concat(chunks)
      if(bytes.length!==entry.uncompressedSize||crc32(bytes)!==entry.crc32)reject('invalid_file')
      // Validate every XML part, including metadata and relationships, without fetching entities.
      const root=xml(bytes)
      if(/\.rels$/i.test(entry.fileName))validateRelationships(root)
      files.set(entry.fileName,bytes)
    }
  }catch(error){if(error instanceof ParseError)throw error;reject('invalid_file')}
  return files
}
async function extract(buffer,format){
  if(!buffer.length)reject('invalid_file')
  if(buffer.length>MAX_FILE)reject('file_too_large')
  let extractedText='',limitations=[],substance=''
  if(['txt','py','js','ts','tsx','jsx','sql','json','html','css','md'].includes(format)){
    extractedText=utf8(buffer).replace(/^\uFEFF/,'')
    if(/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(extractedText))reject('invalid_file')
    limitations=['Source files are read as plain text. Code, HTML and scripts are not executed or rendered.']
  }else if(format==='csv'){
    let rows
    try{rows=parse(utf8(buffer),{bom:true,max_record_size:24000,relax_column_count:true,skip_empty_lines:true})}catch{reject('invalid_file')}
    if(rows.length>5000||rows.some(row=>row.length>100)||rows.reduce((sum,row)=>sum+row.length,0)>10000)reject('extraction_too_large')
    substance=rows.flat().join('\n')
    extractedText=rows.map((row,index)=>`Row ${index+1}: ${row.map((value,column)=>`${column+1}=${JSON.stringify(value)}`).join(' | ')}`).join('\n')
    limitations=['CSV cells are read as text. Formula-like cells are not executed.']
  }else if(['xlsx','pptx','docx'].includes(format)){
    if(buffer[0]!==0x50||buffer[1]!==0x4b)reject('invalid_file')
    const files=await unzip(buffer)
    const types=files.get('[Content_Types].xml')
    if(!types||!utf8(types).includes(({xlsx:'spreadsheetml.sheet.main+xml',pptx:'presentationml.presentation.main+xml',docx:'wordprocessingml.document.main+xml'})[format]))reject('invalid_file')
    if(/macroEnabled|vbaProject|activeX/i.test(utf8(types)))reject('unsafe_file')
    if(format==='docx'){
      const doc=files.get('word/document.xml');if(!doc)reject('invalid_file')
      extractedText=find(xml(doc),'p').map(paragraphText).join('\n')
      limitations=['Document text and table text are reviewed. Images, formatting and tracked-change presentation are not rendered.']
    }else if(format==='pptx'){
      const presentation=files.get('ppt/presentation.xml');if(!presentation)reject('invalid_file')
      const relations=relationships(files,'ppt/_rels/presentation.xml.rels','ppt')
      const slides=find(xml(presentation),'sldId')
      if(!slides.length||slides.length>100)reject('invalid_file')
      extractedText=slides.map((slide,index)=>{
        const target=relations.get(relationshipId(slide)),data=files.get(target)
        if(!data||!target.startsWith('ppt/slides/'))reject('invalid_file')
        const content=find(xml(data),'p').map(paragraphText).join('\n')
        substance+=content+'\n'
        return `Slide ${index+1}\n${content}`
      }).join('\n\n')
      limitations=['Slide text and table text are reviewed in presentation order. Images, animations, layout and speaker notes are not rendered.']
    }else{
      const workbook=files.get('xl/workbook.xml');if(!workbook)reject('invalid_file')
      const relations=relationships(files,'xl/_rels/workbook.xml.rels','xl')
      const shared=files.has('xl/sharedStrings.xml')?find(xml(files.get('xl/sharedStrings.xml')),'si').map(si=>find(si,'t').map(textOf).join('')):[]
      const sheets=find(xml(workbook),'sheet');if(!sheets.length||sheets.length>20)reject('invalid_file')
      let cellCount=0,formulas=false
      extractedText=sheets.map(sheet=>{
        const target=relations.get(relationshipId(sheet)),data=files.get(target)
        if(!data||!target.startsWith('xl/worksheets/'))reject('invalid_file')
        const cells=find(xml(data),'c')
        const lines=cells.map(cell=>{
          if(++cellCount>10000)reject('extraction_too_large')
          const address=attr(cell,'r');if(!/^[A-Z]{1,3}[1-9][0-9]{0,6}$/.test(address||''))reject('invalid_file')
          const formula=children(cell,'f')[0],value=children(cell,'v')[0],type=attr(cell,'t')
          let display=value?textOf(value):''
          if(type==='s'){const number=Number(display);if(!Number.isInteger(number)||number<0||number>=shared.length)reject('invalid_file');display=shared[number]}
          if(type==='inlineStr')display=find(cell,'t').map(textOf).join('')
          substance+=display+'\n'+(formula?textOf(formula):'')
          if(formula){formulas=true;return `${address}: formula ${textOf(formula)||'[shared or array formula reference, not expanded]' } | cached result ${display||'[not saved]'}`}
          return `${address}: ${display}`
        })
        return `Sheet: ${attr(sheet,'name')||'Untitled'}${['hidden','veryHidden'].includes(attr(sheet,'state'))?' [hidden]':''}\n${lines.join('\n')}`
      }).join('\n\n')
      limitations=['Cell text, raw numeric values and saved formula results are reviewed. Formatting, dates represented as numeric serials, charts and images are not rendered.']
      if(formulas)limitations.push('Formulas are shown with their saved results. Shared formula references are not expanded. Results are not calculated or verified by running the workbook.')
    }
  }else reject('unsupported_format')
  if(['txt','py','js','ts','tsx','jsx','sql','json','html','css','md','docx'].includes(format))substance=extractedText
  extractedText=extractedText.trim()
  if(!substance.trim()||!/[\p{L}\p{N}]/u.test(substance))reject('invalid_file')
  if(extractedText.length>MAX_TEXT)reject('extraction_too_large')
  return {extractedText,substantiveCharacters:substance.trim().length,limitations,parserVersion:'lumio-artifacts-2026-10-11.2'}
}
module.exports={extract}
if(require.main===module){
  const chunks=[];let size=0
  process.stdin.on('data',chunk=>{size+=chunk.length;if(size>MAX_FILE){process.stdout.write(JSON.stringify({error:'file_too_large'}));process.exit(1)}chunks.push(chunk)})
  process.stdin.on('end',async()=>{try{process.stdout.write(JSON.stringify(await extract(Buffer.concat(chunks),process.argv[2])))}catch(error){process.stdout.write(JSON.stringify({error:error instanceof ParseError?error.code:'invalid_file'}));process.exitCode=1}})
}

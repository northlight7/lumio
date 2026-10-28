import 'server-only'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'
import { z } from 'zod'
import { consumeQuota } from './provider-quota'
import { query, transaction } from './db'
import { ApiError, appOrigin, hash, sessionToken } from './security'
import { assertNoRecognizableSecrets } from './privacy'
import type { Attachment, Stage } from './types'
export const MAX_ATTACHMENT_BYTES=5*1024*1024
let parserLoad=0
const MAX_STORED_BYTES=100*1024*1024
const extraction=z.object({extractedText:z.string().min(1).max(24000),substantiveCharacters:z.number().int().positive().max(24000),limitations:z.array(z.string().max(500)).max(10),parserVersion:z.string().max(100)}).strict()
type AttachmentRow={id:string;file_name:string;format:Attachment['format'];size:number;sha256:string;extracted_text:string;substantive_characters:number;extraction_hash:string;limitations:string[];parser_version:string;created_at:Date}
const publicColumns='id,file_name,format,size,sha256,extracted_text,substantive_characters,extraction_hash,limitations,parser_version,created_at'
export const mapAttachment=(row:AttachmentRow):Attachment=>({id:row.id,fileName:row.file_name,format:row.format,size:row.size,sha256:row.sha256,extractedText:row.extracted_text,substantiveCharacters:row.substantive_characters,extractionHash:row.extraction_hash,limitations:row.limitations,parserVersion:row.parser_version,createdAt:new Date(row.created_at).toISOString(),downloadUrl:`/api/attachments/${row.id}`})
export async function attachmentsByIds(ids:string[],client?:PoolClient):Promise<Attachment[]> {
  if(!ids.length)return []
  const rows=client?(await client.query<AttachmentRow>(`SELECT ${publicColumns} FROM attachments WHERE id=ANY($1::uuid[])`,[ids])).rows:await query<AttachmentRow>(`SELECT ${publicColumns} FROM attachments WHERE id=ANY($1::uuid[])`,[ids])
  return ids.flatMap(id=>{const row=rows.find(r=>r.id===id);return row?[mapAttachment(row)]:[]})
}
export async function parseAttachment(bytes:Buffer,format:Attachment['format']):Promise<z.infer<typeof extraction>> {
  if(!bytes.length||bytes.length>MAX_ATTACHMENT_BYTES)throw new ApiError(413,'Upload a file between 1 byte and 5 MB.','file_too_large')
  if(parserLoad>=2)throw new ApiError(503,'The file reader is busy. Please try again shortly.','file_reader_busy')
  parserLoad++
  return new Promise((accept,reject)=>{
    const root=process.cwd(),script=resolve(root,'scripts/parse-attachment.cjs')
    const child=spawn(process.execPath,['--permission',`--allow-fs-read=${script}`,`--allow-fs-read=${resolve(root,'node_modules')}`,`--allow-fs-read=${resolve(root,'package.json')}`,'--max-old-space-size=128',script,format],{cwd:root,env:{NODE_NO_WARNINGS:'1',NODE_ENV:'production'},stdio:['pipe','pipe','pipe']})
    const chunks:Buffer[]=[];let size=0,settled=false
    const fail=(message:string,code='file_invalid')=>{if(settled)return;settled=true;parserLoad--;clearTimeout(deadline);child.kill('SIGKILL');reject(new ApiError(400,message,code))}
    const deadline=setTimeout(()=>fail('This file took too long to read. Try a smaller file.','file_parse_timeout'),10000)
    child.on('error',()=>fail('The file reader is unavailable. Please try again.','file_reader_unavailable'))
    child.stdin.on('error',()=>{})
    child.stdout.on('data',chunk=>{size+=chunk.length;if(size>150000)fail('This file contains too much text. Upload a shorter document.','extraction_too_large');else chunks.push(chunk)})
    child.stderr.on('data',()=>{})
    child.on('close',()=>{if(settled)return;try{
      const data=JSON.parse(Buffer.concat(chunks).toString('utf8'))
      if(data.error){const messages:Record<string,string>={unsafe_file:'This file contains unsupported active, encrypted or unsafe content. Save a plain Office document without macros or embedded objects.',extraction_too_large:'This file is too complex or contains too much text. Upload a smaller document.',invalid_file:'This file could not be read. Save it again in a supported format.'};fail(messages[data.error]||'This file could not be read.',data.error);return}
      const parsed=extraction.parse(data);settled=true;parserLoad--;clearTimeout(deadline);accept(parsed)
    }catch{fail('This file could not be read. Save it again in a supported format.')}})
    child.stdin.end(bytes)
  })
}
async function owner(request:Request):Promise<string> {
  const session=sessionToken(request)
  const row=session?(await query<{id:string}>('SELECT learner_id AS id FROM sessions WHERE token_hash=$1 AND expires_at>now()',[hash(session)]))[0]:undefined
  if(!row)throw new ApiError(401,'Start a learner session to continue.','session_required')
  return row.id
}
async function editable(client:PoolClient,learnerId:string,attemptId:string,revision:number):Promise<{attachment_ids:string[]}> {
  const row=(await client.query<{revision:number;stage:Stage;attachment_ids:string[];retired_at:Date|null}>('SELECT a.revision,a.stage,a.attachment_ids,v.retired_at FROM attempts a LEFT JOIN task_variants v ON v.id=a.variant_id WHERE a.id=$1 AND a.learner_id=$2 FOR UPDATE OF a',[attemptId,learnerId])).rows[0]
  if(!row)throw new ApiError(404,'This attempt is unavailable.','attempt_missing')
  if(row.revision!==revision)throw new ApiError(409,'Your draft changed. Refresh it before changing files.','revision_conflict')
  if(row.retired_at)throw new ApiError(409,'This variation was retired after review. Your evidence is preserved.','variation_retired')
  if(row.stage==='assessment'&&(await client.query('SELECT 1 FROM submissions WHERE attempt_id=$1 LIMIT 1',[attemptId])).rowCount)throw new ApiError(409,'This assessment has already been submitted. Its evidence is final.','assessment_already_submitted')
  return row
}
export async function uploadAttachment(request:Request,attemptId:string):Promise<void> {
  if(request.headers.get('origin')!==appOrigin())throw new ApiError(403,'This request must come from Lumio.','origin_rejected')
  const learnerId=await owner(request)
  if(!(await query('SELECT 1 FROM attempts WHERE id=$1 AND learner_id=$2',[attemptId,learnerId])).length)throw new ApiError(404,'This attempt is unavailable.','attempt_missing')
  const window=Math.floor(Date.now()/60000)
  await consumeQuota(`upload:user:${learnerId}:${window}`,20,new Date((window+1)*60000))
  const contentType=request.headers.get('content-type')||''
  if(!contentType.startsWith('multipart/form-data;'))throw new ApiError(415,'Choose a file to upload.','content_type')
  const reader=request.body?.getReader();if(!reader)throw new ApiError(400,'Choose a file to upload.','file_missing')
  const chunks:Uint8Array[]=[];let size=0
  while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>MAX_ATTACHMENT_BYTES+65536){await reader.cancel();throw new ApiError(413,'Files may be up to 5 MB.','file_too_large')}chunks.push(part.value)}
  let form:FormData
  try{form=await new Response(Buffer.concat(chunks),{headers:{'content-type':contentType}}).formData()}catch{throw new ApiError(400,'This upload is invalid.','file_invalid')}
  if([...form.keys()].some(key=>!['file','revision','privacyConsent'].includes(key))||form.getAll('file').length!==1||form.getAll('revision').length!==1)throw new ApiError(400,'Upload one file with the current draft revision.','file_invalid')
  if(form.getAll('privacyConsent').length!==1||form.get('privacyConsent')!=='true')throw new ApiError(403,'Confirm that you own or may use this file and that it contains no confidential business data, personal records or credentials.','file_privacy_required')
  const file=form.get('file'),revisionText=form.get('revision')
  if(!(file instanceof File)||typeof revisionText!=='string'||!/^\d{1,10}$/.test(revisionText))throw new ApiError(400,'Choose a file and refresh your draft.','file_invalid')
  const revision=Number(revisionText)
  if(!file.name||file.name.length>180||/[\x00-\x1F\x7F/\\]/.test(file.name))throw new ApiError(400,'Use a plain file name of up to 180 characters.','file_invalid')
  const format=file.name.split('.').at(-1)?.toLowerCase()
  if(!['xlsx','csv','pptx','docx','txt','py','js','ts','tsx','jsx','sql','json','html','css','md'].includes(format||''))throw new ApiError(400,'Use Office, CSV, text or source code files. Archives and executable binaries are not accepted.','unsupported_format')
  await transaction(async client=>{const current=await editable(client,learnerId,attemptId,revision);if(current.attachment_ids.length>=3)throw new ApiError(400,'Keep up to three files in one task. Remove a file before adding another.','attachment_limit')})
  const bytes=Buffer.from(await file.arrayBuffer()),parsed=await parseAttachment(bytes,format as Attachment['format'])
  assertNoRecognizableSecrets(parsed.extractedText)
  await transaction(async client=>{
    await client.query('SELECT id FROM learners WHERE id=$1 FOR UPDATE',[learnerId])
    const current=await editable(client,learnerId,attemptId,revision)
    if(current.attachment_ids.length>=3)throw new ApiError(400,'Keep up to three files in one task.','attachment_limit')
    const usage=(await client.query<{size:string}>('SELECT COALESCE(sum(size),0) AS size FROM attachments WHERE learner_id=$1',[learnerId])).rows[0]
    if(Number(usage.size)+bytes.length>MAX_STORED_BYTES)throw new ApiError(413,'Your saved files have reached the 100 MB limit. Remove unused draft files or export and delete your portfolio.','attachment_storage_limit')
    const id=randomUUID()
    await client.query('INSERT INTO attachments(id,learner_id,attempt_id,file_name,format,size,sha256,bytes,extracted_text,substantive_characters,extraction_hash,limitations,parser_version,privacy_declared_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,now())',[id,learnerId,attemptId,file.name,format,bytes.length,createHash('sha256').update(bytes).digest('hex'),bytes,parsed.extractedText,parsed.substantiveCharacters,hash(JSON.stringify(parsed)),JSON.stringify(parsed.limitations),parsed.parserVersion])
    await client.query("UPDATE attempts SET attachment_ids=array_append(attachment_ids,$2::uuid),revision=revision+1,status='draft',updated_at=now() WHERE id=$1",[attemptId,id])
  })
}
export async function removeAttachment(request:Request,attemptId:string,id:string,revision:number):Promise<void> {
  const learnerId=await owner(request)
  await transaction(async client=>{
    const current=await editable(client,learnerId,attemptId,revision)
    if(!current.attachment_ids.includes(id))throw new ApiError(404,'This draft file is unavailable.','attachment_missing')
    await client.query("UPDATE attempts SET attachment_ids=array_remove(attachment_ids,$2::uuid),revision=revision+1,status='draft',updated_at=now() WHERE id=$1",[attemptId,id])
    await client.query('DELETE FROM attachments WHERE id=$1 AND NOT EXISTS(SELECT 1 FROM submissions WHERE $1=ANY(attachment_ids))',[id])
  })
}
export async function downloadAttachment(request:Request,id:string,share?:string):Promise<Response> {
  let rows:{file_name:string;bytes:Buffer}[]
  if(share){
    if(!/^[A-Za-z0-9_-]{43}$/.test(share))throw new ApiError(404,'This file is unavailable.','attachment_missing')
    rows=await query('SELECT f.file_name,f.bytes FROM attachments f JOIN shares s ON s.learner_id=f.learner_id WHERE f.id=$1 AND s.token_hash=$2 AND s.revoked_at IS NULL AND s.expires_at>now() AND f.attempt_id=ANY(s.attempt_ids) AND EXISTS(SELECT 1 FROM submissions v WHERE v.attempt_id=f.attempt_id AND f.id=ANY(v.attachment_ids))',[id,hash(share)])
  }else rows=await query('SELECT file_name,bytes FROM attachments WHERE id=$1 AND learner_id=$2',[id,await owner(request)])
  if(!rows[0])throw new ApiError(404,'This file is unavailable.','attachment_missing')
  return new Response(new Uint8Array(rows[0].bytes),{headers:{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename="lumio-file.${rows[0].file_name.split('.').at(-1)}"; filename*=UTF-8''${encodeURIComponent(rows[0].file_name).replace(/['()*]/g,char=>`%${char.charCodeAt(0).toString(16).toUpperCase()}`)}`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}})
}

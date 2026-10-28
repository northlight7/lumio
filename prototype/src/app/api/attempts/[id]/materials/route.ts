import { endpoint, pathId, ApiError } from '@/lib/security'
import { getAttempt } from '@/lib/services'
import { buildWorkMaterials, zipFiles } from '@/lib/work-materials'
export const runtime='nodejs'
export const GET=(request:Request,context:{params:Promise<{id:string}>})=>endpoint(async()=>{
  const id=pathId((await context.params).id),attempt=await getAttempt(request,id)
  if(!attempt.task)throw new ApiError(409,'This archived assignment has no downloadable workpack. Choose a current task.','materials_unavailable')
  const params=new URL(request.url).searchParams,locale=params.get('locale')||attempt.locale
  if(locale!=='en'&&locale!=='zh')throw new ApiError(400,'Choose English or Traditional Chinese work materials.','invalid_locale')
  const files=buildWorkMaterials(attempt.task,locale),base=`/api/attempts/${id}/materials?locale=${locale}`,requested=params.get('file')
  if(!requested)return {files:files.map(file=>({id:file.id,fileName:file.fileName,label:file.label,format:file.format,size:file.bytes.length,downloadUrl:`${base}&file=${file.id}`})),packUrl:`${base}&file=pack`}
  const file=requested==='pack'?{fileName:'workpack.zip',bytes:zipFiles(files)}:files.find(file=>file.id===requested)
  if(!file)throw new ApiError(404,'This work material is unavailable.','material_missing')
  const mime=file.fileName.endsWith('.xlsx')?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':file.fileName.endsWith('.zip')?'application/zip':'application/octet-stream'
  return new Response(new Uint8Array(file.bytes),{headers:{'Content-Type':mime,'Content-Disposition':`attachment; filename="${file.fileName}"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}})
})

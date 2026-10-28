import { endpoint, pathId } from '@/lib/security'
import { downloadAttachment } from '@/lib/attachments'
export const runtime='nodejs'
export const GET=(request:Request,context:{params:Promise<{id:string}>})=>endpoint(async()=>{
  const {id}=await context.params
  pathId(id)
  return downloadAttachment(request,id,new URL(request.url).searchParams.get('share')||undefined)
})

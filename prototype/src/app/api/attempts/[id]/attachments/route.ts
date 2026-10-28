import { endpoint, pathId } from '@/lib/security'
import { uploadAttachment } from '@/lib/attachments'
import { getAttempt } from '@/lib/services'
export const runtime='nodejs'
export const POST=(request:Request,context:{params:Promise<{id:string}>})=>endpoint(async()=>{
  const {id}=await context.params
  pathId(id)
  await uploadAttachment(request,id)
  return getAttempt(request,id)
})

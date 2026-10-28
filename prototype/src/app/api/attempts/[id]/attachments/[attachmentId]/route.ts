import { z } from 'zod'
import { body, endpoint, pathId } from '@/lib/security'
import { removeAttachment } from '@/lib/attachments'
import { getAttempt } from '@/lib/services'
export const runtime='nodejs'
export const DELETE=(request:Request,context:{params:Promise<{id:string;attachmentId:string}>})=>endpoint(async()=>{
  const {id,attachmentId}=await context.params
  pathId(id);pathId(attachmentId)
  const data=await body(request,z.object({revision:z.number().int().nonnegative()}).strict())
  await removeAttachment(request,id,attachmentId,data.revision)
  return getAttempt(request,id)
})

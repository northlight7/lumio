import { z } from 'zod'
import { body,endpoint } from '@/lib/security'
import { resetTaskHistory } from '@/lib/services'
export const runtime='nodejs'
export const POST=(request:Request)=>endpoint(async()=>{
  await body(request,z.object({scope:z.literal('task-history'),confirm:z.literal(true)}).strict())
  return resetTaskHistory(request)
})

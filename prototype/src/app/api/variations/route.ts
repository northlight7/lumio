import { z } from 'zod'
import { endpoint, stageSchema, ApiError } from '@/lib/security'
import { listVariations } from '@/lib/variant-store'
export const runtime = 'nodejs'
export const GET = (request:Request) => endpoint(async () => {
  const params = new URL(request.url).searchParams
  const parsed = z.object({roleId:z.string().min(1).max(80),stage:stageSchema,taskId:z.string().regex(/^[a-z][a-z0-9-]{0,70}$/).optional()}).safeParse({roleId:params.get('roleId'),stage:params.get('stage') || 'taster',taskId:params.get('taskId') || undefined})
  if(!parsed.success) throw new ApiError(400,'Choose a valid role and task stage.','validation_failed')
  return listVariations(parsed.data.roleId,parsed.data.stage,parsed.data.taskId)
})

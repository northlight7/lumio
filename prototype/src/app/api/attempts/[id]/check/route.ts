import { z } from 'zod'
import { answersSchema, body, endpoint, pathId, localeSchema } from '@/lib/security'
import { checkAttempt } from '@/lib/services'
export const runtime = 'nodejs'
export const POST = (request: Request, context: { params: Promise<{ id: string }> }) => endpoint(async () => {
  const data=await body(request,z.object({answers:answersSchema,work:z.string().max(12000).optional(),locale:localeSchema.optional(),revision:z.number().int().nonnegative().optional(),consent:z.boolean().optional()}).strict())
  return checkAttempt(request,pathId((await context.params).id),data.answers,data)
})

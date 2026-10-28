import { z } from 'zod'
import { body, endpoint, localeSchema, stageSchema } from '@/lib/security'
import { startAttempt } from '@/lib/services'
export const runtime = 'nodejs'
export const POST = (request: Request) => endpoint(async () => startAttempt(request, await body(request, z.object({ roleId: z.string().min(1).max(80), stage: stageSchema, locale: localeSchema, taskId:z.string().regex(/^[a-z][a-z0-9-]{0,70}$/).optional(), variantId:z.string().uuid().optional(),newVariation:z.boolean().optional() }).strict())))

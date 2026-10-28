import { z } from 'zod'
import { body, endpoint, localeSchema } from '@/lib/security'
import { startSession } from '@/lib/services'
export const runtime = 'nodejs'
export const POST = (request: Request) => endpoint(async () => {
  const data = await body(request, z.object({ locale: localeSchema.optional().default('en'), freshGuest:z.boolean().optional().default(false) }).strict())
  return startSession(request, data.locale,data.freshGuest)
})

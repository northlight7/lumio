import { z } from 'zod'
import { body, endpoint, uuidSchema } from '@/lib/security'
import { createShare, revokeShare } from '@/lib/services'
export const runtime = 'nodejs'
export const POST = (request: Request) => endpoint(async () => createShare(request, (await body(request, z.object({ attemptIds: z.array(uuidSchema).min(1).max(20) }).strict())).attemptIds))
export const DELETE = (request: Request) => endpoint(async () => revokeShare(request, (await body(request, z.object({ id: uuidSchema }).strict())).id))

import { body, draftSchema, endpoint, pathId } from '@/lib/security'
import { getAttempt, saveAttempt } from '@/lib/services'
export const runtime = 'nodejs'
type Context = { params: Promise<{ id: string }> }
export const GET = (request: Request, context: Context) => endpoint(async () => getAttempt(request, pathId((await context.params).id)))
export const PATCH = (request: Request, context: Context) => endpoint(async () => saveAttempt(request, pathId((await context.params).id), await body(request, draftSchema)))

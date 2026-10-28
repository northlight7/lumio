import { body, endpoint, pathId, submitSchema } from '@/lib/security'
import { submitAttempt } from '@/lib/services'
export const runtime = 'nodejs'
export const POST = (request: Request, context: { params: Promise<{ id: string }> }) => endpoint(async () => submitAttempt(request, pathId((await context.params).id), await body(request, submitSchema)))

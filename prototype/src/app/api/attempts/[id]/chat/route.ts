import { body, chatSchema, endpoint, pathId } from '@/lib/security'
import { chat } from '@/lib/services'
export const runtime = 'nodejs'
export const POST = (request: Request, context: { params: Promise<{ id: string }> }) => endpoint(async () => chat(request, pathId((await context.params).id), await body(request, chatSchema)))

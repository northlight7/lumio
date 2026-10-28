import { authSchema, body, endpoint } from '@/lib/security'
import { authenticate } from '@/lib/services'
export const runtime = 'nodejs'
export const POST = (request: Request) => endpoint(async () => authenticate(request, await body(request, authSchema)))

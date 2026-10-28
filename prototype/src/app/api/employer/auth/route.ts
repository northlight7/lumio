import { body, endpoint } from '@/lib/security'
import { employerAuth, employerAuthSchema } from '@/lib/employer'
export const runtime = 'nodejs'
export const POST = (request: Request) => endpoint(async () => employerAuth(request, await body(request, employerAuthSchema)))

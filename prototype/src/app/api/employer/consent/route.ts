import { body, endpoint } from '@/lib/security'
import { changeEmployerConsent, employerConsentSchema, getEmployerConsents } from '@/lib/employer'
export const runtime = 'nodejs'
export const GET = (request: Request) => endpoint(() => getEmployerConsents(request))
export const POST = (request: Request) => endpoint(async () => changeEmployerConsent(request, await body(request, employerConsentSchema)))

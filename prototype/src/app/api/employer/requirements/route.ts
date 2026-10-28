import { body, endpoint } from '@/lib/security'
import { requirementSchema, saveEmployerRequirements } from '@/lib/employer'
export const runtime = 'nodejs'
export const PUT = (request: Request) => endpoint(async () => saveEmployerRequirements(request, await body(request, requirementSchema)))

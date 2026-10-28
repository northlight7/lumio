import { endpoint } from '@/lib/security'
import { employerDashboard } from '@/lib/employer'
export const runtime = 'nodejs'
export const GET = (request: Request) => endpoint(() => employerDashboard(request))

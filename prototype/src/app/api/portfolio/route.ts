import { endpoint } from '@/lib/security'
import { getPortfolio } from '@/lib/services'
export const runtime = 'nodejs'
export const GET = (request: Request) => endpoint(() => getPortfolio(request))

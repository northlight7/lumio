import { endpoint } from '@/lib/security'
import { exportPortfolio } from '@/lib/services'
export const runtime = 'nodejs'
export const GET = (request: Request) => endpoint(() => exportPortfolio(request))

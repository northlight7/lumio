import { endpoint } from '@/lib/security'
import { readShare } from '@/lib/services'
export const runtime = 'nodejs'
export const GET = (_request: Request, context: { params: Promise<{ token: string }> }) => endpoint(async () => readShare((await context.params).token))

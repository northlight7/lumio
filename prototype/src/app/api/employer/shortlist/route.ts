import { body, endpoint } from '@/lib/security'
import { employerShortlistSchema, saveEmployerShortlist } from '@/lib/employer'
export const runtime = 'nodejs'
export const PUT = (request: Request) => endpoint(async () => saveEmployerShortlist(request, await body(request, employerShortlistSchema)))

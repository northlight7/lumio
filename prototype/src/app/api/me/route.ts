import { z } from 'zod'
import { body, endpoint } from '@/lib/security'
import { getProfile, eraseLearner } from '@/lib/services'
export const runtime = 'nodejs'
export const GET = (request: Request) => endpoint(() => getProfile(request))
export const DELETE = (request: Request) => endpoint(async () => { await body(request, z.object({}).strict()); return eraseLearner(request) })

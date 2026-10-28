import { z } from 'zod'
import { body, endpoint } from '@/lib/security'
import { populateDemo } from '@/lib/services'
export const runtime = 'nodejs'
export const POST = (request: Request) => endpoint(async () => { await body(request, z.object({}).strict()); return populateDemo(request) })

import 'server-only'
import { createHash, createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { z, type ZodType } from 'zod'
import { secret } from './db'

const SCRYPT_OPTIONS = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }
function scrypt(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => scryptCb(password, salt, 64, SCRYPT_OPTIONS, (error, key) => error ? reject(error) : resolve(key)))
}
export const COOKIE_NAME = 'lumio_session'
export function sessionCookieName(): string {
  const name = process.env.SESSION_COOKIE_NAME ?? COOKIE_NAME
  if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(name)) throw new ApiError(503, 'The session configuration is invalid.', 'configuration_invalid')
  return name
}
export const MAX_BODY = 65536
export class ApiError extends Error {
  constructor(public status: number, message: string, public code = 'request_failed') { super(message) }
}
export const hash = (value: string) => createHash('sha256').update(value).digest('hex')
export const token = () => randomBytes(32).toString('base64url')
export const uuidSchema = z.string().uuid()
export const localeSchema = z.enum(['en', 'zh'])
export const stageSchema = z.enum(['taster', 'diagnose', 'fix', 'adapt', 'assessment'])
export const answersSchema = z.record(z.string().max(80), z.union([z.string().max(500), z.number().finite(), z.array(z.string().max(100)).max(30)])).refine(value => Object.keys(value).length <= 30, 'Too many answers')
export const draftSchema = z.object({ answers: answersSchema, work: z.string().max(12000), locale: localeSchema, revision: z.number().int().nonnegative() }).strict()
export const submitSchema = z.object({ answers: answersSchema, work: z.string().max(12000), locale: localeSchema, requestId: uuidSchema, revision:z.number().int().nonnegative().optional(), consent:z.boolean().optional() }).strict()
export const chatSchema = z.object({ message: z.string().trim().min(1).max(2000), persona: z.enum(['coach', 'manager']), consent: z.literal(true), requestId: uuidSchema }).strict()
export const authSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('register'), email: z.string().email().max(254).transform(v => v.trim().toLowerCase()), password: z.string().min(12).max(128), name: z.string().trim().min(1).max(80) }).strict(),
  z.object({ action: z.literal('login'), email: z.string().email().max(254).transform(v => v.trim().toLowerCase()), password: z.string().min(12).max(128) }).strict(),
  z.object({ action: z.literal('logout') }).strict(),
])

export function appOrigin(): string {
  const configured = process.env.APP_ORIGIN
  if (!configured && process.env.NODE_ENV === 'production') throw new ApiError(503, 'Application origin has not been configured.', 'configuration_missing')
  const url = new URL(configured || 'http://localhost:3000')
  if (url.origin !== (configured || 'http://localhost:3000') || !['http:', 'https:'].includes(url.protocol)) throw new ApiError(503, 'Application origin is invalid.', 'configuration_invalid')
  return url.origin
}
export function checkWrite(request: Request): void {
  if (request.headers.get('origin') !== appOrigin()) throw new ApiError(403, 'This request must come from Lumio.', 'origin_rejected')
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new ApiError(415, 'Send an application/json request.', 'content_type')
  const declared = request.headers.get('content-length')
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > MAX_BODY)) throw new ApiError(413, 'The request is too large.', 'body_too_large')
}
export async function body<T>(request: Request, schema: ZodType<T>): Promise<T> {
  checkWrite(request)
  const reader = request.body?.getReader()
  if (!reader) throw new ApiError(400, 'A JSON body is required.', 'invalid_body')
  let size = 0
  const chunks: Uint8Array[] = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_BODY) { await reader.cancel(); throw new ApiError(413, 'The request is too large.', 'body_too_large') }
    chunks.push(value)
  }
  let value: unknown
  try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { throw new ApiError(400, 'The JSON body is invalid.', 'invalid_body') }
  const parsed = schema.safeParse(value)
  if (!parsed.success) throw new ApiError(400, 'Some fields are missing or invalid.', 'validation_failed')
  return parsed.data
}
export function sessionToken(request: Request): string | undefined {
  const name = sessionCookieName()
  const value = request.headers.get('cookie')?.split(';').map(v => v.trim()).find(v => v.startsWith(`${name}=`))?.slice(name.length + 1)
  return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : undefined
}
export function sessionCookie(value: string, clear = false): string {
  const secure = appOrigin().startsWith('https:') ? '; Secure' : ''
  return `${sessionCookieName()}=${clear ? '' : value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${clear ? 0 : 60 * 60 * 24 * 30}${secure}`
}
export function ipBucket(request: Request): string {
  // Only Caddy may set this header in the production private app network.
  const ip = request.headers.get('x-forwarded-for')?.split(',').pop()?.trim() || 'local'
  const salt = secret('RATE_LIMIT_SECRET') || secret('POSTGRES_PASSWORD') || 'lumio-local-rate-limit'
  return createHmac('sha256', salt).update(ip).digest('hex')
}
export async function passwordHash(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex')
  const key = await scrypt(password, salt)
  return `scrypt-32768-8-3:${salt}:${key.toString('hex')}`
}
export async function verifyPassword(password: string, encoded: string | null): Promise<boolean> {
  const [method, salt, expected] = (encoded || '').split(':')
  const valid = method === 'scrypt-32768-8-3' && /^[a-f0-9]{32}$/.test(salt || '') && /^[a-f0-9]{128}$/.test(expected || '')
  const key = await scrypt(password, valid ? salt : '00000000000000000000000000000000')
  return valid && timingSafeEqual(key, Buffer.from(expected, 'hex'))
}
export async function endpoint(run: () => Promise<unknown | Response>): Promise<Response> {
  try {
    const result = await run()
    return result instanceof Response ? result : Response.json(result, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (error instanceof ApiError) return Response.json({ error: error.message, code: error.code }, { status: error.status, headers: { 'Cache-Control': 'no-store' } })
    console.error(JSON.stringify({ event: 'api_failure', kind: error instanceof Error ? error.name : 'unknown' }))
    return Response.json({ error: 'Lumio could not complete this request. Your saved work is safe. Please retry.', code: 'service_error' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}

export function pathId(value: string): string {
  const result = uuidSchema.safeParse(value)
  if (!result.success) throw new ApiError(400, 'The resource identifier is invalid.', 'invalid_id')
  return result.data
}

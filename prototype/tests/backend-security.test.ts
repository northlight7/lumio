import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
import { authSchema, body, checkWrite, draftSchema, hash, passwordHash, sessionCookie, sessionCookieName, sessionToken, token, verifyPassword, MAX_BODY } from '../src/lib/security'

const request = (value: unknown, origin = 'http://localhost:3000') => new Request('http://localhost:3000/api/session', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(value) })
afterEach(() => vi.unstubAllEnvs())
describe('request and account boundaries', () => {
  it('rejects cross-origin JSON writes', () => {
    vi.stubEnv('APP_ORIGIN', 'http://localhost:3000')
    expect(() => checkWrite(request({}, 'https://attacker.example'))).toThrow('come from Lumio')
    expect(() => checkWrite(request({}))).not.toThrow()
  })
  it('rejects oversized streamed request bodies', async () => {
    vi.stubEnv('APP_ORIGIN', 'http://localhost:3000')
    await expect(body(request({ action: 'login', email: 'a@example.com', password: 'a'.repeat(MAX_BODY) }), authSchema)).rejects.toMatchObject({ status: 413 })
  })
  it('accepts the displayed maximum Traditional Chinese draft within the byte limit', async () => {
    vi.stubEnv('APP_ORIGIN', 'http://localhost:3000')
    const work = '界'.repeat(12000)
    const payload = { answers: { decision: 'current-source' }, work, locale: 'zh', revision: 0 }
    expect(Buffer.byteLength(JSON.stringify(payload), 'utf8')).toBeGreaterThan(32768)
    expect((await body(request(payload), draftSchema)).work).toBe(work)
  })
  it('applies the character limit independently from the larger transport byte limit', async () => {
    vi.stubEnv('APP_ORIGIN', 'http://localhost:3000')
    const payload = { answers: {}, work: '界'.repeat(12001), locale: 'zh', revision: 0 }
    expect(Buffer.byteLength(JSON.stringify(payload), 'utf8')).toBeLessThan(MAX_BODY)
    await expect(body(request(payload), draftSchema)).rejects.toMatchObject({ status: 400, code: 'validation_failed' })
  })
  it('rejects unrecognized auth fields and short registration passwords', async () => {
    vi.stubEnv('APP_ORIGIN', 'http://localhost:3000')
    await expect(body(request({ action: 'register', email: 'a@example.com', name: 'A', password: 'short', ownerId: 'forged' }), authSchema)).rejects.toMatchObject({ status: 400 })
  })
  it('normalizes account email', async () => {
    vi.stubEnv('APP_ORIGIN', 'http://localhost:3000')
    const parsed = await body(request({ action: 'register', email: 'A@EXAMPLE.COM', name: 'A', password: 'safe-long-password' }), authSchema)
    expect(parsed).toMatchObject({ email: 'a@example.com' })
  })
  it('uses unique salted scrypt digests and rejects wrong or missing hashes', async () => {
    const first = await passwordHash('safe-long-password')
    const second = await passwordHash('safe-long-password')
    expect(first).not.toEqual(second)
    expect(first).toMatch(/^scrypt-32768-8-3:/)
    expect(await verifyPassword('safe-long-password', first)).toBe(true)
    expect(await verifyPassword('wrong-password', first)).toBe(false)
    expect(await verifyPassword('safe-long-password', null)).toBe(false)
  })
  it('isolates configured QA sessions from production cookies on the same hostname',()=>{
    vi.stubEnv('APP_ORIGIN','http://127.0.0.1:3300')
    vi.stubEnv('SESSION_COOKIE_NAME','lumio_qa_session')
    const qa=token()
    const production=token()
    expect(sessionCookieName()).toBe('lumio_qa_session')
    expect(sessionCookie(qa)).toBe(`lumio_qa_session=${qa}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000`)
    expect(sessionToken(new Request('http://127.0.0.1:3300',{headers:{cookie:`lumio_session=${production}; lumio_qa_session=${qa}`}}))).toBe(qa)
    expect(sessionToken(new Request('http://127.0.0.1:3300',{headers:{cookie:`lumio_session=${production}`}}))).toBeUndefined()
    expect(sessionCookie('',true)).toContain('lumio_qa_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0')
  })
  it('rejects invalid configurable cookie names before creating or reading headers',()=>{
    for (const name of ['', 'bad name','bad=name','bad;name','qa\r\nSet-Cookie: forged=1','a'.repeat(65)]) {
      vi.stubEnv('SESSION_COOKIE_NAME',name)
      expect(()=>sessionCookieName()).toThrow('session configuration is invalid')
      expect(()=>sessionCookie(token())).toThrow('session configuration is invalid')
      expect(()=>sessionToken(new Request('http://localhost'))).toThrow('session configuration is invalid')
    }
  })
  it('uses high-entropy tokens and hardened HTTPS cookies', () => {
    vi.stubEnv('APP_ORIGIN', 'https://lumio.example')
    const value = token()
    expect(value).toHaveLength(43)
    expect(hash(value)).not.toContain(value)
    const cookie = sessionCookie(value)
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).toContain('Secure')
    expect(sessionToken(new Request('https://lumio.example', { headers: { cookie } }))).toBe(value)
    expect(sessionToken(new Request('https://lumio.example', { headers: { cookie: 'lumio_session=invalid' } }))).toBeUndefined()
  })
})

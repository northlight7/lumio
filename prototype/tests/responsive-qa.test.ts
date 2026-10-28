import { describe,it,expect,vi,afterEach } from 'vitest'
afterEach(()=>{vi.unstubAllEnvs();vi.resetModules()})
describe('local responsive verification preserves production framing security',()=>{
 it('keeps deny and no ancestors in production even if a development flag leaks',async()=>{
  vi.stubEnv('NODE_ENV','production');vi.stubEnv('LUMIO_RESPONSIVE_QA','true');vi.stubEnv('LUMIO_QA_BUILD_DIR','isolated-gauntlet-2')
  const {default:config}=await import('../next.config')
  const headers=(await config.headers!())[0].headers
  expect(headers.find(h=>h.key==='X-Frame-Options')?.value).toBe('DENY')
  expect(headers.find(h=>h.key==='Content-Security-Policy')?.value).toContain("frame-ancestors 'none'")
  expect(config.distDir).toBe('.next')
 })
 it('only allows same-origin embedding in explicitly enabled local development',async()=>{
  vi.stubEnv('NODE_ENV','development');vi.stubEnv('LUMIO_RESPONSIVE_QA','true')
  const {default:config}=await import('../next.config')
  const headers=(await config.headers!())[0].headers
  expect(headers.find(h=>h.key==='X-Frame-Options')?.value).toBe('SAMEORIGIN')
  expect(headers.find(h=>h.key==='Content-Security-Policy')?.value).toContain("frame-ancestors 'self'")
 })
})


describe('responsive preview route is unavailable outside explicit development QA',()=>{
 it('returns the real Next404 even if the QA flag leaks into production',async()=>{
  vi.stubEnv('NODE_ENV','production');vi.stubEnv('LUMIO_RESPONSIVE_QA','true')
  const {default:page}=await import('../src/app/dev-preview/page')
  await expect(page({searchParams:Promise.resolve({width:'1280',page:'employers'})})).rejects.toMatchObject({digest:'NEXT_HTTP_ERROR_FALLBACK;404'})
 })
 it('returns the real Next404 in development when QA is not enabled',async()=>{
  vi.stubEnv('NODE_ENV','development');vi.stubEnv('LUMIO_RESPONSIVE_QA','false')
  const {default:page}=await import('../src/app/dev-preview/page')
  await expect(page({searchParams:Promise.resolve({width:'390'})})).rejects.toMatchObject({digest:'NEXT_HTTP_ERROR_FALLBACK;404'})
 })
})

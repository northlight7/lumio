import { test, expect, type APIRequestContext } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import type { Attempt } from '../../src/lib/types'
const origin = process.env.TEST_ORIGIN || 'http://localhost:3100'
async function post(client: APIRequestContext, path: string, data: unknown = {}) {
  return client.post(path, { data, headers: { Origin: origin }, timeout: 120000 })
}
test('private drafts, revision conflicts, immutable submissions and revocable shares', async ({ playwright }) => {
  test.setTimeout(120000)
  const a = await playwright.request.newContext({ baseURL: origin })
  const b = await playwright.request.newContext({ baseURL: origin })
  try {
    expect((await post(a,'/api/session')).ok()).toBeTruthy()
    expect((await post(b,'/api/session')).ok()).toBeTruthy()
    const response = await post(a,'/api/attempts',{roleId:'data-analyst',stage:'taster',locale:'en'})
    expect(response.ok()).toBeTruthy()
    const attempt = await response.json() as Attempt
    expect((await b.get(`/api/attempts/${attempt.id}`)).status()).toBe(404)
    const answers = Object.fromEntries(attempt.task!.questions.map(q => [q.id,q.type==='number'?0:q.type==='multi'?[q.options![0].value]:q.options![0].value]))
    const draft = {answers,work:'A saved analysis draft. I have reviewed the task sources but have not yet completed calculations. I need to validate the dataset and report uncertainty.',locale:'en',revision:attempt.revision}
    const saved = await a.patch(`/api/attempts/${attempt.id}`,{data:draft,headers:{Origin:origin}})
    expect(saved.ok()).toBeTruthy()
    expect((await a.patch(`/api/attempts/${attempt.id}`,{data:draft,headers:{Origin:origin}})).status()).toBe(409)
    const current = await saved.json()
    expect((await a.get(`/api/attempts/${attempt.id}`)).ok()).toBeTruthy()
    const forged = await post(a,`/api/attempts/${attempt.id}/submit`,{...draft,revision:undefined,score:100,requestId:randomUUID()})
    expect(forged.status()).toBe(400)
    const payload={answers:current.answers,work:current.work,locale:'en',consent:true,requestId:randomUUID()}
    const first=await post(a,`/api/attempts/${attempt.id}/submit`,payload)
    expect(first.ok()).toBeTruthy()
    const second=await post(a,`/api/attempts/${attempt.id}/submit`,payload)
    expect(second.ok()).toBeTruthy()
    expect((await second.json()).submissions).toHaveLength(1)
    const share=await post(a,'/api/share',{attemptIds:[attempt.id]})
    expect(share.ok()).toBeTruthy()
    const grant=await share.json()
    const shared=await b.get(grant.url.replace(origin,''))
    // The browser share route itself is public. The report API enforces the token.
    expect(shared.ok()).toBeTruthy()
    const token=grant.url.split('/').pop()
    const report=await b.get(`/api/share/${token}`)
    expect(report.ok()).toBeTruthy()
    const entries=(await report.json()).attempts
    expect(entries).toHaveLength(1)
    expect(entries[0].messages || []).toHaveLength(0)
    expect((await b.delete('/api/share',{data:{id:grant.id},headers:{Origin:origin}})).status()).toBe(404)
    expect((await a.delete('/api/share',{data:{id:grant.id},headers:{Origin:origin}})).ok()).toBeTruthy()
    expect((await b.get(`/api/share/${token}`)).status()).toBe(404)
  } finally {
    await a.delete('/api/me',{data:{},headers:{Origin:origin}})
    await b.delete('/api/me',{data:{},headers:{Origin:origin}})
    await a.dispose()
    await b.dispose()
  }
})
test('origin, consent, stage prerequisites and validation are enforced',async({playwright})=>{
  test.setTimeout(90000)
  const client=await playwright.request.newContext({baseURL:origin})
  try {
    expect((await client.post('/api/session',{data:{},headers:{Origin:'https://evil.example'}})).status()).toBe(403)
    expect((await post(client,'/api/session')).ok()).toBeTruthy()
    const locked=await post(client,'/api/attempts',{roleId:'ai-engineer',stage:'assessment',locale:'en'})
    expect(locked.status()).toBe(403)
    const response=await post(client,'/api/attempts',{roleId:'ai-engineer',stage:'taster',locale:'en'})
    const attempt=await response.json()
    const denied=await post(client,`/api/attempts/${attempt.id}/chat`,{message:'Help me',persona:'coach',consent:false,requestId:randomUUID()})
    expect(denied.status()).toBe(400)
    const invalid=await post(client,'/api/attempts',{roleId:'unknown',stage:'taster',locale:'en'})
    expect(invalid.status()).toBe(404)
  } finally {
    await client.delete('/api/me',{data:{},headers:{Origin:origin}})
    await client.dispose()
  }
})
test('registration rotates identity and login restores persisted work',async({playwright})=>{
  test.setTimeout(90000)
  const client=await playwright.request.newContext({baseURL:origin})
  const email=`test-${randomUUID()}@example.test`
  const password=`Test!${randomUUID()}`
  try{
    await post(client,'/api/session')
    const before=await client.storageState()
    const attempt=await post(client,'/api/attempts',{roleId:'ux-designer',stage:'taster',locale:'zh'})
    const owned=(await attempt.json()).id
    const registered=await post(client,'/api/auth',{action:'register',email,password,name:'QA Learner'})
    expect(registered.ok()).toBeTruthy()
    const after=await client.storageState()
    expect(after.cookies[0].value).not.toBe(before.cookies[0].value)
    const old=await playwright.request.newContext({baseURL:origin,storageState:before})
    expect((await old.get('/api/me')).status()).toBe(401)
    await old.dispose()
    expect((await post(client,'/api/auth',{action:'logout'})).ok()).toBeTruthy()
    expect((await client.get('/api/me')).status()).toBe(401)
    expect((await post(client,'/api/auth',{action:'login',email,password})).ok()).toBeTruthy()
    expect((await client.get(`/api/attempts/${owned}`)).ok()).toBeTruthy()
  }finally{
    await client.delete('/api/me',{data:{},headers:{Origin:origin}})
    await client.dispose()
  }
})

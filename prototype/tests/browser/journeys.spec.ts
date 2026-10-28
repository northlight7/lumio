import { test, expect } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Evaluation, Stage } from '../../src/lib/types'
import type { GeneratedVariant } from '../../src/lib/ai-curriculum'
import { roles } from '../../src/lib/content'
const origin=process.env.TEST_ORIGIN||'http://localhost:3100'
test('all current roles and the connected pathway produce durable evidence',async({request})=>{
test.setTimeout(1200000)
const bankFile=process.env.CURRICULUM_CATALOG_PATH || 'curriculum/company-catalog.json'
const previous=JSON.parse(await readFile(resolve(process.cwd(),bankFile),'utf8')) as {variants:GeneratedVariant[]}
const modern=JSON.parse(await readFile(resolve(process.cwd(),'curriculum/task-family-catalog.json'),'utf8')) as {variants:GeneratedVariant[]}
const core=JSON.parse(await readFile(resolve(process.cwd(),'curriculum/core-catalog.json'),'utf8')) as {variants:GeneratedVariant[]}
const bank={variants:[...core.variants,...modern.variants,...previous.variants.filter(variant=>variant.stage!=='taster')]}
const assignments:{roleId:string;stage:Stage}[]=roles.map(role=>({roleId:role.id,stage:'taster'}))
assignments.push(...(['diagnose','fix','adapt','assessment'] as Stage[]).map(stage=>({roleId:'ai-engineer',stage})))
const headers={Origin:origin}
const capturedGrades:{roleId:string;stage:Stage;variantId:string;evaluation?:Evaluation;error?:unknown}[]=[]
try{
expect((await request.post('/api/session',{data:{},headers})).ok()).toBeTruthy()
for(const assignment of assignments){
const fixture=bank.variants.find(v=>v.roleId===assignment.roleId&&v.stage===assignment.stage)!
expect(fixture).toBeTruthy()
expect(fixture.task.company?.id).toBe(roles.find(role=>role.id===fixture.roleId)?.companyId)
const start=await request.post('/api/attempts',{data:{roleId:fixture.roleId,stage:fixture.stage,variantId:fixture.id,locale:'zh'},headers})
expect(start.ok(),await start.text()).toBeTruthy()
const attempt=await start.json()
if(fixture.stage==='assessment'){
expect((await request.post(`/api/attempts/${attempt.id}/check`,{data:{answers:fixture.rubric.expectedAnswers,work:fixture.rubric.exemplar.zh,locale:'zh',consent:true},headers})).status()).toBe(403)
for(const persona of ['coach','manager']) expect((await request.post(`/api/attempts/${attempt.id}/chat`,{data:{message:'Give me a hint',persona,consent:true,requestId:randomUUID()},headers})).status()).toBe(403)
}
const payload={answers:fixture.rubric.expectedAnswers,work:fixture.rubric.exemplar.zh,locale:'zh',consent:true,requestId:randomUUID()}
const submitted=await request.post(`/api/attempts/${attempt.id}/submit`,{data:payload,headers,timeout:120000})
const responseBody=await submitted.json()
if(!submitted.ok()) capturedGrades.push({roleId:fixture.roleId,stage:fixture.stage,variantId:fixture.id,error:responseBody})
expect(submitted.ok(),`${fixture.roleId}/${fixture.stage} ${fixture.id}: ${JSON.stringify(responseBody)}`).toBeTruthy()
const result=responseBody
capturedGrades.push({roleId:fixture.roleId,stage:fixture.stage,variantId:fixture.id,evaluation:result.submissions.at(-1).evaluation})
expect(result.submissions.at(-1).evaluation.source).toBe('deepseek')
expect(result.submissions.at(-1).evaluation.score).toBeGreaterThanOrEqual(70)
expect(result.submissions.at(-1).evaluation.passed).toBe(true)
if(fixture.stage==='assessment'){
expect((await request.post(`/api/attempts/${attempt.id}/submit`,{data:payload,headers})).ok()).toBeTruthy()
expect((await request.post(`/api/attempts/${attempt.id}/submit`,{data:{...payload,requestId:randomUUID()},headers})).status()).toBe(409)
expect((await request.patch(`/api/attempts/${attempt.id}`,{data:{answers:fixture.rubric.expectedAnswers,work:'change',locale:'zh',revision:result.revision},headers})).status()).toBe(409)
}
}
const portfolio=await request.get('/api/portfolio')
expect((await portfolio.json()).attempts).toHaveLength(roles.length+4)
const exported=await request.get('/api/export')
expect(exported.ok()).toBeTruthy()
expect(exported.headers()['content-disposition']).toContain('attachment')
}finally{
await request.delete('/api/me',{data:{},headers})
await writeFile(resolve(process.cwd(),'../.internal/prototype/live-journey-report.json'),JSON.stringify({origin,checkedAt:new Date().toISOString(),grades:capturedGrades},null,2))
}
})
test('discovery, language switch, real draft saving and mobile navigation',async({page})=>{
await page.request.post('/api/auth',{data:{action:'register',email:`journey-${randomUUID()}@example.test`,password:`qa-${randomUUID()}`,name:'Isolated QA learner'},headers:{Origin:origin}})
await page.goto('/')
await expect(page.locator('.career-card')).toHaveCount(roles.length)
await page.getByRole('button',{name:'繁',exact:true}).click()
await expect(page.locator('html')).toHaveAttribute('lang','zh-Hant')
await page.getByRole('button',{name:'EN',exact:true}).click()
await page.locator('.career-card').filter({has:page.getByRole('heading',{name:'Data analyst',exact:true})}).getByRole('button',{name:/^Explore /}).click()
await page.getByRole('dialog').locator('.task-family-card').first().click()
await expect(page.getByRole('heading',{name:'Data analyst',exact:true})).toBeVisible()
const textarea=page.locator('textarea').first()
await textarea.fill('My persistent draft from the browser journey')
await page.getByRole('button',{name:'Save',exact:true}).click()
await expect(page.getByRole('status').filter({hasText:'Your draft is saved.'})).toBeVisible()
await page.reload()
await page.locator('.career-card').filter({has:page.getByRole('heading',{name:'Data analyst',exact:true})}).getByRole('button',{name:/^Explore /}).click()
await page.getByRole('dialog').locator('.task-family-card').first().click()
await expect(page.locator('textarea').first()).toHaveValue('My persistent draft from the browser journey')
await page.setViewportSize({width:390,height:844})
expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false)
expect(await page.locator('.main-content').evaluate(element=>element.scrollWidth>element.clientWidth)).toBe(false)
await expect(page.getByRole('button',{name:'My workspace',exact:true})).toBeVisible()
await page.request.delete('/api/me',{data:{},headers:{Origin:origin}})
})
test('presentation demo is labelled, persists revisions and preserves share provenance',async({page})=>{
  test.setTimeout(120000)
  try {
  await page.goto('/')
  await page.getByRole('button',{name:'Open presentation demo',exact:true}).click()
  await expect(page.locator('.demo-banner')).toContainText('Presentation demo')
  const me=await page.request.get('/api/me')
  const profile=await me.json()
  expect(profile.demo).toBe(true)
  expect(profile.attempts.length).toBeGreaterThanOrEqual(5)
  expect(profile.attempts.some((a:{stage:string})=>a.stage==='assessment')).toBe(false)
  const fix=profile.attempts.find((a:{stage:string})=>a.stage==='fix')
  expect(fix.submissions.length).toBeGreaterThanOrEqual(2)
  expect(fix.submissions[0].evaluation.passed).toBe(false)
  expect(fix.submissions.at(-1).evaluation.passed).toBe(true)
  expect(fix.submissions.at(-1).evaluation.source).toBe('deepseek')
  await expect(page.locator('.variation-badge')).toContainText('Variation')
  await expect(page.getByRole('button',{name:'Browse variations',exact:true})).toBeVisible()
  await page.getByRole('button',{name:'My portfolio',exact:true}).click()
  await expect(page.getByRole('heading',{name:'Your work portfolio',exact:true})).toBeVisible()
  const card=page.locator('.evidence-card').filter({has:page.getByRole('heading',{name:fix.task.title.en,exact:true})})
  await card.locator('.submission-detail summary').first().click()
  await expect(card.locator('.submission-body').first()).toBeVisible()
  const firstVersion=card.locator('.submission-body').first()
  await expect(firstVersion.locator('.ai-review-summary')).toBeVisible()
  await expect(firstVersion.locator('.ai-next-steps')).toBeVisible()
  await expect(firstVersion.locator('.check-list')).not.toBeVisible()
  await firstVersion.getByText('See score breakdown',{exact:true}).click()
  await expect(firstVersion.locator('.check-item')).toHaveCount(fix.submissions[0].evaluation.checks.length)
  await expect(firstVersion.locator('.check-list')).toBeVisible()
  expect(await page.locator('body').innerText()).not.toMatch(/DeepSeek|V4\.1|深度求索/i)
  await page.getByRole('button',{name:'繁',exact:true}).click()
  expect(await page.locator('body').innerText()).not.toMatch(/DeepSeek|V4\.1|深度求索/i)
  await page.getByRole('button',{name:'EN',exact:true}).click()
  await expect(page.getByRole('button',{name:'Create sharing link',exact:true})).toBeDisabled()
  await card.getByRole('checkbox').check()
  await page.getByRole('button',{name:'Create sharing link',exact:true}).click()
  await expect(page.locator('#share-url')).toHaveValue(new RegExp('/share/'))
  const shareUrl=await page.locator('#share-url').inputValue()
  const token=shareUrl.split('/').pop()
  const report=await page.request.get(`/api/share/${token}`)
  expect((await report.json()).demo).toBe(true)
  await page.getByRole('button',{name:'Copy link',exact:true}).click()
  await expect(page.locator('.notice-banner')).toContainText(/Link copied|Select the link above and copy/)
  const popupPromise=page.waitForEvent('popup')
  await page.getByRole('link',{name:'Preview',exact:true}).click()
  const preview=await popupPromise
  await expect(preview.locator('.demo-banner')).toContainText('Presentation demo')
  expect(await preview.locator('body').innerText()).not.toMatch(/DeepSeek|V4\.1|深度求索/i)
  await preview.getByRole('button',{name:'繁',exact:true}).click()
  expect(await preview.locator('body').innerText()).not.toMatch(/DeepSeek|V4\.1|深度求索/i)
  await preview.getByRole('button',{name:'EN',exact:true}).click()
  await preview.close()
  const downloadPromise=page.waitForEvent('download')
  await page.getByRole('button',{name:'Export my data',exact:true}).click()
  expect((await downloadPromise).suggestedFilename()).toBe('lumio-portfolio.json')
  await page.getByRole('button',{name:'Revoke',exact:true}).click()
  await expect(page.locator('.active-shares')).toHaveCount(0)
  expect((await page.request.get(`/api/share/${token}`)).status()).toBe(404)
  await page.getByRole('button',{name:'Delete my Lumio data',exact:true}).click()
  await page.getByRole('button',{name:'Keep my data',exact:true}).click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await page.getByRole('button',{name:'Delete my Lumio data',exact:true}).click()
  await page.getByRole('button',{name:'Delete permanently',exact:true}).click()
  await expect(page.locator('.notice-banner')).toContainText('have been deleted')
  expect((await page.request.get('/api/me')).status()).toBe(401)
  } finally {
  await page.request.delete('/api/me',{data:{},headers:{Origin:origin}})
  }
})

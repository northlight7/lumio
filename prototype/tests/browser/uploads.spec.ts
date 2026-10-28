import { randomUUID } from 'node:crypto'
import { test, expect, type Page } from '@playwright/test'
import { mkdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Attempt, Attachment, Profile } from '../../src/lib/types'
import type { GeneratedVariant } from '../../src/lib/ai-curriculum'
import { getTaskFamilies } from '../../src/lib/task-families'

const origin = process.env.TEST_ORIGIN || 'http://localhost:3100'
const headers = { Origin: origin }
const screenshots = resolve(process.cwd(), '../.internal/prototype/expansion/upload-audit', String(Date.now()))
test.use({ reducedMotion: 'reduce' })
async function current(page: Page) {
  const profile = await (await page.request.get('/api/me')).json() as Profile
  const familyId = await page.getByRole('combobox', { name: 'Task type', exact: true }).inputValue()
  return profile.attempts.find(item => item.roleId === 'ai-engineer' && item.task?.taskId === familyId)!
}
async function openReady(page: Page) {
  const response=await page.request.post('/api/auth',{data:{action:'register',email:`upload-${randomUUID()}@example.test`,password:`qa-${randomUUID()}`,name:'Upload QA'},headers})
  expect(response.ok()).toBeTruthy()
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Account: Upload QA', exact: true })).toBeEnabled()
  const available: { family: string; ids: string[] }[] = []
  for (const family of getTaskFamilies('ai-engineer')) {
    const response = await page.request.get(`/api/variations?roleId=ai-engineer&stage=taster&taskId=${family.id}`)
    expect(response.ok()).toBeTruthy()
    const body = await response.json()
    if (body.variations.length >= 2) available.push({ family: family.id, ids: body.variations.map((item: { id: string }) => item.id) })
  }
  expect(available.length, 'Import at least one reviewed two-case AI task family before this upload suite').toBeGreaterThan(0)
  const chosen = available[0]
  await page.getByRole('button', { name: 'Explore AI engineer at HKTVmall', exact: true }).click()
  await page.locator(`[data-task-id="${chosen.family}"]`).click()
  await expect(page.getByRole('combobox', { name: 'Task type', exact: true })).toHaveValue(chosen.family)
  const attempt = await current(page)
  return { attempt, families: available }
}
async function upload(page: Page, name: string, contents: string, type = 'text/plain') {
  await page.locator('.upload-permission input').check()
  await page.locator('#work-file-upload').setInputFiles({ name, mimeType: type, buffer: Buffer.from(contents) })
  await expect(page.locator('.work-files .attachment-heading strong').filter({ hasText: name })).toBeVisible()
  await expect(page.locator('.work-actions button').first()).toBeEnabled()
}
async function fillDecisions(page: Page, fixture: GeneratedVariant) {
  if(await page.locator('.optional-decisions').getAttribute('open')===null)await page.locator('.optional-decisions summary').click()
  for (const question of fixture.task.questions) {
    const answer = fixture.rubric.expectedAnswers[question.id]
    if (question.type === 'number') await page.locator(`#q-${question.id}`).fill(String(answer))
    else if (question.type === 'select') await page.locator(`#q-${question.id}`).selectOption(String(answer))
    else for (const option of question.options!) await page.locator(`#q-${question.id}`).getByRole('checkbox', { name: option.label.en, exact: true }).setChecked((answer as string[]).includes(option.value))
  }
}
async function cleanup(page: Page) { await page.request.delete('/api/me', { data: {}, headers }) }

// These are controlled QA work samples. They are not learner-earned results.
test('real CSV/TXT uploads, extraction errors and family switching preserve drafts and files', async ({ page }) => {
  test.setTimeout(180000)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  try {
    const { attempt, families } = await openReady(page)
    const prose = 'This isolated draft records the evidence reviewed, the decision, the remaining uncertainty and the next verification step.'
    await page.locator('#work-response').fill(prose)
    const csv = 'Metric,Value\nBaseline,100\nNotes,"Fictional test observations only. Check the source policy and report uncertainty before making a claim."\n'
    await upload(page, 'QA_Evidence.csv', csv, 'text/csv')
    await expect(page.locator('#work-response')).toHaveValue(prose)
    const notes = 'Supplemental fictional work notes. I distinguish the supplied facts from assumptions and will confirm the boundary before reporting any result.'
    const dropped = await page.evaluateHandle(contents => {
      const transfer = new DataTransfer()
      transfer.items.add(new File([contents], 'QA_Notes.txt', { type: 'text/plain' }))
      return transfer
    }, notes)
    await page.locator('.file-dropzone').dispatchEvent('dragover', { dataTransfer: dropped })
    await expect(page.locator('.file-dropzone')).toHaveClass(/dragging/)
    await page.locator('.file-dropzone').dispatchEvent('drop', { dataTransfer: dropped })
    await expect(page.locator('.work-files .attachment-heading strong').filter({ hasText: 'QA_Notes.txt' })).toBeVisible()
    await expect(page.locator('.work-actions button').first()).toBeEnabled()
    await expect(page.locator('.file-dropzone')).not.toHaveClass(/dragging/)
    await dropped.dispose()
    const persisted = await current(page)
    expect(persisted.work).toBe(prose)
    expect(persisted.attachments).toHaveLength(2)
    expect(persisted.attachments![0].extractedText).toContain('Baseline')
    const file = persisted.attachments!.find(file => file.fileName === 'QA_Notes.txt')!
    const original = await page.request.get(file.downloadUrl)
    expect(original.ok()).toBeTruthy()
    expect(await original.text()).toBe(notes)
    const outsider = await page.context().browser()!.newContext()
    expect((await outsider.request.get(origin + file.downloadUrl)).status()).toBe(401)
    await outsider.close()
    await page.locator('#work-file-upload').setInputFiles({ name: 'corrupt.txt', mimeType: 'text/plain', buffer: Buffer.from([0, 1, 2, 3]) })
    await expect(page.locator('.work-files .file-error')).toContainText('could not be read')
    expect((await current(page)).attachments).toHaveLength(2)
    const revised = prose + ' This revision must survive file removal and task switching.'
    await page.locator('#work-response').fill(revised)
    await page.getByRole('button', { name: 'Remove QA_Evidence.csv', exact: true }).click()
    await expect(page.locator('.work-files .attachment-file')).toHaveCount(1)
    expect((await current(page)).work).toBe(revised)
    if (families.length > 1) {
      await page.getByRole('combobox', { name: 'Task type', exact: true }).selectOption(families[1].family)
      await expect(page.getByRole('combobox', { name: 'Task type', exact: true })).toHaveValue(families[1].family)
      await expect(page.locator('#work-response')).toHaveValue('')
      await expect(page.locator('.work-files .attachment-file')).toHaveCount(0)
      await page.getByRole('combobox', { name: 'Task type', exact: true }).selectOption(attempt.task!.taskId!)
      await expect(page.locator('#work-response')).toHaveValue(revised)
      await expect(page.locator('.work-files .attachment-file')).toHaveCount(1)
    }
    await page.getByRole('button', { name: 'Try another variation', exact: true }).click()
    await expect(page.locator('#work-response')).toHaveValue('')
    await expect(page.locator('.work-files .attachment-file')).toHaveCount(0)
    await page.getByRole('button', { name: 'Browse variations', exact: true }).click()
    await page.locator(`[data-variant-id="${attempt.variantId}"]`).click()
    await expect(page.locator('#work-response')).toHaveValue(revised)
    await expect(page.locator('.work-files .attachment-file')).toHaveCount(1)
    await page.getByRole('button', { name: '繁', exact: true }).click()
    await expect(page.getByRole('combobox', { name: '任務類型', exact: true })).toHaveValue(attempt.task!.taskId!)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.locator('.work-files').scrollIntoViewIfNeeded()
    await expect(page.getByRole('link', { name: '下載 QA_Notes.txt', exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
    const longName = 'QA_Long_File_Name_With_Source_Evidence_And_Reasoning_For_The_Final_Review.txt'
    await upload(page, longName, `${notes}\n${'Reference,Observed value,Uncertainty\n'.repeat(40)}`)
    const longFile = page.locator('.work-files .attachment-file').filter({ has: page.locator('strong').filter({ hasText: longName }) })
    await longFile.locator('summary').click()
    await longFile.locator('.attachment-heading').scrollIntoViewIfNeeded()
    const actionBounds = await longFile.locator('.attachment-heading .icon-button').evaluateAll(elements => elements.map(element => { const box = element.getBoundingClientRect(); return { top: box.top, width: box.width, height: box.height } }))
    expect(actionBounds).toHaveLength(2)
    expect(actionBounds[0].top).toBe(actionBounds[1].top)
    expect(actionBounds.every(box => box.width >= 44 && box.height >= 44)).toBe(true)
    const preview = longFile.locator('pre')
    await preview.scrollIntoViewIfNeeded()
    await preview.evaluate(element => { element.scrollTop = element.scrollHeight })
    await mkdir(screenshots, { recursive: true })
    await page.screenshot({ path: resolve(screenshots, 'Upload_Long_Filename_Mobile.png') })
    expect(await page.locator('.main-content').evaluate(element => element.scrollWidth > element.clientWidth)).toBe(false)
    expect(errors).toEqual([])
  } finally { await cleanup(page) }
})

test('file-only handover receives live AI grading and submitted files survive draft removal, sharing and export', async ({ page }) => {
  test.setTimeout(240000)
  try {
    const { attempt } = await openReady(page)
    const bank = JSON.parse(await readFile(resolve(process.cwd(), 'curriculum/task-family-catalog.json'), 'utf8')) as { variants: GeneratedVariant[] }
    const fixture = bank.variants.find(item => item.id === attempt.variantId)!
    expect(fixture).toBeTruthy()
    await fillDecisions(page, fixture)
    const csv = `Field,Content\nHandover,"${fixture.rubric.exemplar.en.replace(/"/g, '""')}"\n`
    await upload(page, 'QA_Handover.csv', csv, 'text/csv')
    await expect(page.locator('#work-response')).toHaveValue('')
    await page.getByRole('button', { name: 'Submit for AI review', exact: true }).click()
    await expect(page.getByRole('dialog')).toContainText('attached-file contents')
    await page.getByRole('button', { name: 'I understand, continue', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Submission feedback', exact: true })).toBeVisible({ timeout: 120000 })
    const graded = await current(page)
    expect(graded.submissions.at(-1)?.evaluation.source).toBe('deepseek')
    expect(graded.submissions.at(-1)?.evaluation.passed).toBe(true)
    expect(graded.submissions.at(-1)?.attachments).toHaveLength(1)
    expect(graded.submissions.at(-1)?.work).toBe('')
    await page.getByRole('button', { name: 'Remove QA_Handover.csv', exact: true }).click()
    await expect(page.locator('.work-files .attachment-file')).toHaveCount(0)
    const changed = await current(page)
    expect(changed.attachments).toHaveLength(0)
    expect(changed.submissions.at(-1)?.attachments).toHaveLength(1)
    await page.getByRole('button', { name: 'My portfolio', exact: true }).click()
    const card = page.locator('.evidence-card').filter({ has: page.getByRole('heading', { name: fixture.task.title.en, exact: true }) })
    await card.locator('.submission-detail summary').first().click()
    await expect(card.getByRole('link', { name: 'Download QA_Handover.csv', exact: true })).toBeVisible()
    await card.getByRole('checkbox').check()
    await page.getByRole('button', { name: 'Create sharing link', exact: true }).click()
    await expect(page.locator('#share-url')).toHaveValue(/\/share\//)
    const token = (await page.locator('#share-url').inputValue()).split('/').pop()!
    const report = await (await page.request.get(`/api/share/${token}`)).json() as { attempts: Attempt[] }
    const sharedFile = report.attempts[0].submissions.at(-1)!.attachments![0]
    const outsider = await page.context().browser()!.newContext()
    const publicDownload = await outsider.request.get(origin + sharedFile.downloadUrl)
    expect(publicDownload.ok()).toBeTruthy()
    expect(await publicDownload.text()).toBe(csv)
    await outsider.close()
    const popup = page.waitForEvent('popup')
    await page.getByRole('link', { name: 'Preview', exact: true }).click()
    const shared = await popup
    await shared.locator('.submission-detail summary').first().click()
    await expect(shared.getByRole('link', { name: 'Download QA_Handover.csv', exact: true })).toBeVisible()
    await shared.getByRole('button', { name: '繁', exact: true }).click()
    await expect(shared.getByRole('link', { name: '下載 QA_Handover.csv', exact: true })).toBeVisible()
    await shared.close()
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export my data', exact: true }).click()
    const exported = await download
    expect(exported.suggestedFilename()).toBe('lumio-portfolio.json')
    const content = await readFile((await exported.path())!, 'utf8')
    expect(content).toContain('QA_Handover.csv')
    expect(content).toContain('extractedText')
    expect(content).not.toMatch(/"bytes"\s*:/)
    await page.getByRole('button', { name: 'Revoke', exact: true }).click()
    await expect(page.locator('.active-shares')).toHaveCount(0)
    const revokedOutsider = await page.context().browser()!.newContext()
    try { expect((await revokedOutsider.request.get(origin + sharedFile.downloadUrl)).status()).toBe(404) } finally { await revokedOutsider.close() }
    expect((await page.request.get(`/api/attachments/${sharedFile.id}`)).status()).toBe(200)
  } finally { await cleanup(page) }
})

test('upload limits and failed file-based AI feedback do not lose work or create a stale score', async ({ page }) => {
  test.setTimeout(150000)
  try {
    const { attempt } = await openReady(page)
    await page.locator('#work-file-upload').setInputFiles({ name: 'too-large.txt', mimeType: 'text/plain', buffer: Buffer.alloc(5 * 1024 * 1024 + 1, 65) })
    await expect(page.locator('.work-files .file-error')).toContainText('5 MB')
    expect((await current(page)).attachments).toHaveLength(0)
    await page.locator('#work-file-upload').setInputFiles({ name: 'unsupported.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('unsupported') })
    await expect(page.locator('.work-files .file-error')).toContainText('XLSX')
    await page.locator('#work-file-upload').setInputFiles([1, 2, 3, 4].map(number => ({ name: `excess-${number}.txt`, mimeType: 'text/plain', buffer: Buffer.from('A test note') })))
    await expect(page.locator('.work-files .file-error')).toContainText('three files')
    const note = 'This fictional work explains the evidence inspected, the decision made, the uncertainty remaining and the next verification step.'
    await upload(page, 'File_Only_Reasoning.txt', note)
    if(await page.locator('.optional-decisions').getAttribute('open')===null)await page.locator('.optional-decisions summary').click()
    for (const q of attempt.task!.questions) {
      if (q.type === 'number') await page.locator(`#q-${q.id}`).fill('0')
      else if (q.type === 'select') await page.locator(`#q-${q.id}`).selectOption(q.options![0].value)
      else await page.locator(`#q-${q.id} input`).first().check()
    }
    await page.route('**/api/attempts/*/check', route => route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: 'AI review is temporarily unavailable. Your draft is saved. Please retry.', code: 'ai_provider_error' }) }))
    await page.getByRole('button', { name: 'Get AI feedback', exact: true }).click()
    await expect(page.getByRole('dialog')).toContainText('attached-file contents')
    await page.getByRole('button', { name: 'I understand, continue', exact: true }).click()
    await expect(page.locator('.error-banner')).toContainText('temporarily unavailable')
    await expect(page.locator('.score-banner')).toHaveCount(0)
    expect((await current(page)).attachments?.[0].extractedText).toBe(note)
    await page.reload()
    await page.getByRole('button', { name: 'Continue your assignment', exact: true }).click()
    await expect(page.locator('.work-files .attachment-file')).toHaveCount(1)
    await expect(page.locator('#work-response')).toHaveValue('')
  } finally { await cleanup(page) }
})

test('a second-tab file change rejects stale feedback and submission without losing either file', async ({ page }) => {
  test.setTimeout(90000)
  let second: Page | undefined
  try {
    const { attempt } = await openReady(page)
    const note = 'This controlled fictional handover identifies source evidence, a justified decision, remaining uncertainty and the next verification step.'
    await upload(page, 'First_Tab_Work.txt', note)
    if(await page.locator('.optional-decisions').getAttribute('open')===null)await page.locator('.optional-decisions summary').click()
    for (const question of attempt.task!.questions) {
      if (question.type === 'number') await page.locator(`#q-${question.id}`).fill('0')
      else if (question.type === 'select') await page.locator(`#q-${question.id}`).selectOption(question.options![0].value)
      else await page.locator(`#q-${question.id} input`).first().check()
    }
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.locator('.notice-banner')).toContainText('Your draft is saved.')
    const before = await current(page)
    second = await page.context().newPage()
    await second.goto('/')
    await second.getByRole('button', { name: 'Continue your assignment', exact: true }).click()
    await upload(second, 'Second_Tab_Work.txt', note + ' The second tab adds an independent record.')
    const changed = await current(second)
    expect(changed.revision).toBeGreaterThan(before.revision)
    expect(changed.attachments).toHaveLength(2)
    await page.getByRole('button', { name: 'Get AI feedback', exact: true }).click()
    await page.getByRole('button', { name: 'I understand, continue', exact: true }).click()
    await expect(page.locator('.error-banner')).toContainText(/updated|changed|another tab|reload/i)
    await expect(page.locator('.score-banner')).toHaveCount(0)
    await page.getByRole('button', { name: 'Submit for AI review', exact: true }).click()
    await expect(page.locator('.error-banner')).toContainText(/updated|changed|another tab|reload/i)
    const preserved = await current(second)
    expect(preserved.submissions).toHaveLength(0)
    expect(preserved.attachments).toHaveLength(2)
    expect(preserved.answers).toEqual(before.answers)
    await page.reload()
    await page.getByRole('button', { name: 'Continue your assignment', exact: true }).click()
    await expect(page.locator('.work-files .attachment-file')).toHaveCount(2)
    await expect(page.locator('.score-banner')).toHaveCount(0)
  } finally { await second?.close(); await cleanup(page) }
})

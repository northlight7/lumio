import { test, expect, type Page } from '@playwright/test'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import type { GeneratedVariant } from '../../src/lib/ai-curriculum'
import { roles } from '../../src/lib/content'
import { getTaskFamilies } from '../../src/lib/task-families'
import type { Profile, Variation } from '../../src/lib/types'

const origin = process.env.TEST_ORIGIN || 'http://localhost:3100'
const auditRoot = resolve(process.cwd(), '../.internal/prototype/expansion/mobile-audit')
const directory = resolve(auditRoot, String(Date.now()))
const mobileScope = process.env.MOBILE_SCOPE || 'all'
const allowPartialRuntime = mobileScope === 'runtime' && process.env.MOBILE_ALLOW_PARTIAL === '1'
const allowPartialSeed = mobileScope === 'seed' && process.env.MOBILE_ALLOW_PARTIAL === '1'
type ReviewRecord = { variantId: string; sourceHash: string; status: string; manualEnglishReview: boolean; fullTraditionalChineseConditionReview: boolean }
const fingerprint = (value: unknown): string => {
  const ordered = (item: unknown): unknown => Array.isArray(item) ? item.map(ordered) : item && typeof item === 'object' ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, ordered(child)])) : item
  return createHash('sha256').update(JSON.stringify(ordered(value))).digest('hex')
}
test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', actionTimeout: 20000 })

async function noPageOverflow(page: Page, context: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), context).toBe(false)
  expect(await page.locator('.main-content').evaluate(element => element.scrollWidth > element.clientWidth), context).toBe(false)
}

test('every role overview and published task family has usable bilingual mobile sources and work controls', async ({ page }) => {
  test.setTimeout(1800000)
  await mkdir(directory, { recursive: true })
  const errors: string[] = []
  const reviewed: { roleId: string; taskId: string; variantId: string; documents: number; locales: string[]; sourceHash: string; publicTaskHash: string; sourceScreens: { en: string; zh: string } }[] = []
  const missing: string[] = []
  let overviewCount = 0
  let manifestCount = 0
  page.on('pageerror', error => errors.push(error.message))
  let startWindow = Math.floor(Date.now() / 60000)
  let starts = 0
  page.on('request', request => {
    if (request.method() !== 'POST' || !request.url().endsWith('/api/attempts')) return
    const current = Math.floor(Date.now() / 60000)
    if (current !== startWindow) { startWindow = current; starts = 0 }
    starts += 1
  })
  const paceExistingStart = async () => {
    const current = Math.floor(Date.now() / 60000)
    if (current !== startWindow) { startWindow = current; starts = 0 }
    if (starts >= 29) await new Promise(resolve => setTimeout(resolve, Math.min(60000, 60000 - Date.now() % 60000 + 200)))
  }
  try {
    const seed = JSON.parse(await readFile(resolve(process.cwd(), 'curriculum/task-family-catalog.json'), 'utf8')) as { variants: GeneratedVariant[] }
    const review = JSON.parse(await readFile(resolve(process.cwd(), '../.internal/prototype/expansion/content-review.json'), 'utf8')) as { records: ReviewRecord[]; runtimeRecords: ReviewRecord[] }
    const approved = new Map([...review.records, ...review.runtimeRecords].map(item => [item.variantId, item]))
    const runtime = mobileScope === 'seed' ? { variants: [] } : JSON.parse(await readFile(resolve(process.cwd(), '../.internal/prototype/expansion/runtime-generation-cases.json'), 'utf8')) as { variants: GeneratedVariant[] }
    const runtimeManifest = allowPartialRuntime ? runtime.variants.filter(item => approved.get(item.id)?.status === 'passed') : runtime.variants
    const manifest = mobileScope === 'runtime' ? runtimeManifest : [...seed.variants, ...runtimeManifest]
    manifestCount = manifest.length
    const targets = new Map(manifest.map(item => [item.id, item]))
    for (const variant of manifest) {
      const record = approved.get(variant.id)
      expect(['passed', 'passed-with-clarification-note'], `${variant.id} source approval`).toContain(record?.status)
      expect(record?.manualEnglishReview && record.fullTraditionalChineseConditionReview, `${variant.id} bilingual source review`).toBe(true)
    }
    if (process.env.REQUIRE_COMPLETE_CATALOG === '1' && !allowPartialRuntime && !allowPartialSeed) expect(manifest).toHaveLength(mobileScope === 'runtime' ? 22 : Number(process.env.EXPECTED_MOBILE_SCENARIOS || 148) - 12)
    if (['seed', 'runtime'].includes(mobileScope) && process.env.MOBILE_RESUME === '1') {
      let retained: { reviewed: typeof reviewed; errors: string[] } | undefined
      try { retained = JSON.parse(await readFile(resolve(auditRoot, mobileScope === 'runtime' ? 'runtime-report.json' : 'seed-report.json'), 'utf8')) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
      if (retained) {
        expect(retained.errors).toEqual([])
        for (const record of retained.reviewed.filter(item => targets.has(item.variantId))) {
          expect(['passed', 'passed-with-clarification-note']).toContain(approved.get(record.variantId)?.status)
          expect(approved.get(record.variantId)?.sourceHash).toBe(record.sourceHash)
          expect(fingerprint(targets.get(record.variantId)!.task)).toBe(record.publicTaskHash)
          expect(record.locales).toEqual(['en', 'zh'])
          await Promise.all([access(record.sourceScreens.en), access(record.sourceScreens.zh)])
          reviewed.push(record)
        }
      }
    }
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Guest account', exact: true })).toBeEnabled()
    for (const role of roles) {
      const families = getTaskFamilies(role.id).filter(family => mobileScope !== 'runtime' || manifest.some(item => item.taskId === family.id))
      if (mobileScope !== 'runtime') {
      await page.getByRole('button', { name: `Explore ${role.title.en} at ${role.company.en}`, exact: true }).click()
      const dialog = page.getByRole('dialog')
      await expect(dialog.locator('.task-family-card')).toHaveCount(families.length)
      expect(await dialog.evaluate(element => element.scrollWidth > element.clientWidth), `${role.id} overview`).toBe(false)
      for (const family of families) {
        const button = dialog.locator(`[data-task-id="${family.id}"]`)
        await expect(button).toHaveAccessibleName(family.title.en)
        const box = await button.boundingBox()
        expect(box!.width).toBeGreaterThan(44)
        expect(box!.height).toBeGreaterThan(44)
      }
      await dialog.screenshot({ path: resolve(directory, `${role.id}-overview-en.png`) })
      await page.getByRole('button', { name: 'Close / 關閉', exact: true }).click()
      await page.getByRole('button', { name: '繁', exact: true }).click()
      await page.getByRole('button', { name: `探索 ${role.company.zh} 的${role.title.zh}`, exact: true }).click()
      for (const family of families) await expect(dialog.locator(`[data-task-id="${family.id}"]`)).toHaveAccessibleName(family.title.zh)
      expect(await dialog.evaluate(element => element.scrollWidth > element.clientWidth), `${role.id} Chinese overview`).toBe(false)
      await dialog.screenshot({ path: resolve(directory, `${role.id}-overview-zh.png`) })
      await page.getByRole('button', { name: 'Close / 關閉', exact: true }).click()
      await page.getByRole('button', { name: 'EN', exact: true }).click()
      overviewCount += 1
      }
      for (const family of families) {
        const body = await (await page.request.get(`/api/variations?roleId=${role.id}&stage=taster&taskId=${family.id}`)).json() as { variations: Variation[] }
        const expected = manifest.filter(item => item.taskId === family.id)
        expect(body.variations.map(item => item.id), `${family.id} published manifest`).toEqual(expect.arrayContaining(expected.map(item => item.id)))
        const scopedVariations = body.variations.filter(item => targets.has(item.id))
        if (scopedVariations.length < (mobileScope === 'runtime' ? 1 : 2)) missing.push(`${role.id}/${family.id}`)
        const pendingVariations = scopedVariations.filter(item => !reviewed.some(record => record.variantId === item.id))
        if (!pendingVariations.length) continue
        await page.getByRole('button', { name: `Explore ${role.title.en} at ${role.company.en}`, exact: true }).click()
        await paceExistingStart()
        await page.getByRole('dialog').locator(`[data-task-id="${family.id}"]`).click()
        const taskSelect = page.getByRole('combobox', { name: 'Task type', exact: true })
        await expect(taskSelect).toHaveValue(family.id)
        for (const variation of pendingVariations) {
          await page.getByRole('button', { name: 'Browse variations', exact: true }).click()
          const scenarioButton = page.locator(`[data-variant-id="${variation.id}"]`)
          if (await scenarioButton.isDisabled()) await page.getByRole('button', { name: 'Browse variations', exact: true }).click()
          else { await paceExistingStart(); await scenarioButton.click() }
          await expect(page.locator('.brief-body h3')).toHaveText(variation.title.en)
          const profile = await (await page.request.get('/api/me')).json() as Profile
          const attempt = profile.attempts.find(item => item.variantId === variation.id)!
          expect(attempt.task?.generation).toBeTruthy()
          expect(attempt.task).toEqual(targets.get(variation.id)!.task)
          await noPageOverflow(page, `${role.id}/${family.id} brief`)
          for (const locale of ['en', 'zh'] as const) {
            if (locale === 'zh') await page.getByRole('button', { name: '繁', exact: true }).click()
            await page.locator('.document-tabs button').last().click()
            const selector = page.getByRole('combobox', { name: locale === 'en' ? 'Choose source document' : '選擇參考文件', exact: true })
            for (const document of attempt.task!.documents) {
              await selector.selectOption(document.id)
              await expect(page.locator('.document-body article h3')).toHaveText(document.title[locale])
              await noPageOverflow(page, `${role.id}/${family.id}/${document.id}/${locale}`)
              const sourceContainers = await page.locator('.source-code,.table-scroll').evaluateAll(elements => elements.map(element => {
                const box = element.getBoundingClientRect()
                return { right: box.right, left: box.left, width: box.width, overflow: getComputedStyle(element).overflowX, whiteSpace: getComputedStyle(element).whiteSpace, code: element.classList.contains('source-code') }
              }))
              for (const container of sourceContainers) {
                expect(container.right).toBeLessThanOrEqual(390)
                expect(container.left).toBeGreaterThanOrEqual(0)
                expect(container.width).toBeGreaterThan(100)
                expect(['auto', 'scroll']).toContain(container.overflow)
                if (container.code) expect(container.whiteSpace).toBe('pre')
              }
            }
            await page.locator('.document-body article').scrollIntoViewIfNeeded()
            await page.screenshot({ path: resolve(directory, `${role.id}-${family.id}-${variation.id}-sources-${locale}.png`) })
            await page.locator('.work-actions').scrollIntoViewIfNeeded()
            const controls = await page.locator('.work-actions button').evaluateAll(elements => elements.map(element => { const box = element.getBoundingClientRect(); return { width: box.width, height: box.height, right: box.right, left: box.left } }))
            expect(controls.every(box => box.width >= 44 && box.height >= 44 && box.right <= 390 && box.left >= 0), `${role.id}/${family.id} work controls`).toBe(true)
            await expect(page.locator('#work-file-upload')).toBeEnabled()
            await noPageOverflow(page, `${role.id}/${family.id} work/${locale}`)
          }
          await page.getByRole('button', { name: 'EN', exact: true }).click()
          reviewed.push({ roleId: role.id, taskId: family.id, variantId: attempt.variantId!, documents: attempt.task!.documents.length, locales: ['en', 'zh'], sourceHash: approved.get(variation.id)!.sourceHash, publicTaskHash: fingerprint(attempt.task), sourceScreens: { en: resolve(directory, `${role.id}-${family.id}-${variation.id}-sources-en.png`), zh: resolve(directory, `${role.id}-${family.id}-${variation.id}-sources-zh.png`) } })
        }
        await page.getByRole('button', { name: 'All careers', exact: true }).click()
      }
      console.log(`Mobile ${mobileScope}: ${role.id}, ${reviewed.length} scenarios reviewed` )
    }
    expect(errors).toEqual([])
    if (process.env.REQUIRE_COMPLETE_CATALOG === '1') {
      if (!allowPartialSeed) expect(missing, 'Publish two scenarios for every task family before the complete mobile audit').toEqual([])
      expect(reviewed).toHaveLength(mobileScope === 'runtime' ? allowPartialRuntime ? manifestCount : 22 : allowPartialSeed ? manifestCount : Number(process.env.EXPECTED_MOBILE_SCENARIOS || 148) - 12)
      expect(overviewCount).toBe(mobileScope === 'runtime' ? 0 : 22)
    }
  } finally {
    try {
    const report = JSON.stringify({ generatedAt: new Date().toISOString(), scope: mobileScope, partial: allowPartialRuntime || allowPartialSeed, manifestCount, screenshotDirectory: directory, overviewCount, reviewed, missing, errors }, null, 2)
    await writeFile(resolve(directory, 'report.json'), report)
    if (mobileScope !== 'runtime') await writeFile(resolve(auditRoot, 'report.json'), report)
    else {
      await writeFile(resolve(auditRoot, 'runtime-report.json'), report)
      const base = JSON.parse(await readFile(resolve(auditRoot, 'seed-report.json'), 'utf8')) as { reviewed: { variantId: string; sourceHash: string }[]; advancedReviewed: { variantId: string; sourceHash: string }[] }
      const current = JSON.parse(await readFile(resolve(process.cwd(), '../.internal/prototype/expansion/content-review.json'), 'utf8')) as { records: ReviewRecord[]; advancedRecords: ReviewRecord[] }
      const hashes = new Map([...current.records, ...current.advancedRecords].map(item => [item.variantId, item]))
      const eligible = (item: { variantId: string }) => ['passed', 'passed-with-clarification-note'].includes(hashes.get(item.variantId)?.status || '')
      const eligibleSeed = base.reviewed.filter(eligible)
      const eligibleAdvanced = base.advancedReviewed.filter(eligible)
      const excludedBaseEvidence = [...base.reviewed, ...base.advancedReviewed].filter(item => !eligible(item))
      for (const retained of [...eligibleSeed, ...eligibleAdvanced]) {
        expect(hashes.get(retained.variantId)?.sourceHash, `${retained.variantId} retained snapshot`).toBe(retained.sourceHash)
        expect(['passed', 'passed-with-clarification-note']).toContain(hashes.get(retained.variantId)?.status)
      }
      const unique = new Set([...eligibleSeed, ...eligibleAdvanced, ...reviewed].map(item => item.variantId))
      expect(unique.size).toBe(allowPartialRuntime ? eligibleSeed.length + eligibleAdvanced.length + reviewed.length : Number(process.env.EXPECTED_MOBILE_SCENARIOS || 148))
      if (!allowPartialRuntime) { expect(excludedBaseEvidence).toEqual([]); expect(eligibleSeed).toHaveLength(114); expect(eligibleAdvanced).toHaveLength(12) }
      expect(errors).toEqual([])
      await writeFile(resolve(auditRoot, 'report.json'), JSON.stringify({ ...base, reviewed: eligibleSeed, advancedReviewed: eligibleAdvanced, excludedBaseEvidence, runtimeReviewed: reviewed, runtimeErrors: errors, runtimeScreenshotDirectory: directory, totalScenarios: unique.size, mergedAt: new Date().toISOString() }, null, 2))
    }
    } finally { await page.request.delete('/api/me', { data: {}, headers: { Origin: origin } }) }
  }
})

test('all twelve advanced scenarios have bilingual mobile sources and reachable independent assessment controls', async ({ page }) => {
  test.skip(mobileScope === 'runtime', 'The retained seed report already covers all12 advanced scenarios')
  test.setTimeout(300000)
  if (mobileScope === 'seed') {
    let retained: { status: string; reviewed: { variantId: string; sourceHash: string; publicTaskHash: string; locales: string[]; sourceScreens: { en: string; zh: string } }[]; errors: string[]; screenshotDirectory: string } | undefined
    try { retained = JSON.parse(await readFile(resolve(auditRoot, 'advanced-approved-report.json'), 'utf8')) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
    if (retained) {
      expect(retained.status).toBe('passed')
      expect(retained.reviewed).toHaveLength(12)
      expect(retained.errors).toEqual([])
      const current = JSON.parse(await readFile(resolve(process.cwd(), '../.internal/prototype/expansion/content-review.json'), 'utf8')) as { advancedRecords: ReviewRecord[] }
      const bank = JSON.parse(await readFile(resolve(process.cwd(), 'curriculum/company-catalog.json'), 'utf8')) as { variants: GeneratedVariant[] }
      for (const record of retained.reviewed) {
        const approved = current.advancedRecords.find(item => item.variantId === record.variantId)!
        expect(approved.status).toBe('passed')
        expect(approved.sourceHash).toBe(record.sourceHash)
        expect(fingerprint(bank.variants.find(item => item.id === record.variantId)!.task)).toBe(record.publicTaskHash)
        expect(record.locales).toEqual(['en', 'zh'])
        await Promise.all([access(record.sourceScreens.en), access(record.sourceScreens.zh)])
      }
      const familyReport = JSON.parse(await readFile(resolve(auditRoot, 'report.json'), 'utf8')) as { reviewed: { variantId: string }[] }
      const totalScenarios = new Set([...familyReport.reviewed, ...retained.reviewed].map(item => item.variantId)).size
      expect(totalScenarios).toBe(Number(process.env.EXPECTED_MOBILE_SCENARIOS || 126))
      const completed = JSON.stringify({ ...familyReport, advancedReviewed: retained.reviewed, advancedErrors: [], advancedScreenshotDirectory: retained.screenshotDirectory, totalScenarios, reusedAdvancedProof: true }, null, 2)
      await writeFile(resolve(auditRoot, 'report.json'), completed)
      await writeFile(resolve(auditRoot, 'seed-report.json'), completed)
      console.log('Retained12 actual bilingual advanced audits after exact hash/fingerprint/screenshot validation')
      return
    }
  }
  await mkdir(directory, { recursive: true })
  const errors: string[] = []
  const reviewed: { roleId: string; stage: string; variantId: string; documents: number; locales: string[]; sourceHash: string; publicTaskHash: string; sourceScreens: { en: string; zh: string } }[] = []
  page.on('pageerror', error => errors.push(error.message))
  try {
    const review = JSON.parse(await readFile(resolve(process.cwd(), '../.internal/prototype/expansion/content-review.json'), 'utf8')) as { advancedRecords: ReviewRecord[] }
    const approved = new Map(review.advancedRecords.map(item => [item.variantId, item]))
    await page.goto('/')
    await page.getByRole('button', { name: 'Open presentation demo', exact: true }).click()
    await expect(page.locator('.demo-banner')).toContainText('Presentation demo')
    const initial = await (await page.request.get('/api/me')).json() as Profile
    expect(initial.demo).toBe(true)
    expect(initial.attempts.some(attempt => attempt.stage === 'assessment')).toBe(false)
    const advancedBank = JSON.parse(await readFile(resolve(process.cwd(), 'curriculum/company-catalog.json'), 'utf8')) as { variants: GeneratedVariant[] }
    for (const stage of ['diagnose', 'fix', 'adapt', 'assessment'] as const) {
      const catalog = await (await page.request.get(`/api/variations?roleId=ai-engineer&stage=${stage}`)).json() as { variations: Variation[] }
      expect(catalog.variations).toHaveLength(3)
      const stageButton = page.locator('.pathway-steps button').filter({ hasText: { diagnose: '01 · Diagnose', fix: '02 · Improve', adapt: '03 · Adapt', assessment: '04 · Assessment' }[stage] })
      await expect(stageButton).toBeEnabled()
      await stageButton.click()
      for (const variation of catalog.variations) {
        const snapshot = advancedBank.variants.find(item => item.id === variation.id)!.task
        const browseLabel = !snapshot.taskId && snapshot.stage !== 'taster' ? 'Browse assignments' : 'Browse variations'
        await page.getByRole('button', { name: browseLabel, exact: true }).click()
        const scenarioButton = page.locator(`[data-variant-id="${variation.id}"]`)
        if (await scenarioButton.isDisabled()) await page.getByRole('button', { name: browseLabel, exact: true }).click()
        else await scenarioButton.click()
        await expect(page.locator('.brief-body h3')).toHaveText(variation.title.en)
        const profile = await (await page.request.get('/api/me')).json() as Profile
        const attempt = profile.attempts.find(item => item.variantId === variation.id)!
        expect(attempt.task?.generation).toBeTruthy()
        if (stage === 'assessment') {
          expect(attempt.answers).toEqual({})
          expect(attempt.submissions).toHaveLength(0)
          await expect(page.locator('.assessment-note')).toContainText('Coaching, colleague chat and practice checks are off')
          await expect(page.getByRole('button', { name: 'Get AI feedback', exact: true })).toHaveCount(0)
        }
        await noPageOverflow(page, `${stage}/${variation.id} brief`)
        for (const locale of ['en', 'zh'] as const) {
          if (locale === 'zh') await page.getByRole('button', { name: '繁', exact: true }).click()
          await page.locator('.document-tabs button').last().click()
          const selector = page.getByRole('combobox', { name: locale === 'en' ? 'Choose source document' : '選擇參考文件', exact: true })
          for (const document of attempt.task!.documents) {
            await selector.selectOption(document.id)
            await expect(page.locator('.document-body article h3')).toHaveText(document.title[locale])
            await noPageOverflow(page, `${stage}/${variation.id}/${document.id}/${locale}`)
            for (const container of await page.locator('.source-code,.table-scroll').evaluateAll(elements => elements.map(element => {
              const box = element.getBoundingClientRect()
              return { left: box.left, right: box.right, width: box.width, overflow: getComputedStyle(element).overflowX }
            }))) {
              expect(container.left).toBeGreaterThanOrEqual(0)
              expect(container.right).toBeLessThanOrEqual(390)
              expect(container.width).toBeGreaterThan(100)
              expect(['auto', 'scroll']).toContain(container.overflow)
            }
          }
          await page.locator('.document-body article').scrollIntoViewIfNeeded()
          await page.screenshot({ path: resolve(directory, `advanced-${stage}-${variation.id}-${locale}.png`) })
          await page.locator('.work-actions').scrollIntoViewIfNeeded()
          const buttons = await page.locator('.work-actions button').evaluateAll(elements => elements.map(element => {
            const box = element.getBoundingClientRect()
            return { width: box.width, height: box.height, left: box.left, right: box.right }
          }))
          expect(buttons.every(box => box.width >= 44 && box.height >= 44 && box.left >= 0 && box.right <= 390), `${stage}/${variation.id} ${locale} controls`).toBe(true)
          await expect(page.locator('#work-file-upload')).toBeEnabled()
          await noPageOverflow(page, `${stage}/${variation.id} ${locale} workbench`)
        }
        await page.getByRole('button', { name: 'EN', exact: true }).click()
        expect(approved.get(variation.id)?.status).toBe('passed')
        reviewed.push({ roleId: 'ai-engineer', stage, variantId: variation.id, documents: attempt.task!.documents.length, locales: ['en', 'zh'], sourceHash: approved.get(variation.id)!.sourceHash, publicTaskHash: fingerprint(attempt.task), sourceScreens: { en: resolve(directory, `advanced-${stage}-${variation.id}-en.png`), zh: resolve(directory, `advanced-${stage}-${variation.id}-zh.png`) } })
      }
    }
    expect(reviewed).toHaveLength(12)
    expect(errors).toEqual([])
    if (process.env.REQUIRE_COMPLETE_CATALOG === '1') {
      const familyReport = JSON.parse(await readFile(resolve(auditRoot, 'report.json'), 'utf8')) as { reviewed: { variantId: string }[] }
      expect(new Set([...familyReport.reviewed, ...reviewed].map(item => item.variantId)).size).toBe(Number(process.env.EXPECTED_MOBILE_SCENARIOS || 126))
      const completed = JSON.stringify({ ...familyReport, advancedReviewed: reviewed, totalScenarios: familyReport.reviewed.length + reviewed.length, advancedErrors: errors }, null, 2)
      await writeFile(resolve(auditRoot, 'report.json'), completed)
      if (mobileScope === 'seed') await writeFile(resolve(auditRoot, 'seed-report.json'), completed)
    }
  } finally {
    await writeFile(resolve(directory, 'advanced-report.json'), JSON.stringify({ generatedAt: new Date().toISOString(), reviewed, errors }, null, 2))
    await page.request.delete('/api/me', { data: {}, headers: { Origin: origin } })
  }
})

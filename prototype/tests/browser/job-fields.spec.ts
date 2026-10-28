import { test, expect } from '@playwright/test'
import { roles } from '../../src/lib/content'

const fields = [
  ['IT & software', 'it-software', ['ai-engineer', 'software-developer', 'full-stack-developer', 'frontend-developer', 'qa-engineer', 'security-analyst']],
  ['Engineering', 'engineering', ['pcb-designer', 'mechanical-design-engineer']],
  ['Finance & accounting', 'finance-accounting', ['financial-analyst']],
  ['Data & analytics', 'data-analytics', ['ai-engineer', 'data-analyst', 'sustainability-analyst', 'business-analyst', 'digital-marketing-analyst', 'financial-analyst', 'research-analyst']],
  ['Marketing', 'marketing', ['digital-marketing-analyst']],
  ['Design & UX', 'design', ['ux-designer', 'frontend-developer']],
  ['Science & research', 'science-research', ['laboratory-analyst', 'environmental-scientist', 'research-analyst']],
  ['Sustainability & environment', 'environment', ['sustainability-analyst', 'environmental-scientist']],
  ['Operations & logistics', 'operations-logistics', ['supply-chain-planner', 'operations-planner']],
  ['Product & project management', 'product-projects', ['business-analyst', 'product-manager', 'project-coordinator']],
  ['Customer service', 'customer-service', ['customer-operations']],
] as const

test('all occupational fields return the correct unique roles on desktop and bilingual mobile', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Discover careers', exact: true })).toBeEnabled()
  const cards = page.locator('.career-card h3')
  await expect(cards).toHaveCount(22)
  const seen = new Set<string>()
  for (const [, id, ids] of fields) {
    await page.getByRole('combobox', { name: 'Filter by job field', exact: true }).selectOption(id)
    await expect(cards).toHaveText(roles.filter(role => ids.some(id => id === role.id)).map(role => role.title.en))
    ids.forEach(id => seen.add(id))
  }
  expect(seen.size).toBe(22)
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click()
  await page.getByRole('textbox', { name: 'Search roles or companies', exact: true }).fill('accounting')
  await expect(cards).toHaveText('Financial analyst')
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click()
  await page.getByRole('combobox', { name: 'Filter by job field', exact: true }).selectOption('engineering')
  await page.getByRole('button', { name: /^Filters/ }).click()
  await page.getByRole('combobox', { name: 'Filter by company', exact: true }).selectOption('oursky')
  await expect(page.getByRole('heading', { name: 'No positions match these filters', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Reset filters', exact: true }).last().click()
  await expect(cards).toHaveCount(22)
  await page.getByRole('button', { name: /^Filters/ }).click()
  await page.getByRole('group', { name: 'Explore by', exact: true }).getByRole('button', { name: 'Explore companies', exact: true }).click()
  await expect(page.locator('.company-tile')).toHaveCount(12)
  await page.getByRole('group', { name: 'Explore by', exact: true }).getByRole('button', { name: 'Explore roles', exact: true }).click()
  await expect(cards).toHaveCount(22)
  await page.setViewportSize({ width: 390, height: 844 })
  for (const locale of ['en', 'zh'] as const) {
    if (locale === 'zh') await page.getByRole('button', { name: '繁', exact: true }).click()
    const picker = page.getByRole('combobox', { name: locale === 'en' ? 'Filter by job field' : '按職業領域篩選', exact: true })
    await expect(picker).toBeVisible()
    await expect(picker.locator('option')).toHaveCount(12)
    await expect(picker.locator('option[value="education"]')).toHaveCount(0)
    for (const [, id, ids] of fields) {
      await picker.selectOption(id)
      await expect(cards).toHaveText(roles.filter(role => ids.some(value => value === role.id)).map(role => role.title[locale]))
      expect(await page.locator('main').evaluate(e => e.scrollWidth > e.clientWidth)).toBe(false)
    }
    await picker.selectOption('all')
    await expect(cards).toHaveCount(22)
  }
})

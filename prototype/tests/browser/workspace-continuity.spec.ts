import { test, expect } from '@playwright/test'

const origin = process.env.TEST_ORIGIN || 'http://localhost:3100'
const apiOrigin = process.env.LUMIO_TEST_API_ORIGIN || origin

test.beforeEach(async ({ page, context }) => {
  test.setTimeout(60000)
  // A local UI can exercise the actual public deployment through its normal API.
  // Responses, clocks, sessions and task data are passed through without replacement.
  if (apiOrigin !== origin) await page.route(`${origin}/api/**`, async route => {
    const request = route.request()
    const response = await context.request.fetch(apiOrigin + new URL(request.url()).pathname + new URL(request.url()).search, {
      method: request.method(),
      headers: { Origin: apiOrigin, ...(request.headers()['content-type'] ? { 'Content-Type': request.headers()['content-type'] } : {}) },
      data: request.postDataBuffer() || undefined,
    })
    await route.fulfill({ status: response.status(), headers: { 'Content-Type': response.headers()['content-type'] || 'application/json' }, body: await response.body() })
  })
})

test.afterEach(async ({ context, page }) => {
  await page.unrouteAll({ behavior: 'wait' })
  await context.request.delete(`${apiOrigin}/api/me`, { data: {}, headers: { Origin: apiOrigin } })
})

async function openTask(page: import('@playwright/test').Page) {
  await page.goto(origin)
  await page.getByRole('button', { name: 'Explore Data analyst at foodpanda', exact: true }).click()
  await page.getByRole('button', { name: 'Choose a service improvement', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Download workpack ZIP', exact: true })).toBeVisible({timeout:30000})
  await expect(page.locator('.deadline-value')).toHaveText(/\d{2}:\d{2}/)
}

test('desktop keeps the team, task timer and column widths through every workspace step', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  await openTask(page)
  await expect(page.locator('#workspace-team')).toBeVisible()
  const width = (await page.locator('.material-panel').boundingBox())!.width
  const initial = await page.locator('.deadline-value').textContent()
  await page.getByRole('button', { name: 'Manager', exact: true }).click()
  await page.getByRole('textbox', { name: 'Message your colleague', exact: true }).fill('Keep this draft while I read the materials.')
  for (const name of ['Read & download', 'Work in your tools', 'Upload & review', 'Ask your team', 'Read & download']) {
    await page.locator('.workspace-process').getByRole('button', { name: new RegExp(name) }).click()
    await expect.poll(async () => {
      const timer = await page.locator('.deadline-card').boundingBox()
      const main = await page.locator('.main-content').boundingBox()
      return !!timer && !!main && timer.y >= main.y - 1 && timer.y + timer.height <= main.y + main.height
    }).toBe(true)
    await expect(page.locator('#workspace-team')).toBeVisible()
    expect((await page.locator('.material-panel').boundingBox())!.width).toBeCloseTo(width, 0)
    await expect(page.getByRole('textbox', { name: 'Message your colleague', exact: true })).toHaveValue('Keep this draft while I read the materials.')
    await expect.poll(async () => {
      const input = await page.locator('.chat-form').boundingBox()
      return !!input && input.y > 80 && input.y + input.height <= 900
    }).toBe(true).catch(async error => {
      console.log('FAILED STEP', name, await page.evaluate(() => {const main=document.querySelector('.main-content')!,team=document.querySelector('#workspace-team')!,nav=document.querySelector('.workspace-navigation')!,form=document.querySelector('.chat-form')!;return {scroll:main.scrollTop,padding:getComputedStyle(main).scrollPaddingTop,toolbar:main.getAttribute('style'),team:team.getBoundingClientRect().toJSON(),nav:nav.getBoundingClientRect().toJSON(),form:form.getBoundingClientRect().toJSON(),active:document.activeElement?.outerHTML.slice(0,200)}}))
      await page.screenshot({path:'../.internal/prototype/workspace-continuity/desktop-failure.png'})
      throw error
    })
  }
  await expect.poll(() => page.locator('.deadline-value').textContent()).not.toBe(initial)
  await page.getByRole('button', { name: '繁', exact: true }).click()
  await expect(page.getByRole('region', { name: '任務期限', exact: true })).toBeVisible()
  await expect(page.getByRole('textbox', { name: '傳送訊息給同事', exact: true })).toHaveValue('Keep this draft while I read the materials.')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

for (const width of [1280, 390]) test(`workspace timer and team navigation remain available at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 })
  await openTask(page)
  await page.locator('.workspace-process').getByRole('button', { name: 'Ask your team', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Message your colleague', exact: true })).toBeInViewport()
  await expect(page.locator('.deadline-card')).toBeInViewport({ ratio: 1 })
  await page.locator('.workspace-process').getByRole('button', { name: /Upload & review/ }).click()
  await expect(page.getByRole('link', { name: 'Download workpack ZIP', exact: true })).toBeAttached()
  await expect(page.locator('.deadline-card')).toBeInViewport({ ratio: 1 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

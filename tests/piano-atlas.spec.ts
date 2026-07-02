import { expect, test } from '@playwright/test'

test('loads the public piano directory and filters results', async ({
  page,
  isMobile,
}) => {
  await page.goto('/?variant=grid')

  await expect(page.getByRole('heading', { name: 'Public Pianos', exact: true })).toBeVisible()
  await expect(page.getByLabel('Search public pianos')).toBeVisible()
  if (!isMobile) {
    await expect(page.getByRole('region', { name: 'Public piano map' })).toBeVisible()
  }

  await page.getByLabel('Search public pianos').fill('Seoul')
  await expect(page).toHaveURL(/q=Seoul/)
  await expect(page.locator('.piano-card')).toHaveCount(3)
  await expect(page.locator('.piano-card').first()).toContainText('Seoul')
})

test('supports dark mode and the add piano flag action', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Toggle dark mode').click()

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.getByLabel('Add a piano').click()
  await expect(page.getByRole('dialog', { name: 'New public piano' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save report' })).toBeVisible()
})

test('sorts nearest pianos after geolocation permission', async ({ page, context }) => {
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: 37.5665, longitude: 126.978 })
  await page.goto('/?variant=grid')

  await page.getByRole('button', { name: /closest|near|rank|start|use my location/i }).first().click()
  await expect(page.getByText('Nearest to you')).toBeVisible()
  await expect(page.locator('.nearest-list li').first()).toContainText(/km|m/)
  await expect(page.locator('.piano-card').first()).toContainText('Seoul')
})

test('uses bundled fallback data when the API fails', async ({ page }) => {
  await page.route('**/api/pianos', (route) => route.abort())
  await page.goto('/?variant=grid')

  await expect(page.getByText(/Failed|unavailable|Fallback data|API returned/i).first()).toBeVisible()
  await expect(page.locator('.piano-card').first()).toBeVisible()
})

test('mobile view can switch between list and map', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'mobile-only smoke check')

  await page.goto('/?variant=grid')
  await page.getByRole('button', { name: 'Map' }).click()
  await expect(page.locator('.map-pane.mobile-active')).toBeVisible()

  await page.getByRole('button', { name: 'List' }).click()
  await expect(page.locator('.list-pane.mobile-active')).toBeVisible()

  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
  const innerWidth = await page.evaluate(() => window.innerWidth)
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth)
})

test('opens the selected Version 5 locator by default', async ({
  page,
  isMobile,
}) => {
  await page.goto('/')

  await expect(page.locator('.app.variant-locator')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Public piano map' })).toBeVisible()

  if (isMobile) {
    await expect(page.locator('.map-pane.mobile-active')).toBeVisible()
  } else {
    await expect(page.locator('.list-pane')).toBeVisible()
  }
})

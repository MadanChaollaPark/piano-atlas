import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

const pianosApiUrl = /\/api\/pianos(?:\?.*)?$/

const apiPianos = [
  {
    id: 'test:kr:seoul:city-hall',
    name: 'Seoul City Hall piano',
    venue: 'City Hall lobby',
    city: 'Seoul',
    country: 'South Korea',
    countryCode: 'KR',
    lat: 37.5666,
    lng: 126.9784,
    access: 'public',
    status: 'unknown',
    condition: 'good',
    confidence: 'high',
    instrument: 'upright',
    indoor: true,
    source: 'openstreetmap',
    sourceUrl: 'https://www.openstreetmap.org/',
    tags: ['city hall', 'public piano'],
  },
  {
    id: 'test:kr:seoul:nodeul',
    name: 'Nodeul Island piano',
    venue: 'Nodeul Island arts space',
    city: 'Seoul',
    country: 'South Korea',
    countryCode: 'KR',
    lat: 37.5171,
    lng: 126.9584,
    access: 'permissive',
    status: 'likely_available',
    condition: 'good',
    confidence: 'medium',
    instrument: 'piano_unknown',
    indoor: true,
    source: 'curated_seed',
    tags: ['island', 'arts space'],
  },
  {
    id: 'test:gb:london:st-pancras',
    name: 'St Pancras station piano',
    venue: 'St Pancras International',
    city: 'London',
    country: 'United Kingdom',
    countryCode: 'GB',
    lat: 51.5314,
    lng: -0.1261,
    access: 'public',
    status: 'available',
    condition: 'good',
    confidence: 'high',
    instrument: 'upright',
    indoor: true,
    source: 'curated_seed',
    tags: ['station', 'public piano'],
  },
]

async function mockPianoApi(page: Page) {
  await page.route(pianosApiUrl, async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        pianos: apiPianos,
        meta: {
          source: 'api',
          fetchedAt: '2026-07-10T00:00:00.000Z',
          stale: false,
          count: apiPianos.length,
        },
      }),
    })
  })
}

function pianoList(page: Page) {
  return page
    .getByRole('complementary', { name: 'Explore public pianos' })
    .locator('.piano-list')
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      ),
    )
    .toBeLessThanOrEqual(0)
}

test.describe('desktop atlas', () => {
  test.beforeEach(async ({ page, isMobile }) => {
    test.skip(isMobile === true, 'desktop-only coverage')
    await mockPianoApi(page)
  })

  test('shows the map and piano list together', async ({ page }) => {
    await page.goto('/')

    await expect(
      page.getByRole('heading', {
        level: 1,
        name: /Find a piano\.\s*Play the city\./,
      }),
    ).toBeVisible()
    await expect(
      page.getByRole('region', { name: 'Public piano map' }),
    ).toBeVisible()
    await expect(
      page.getByRole('complementary', { name: 'Explore public pianos' }),
    ).toBeVisible()
    await expect(
      pianoList(page).getByRole('button', {
        name: /St Pancras station piano/,
      }),
    ).toBeVisible()
  })

  test('filters results and restores filters from the URL', async ({ page }) => {
    await page.goto('/')

    await page.getByLabel('Search public pianos').fill('Seoul')
    await page.getByLabel('Access').selectOption('public')
    await page
      .getByRole('button', {
        name: 'Unverified',
        exact: true,
        pressed: false,
      })
      .click()

    await expect.poll(() => {
      const params = new URL(page.url()).searchParams
      return Object.fromEntries(params.entries())
    }).toEqual({ q: 'Seoul', access: 'public', status: 'unknown' })

    await expect(page.getByText('1 piano', { exact: true })).toBeVisible()
    await expect(
      pianoList(page).getByRole('button', {
        name: /Seoul City Hall piano/,
      }),
    ).toBeVisible()
    await expect(
      pianoList(page).getByRole('button', {
        name: /Nodeul Island piano/,
      }),
    ).toHaveCount(0)

    await page.reload()

    await expect(page.getByLabel('Search public pianos')).toHaveValue('Seoul')
    await expect(page.getByLabel('Access')).toHaveValue('public')
    await expect(page.getByText('1 piano', { exact: true })).toBeVisible()
  })

  test('toggles and persists dark mode', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => {
      window.localStorage.setItem('piano-atlas-theme', 'light')
    })
    await page.reload()

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await page.getByRole('button', { name: 'Toggle dark mode' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  })

  test('preserves and opens a valid piano deep link', async ({ page }) => {
    await page.goto('/?piano=test%3Agb%3Alondon%3Ast-pancras')

    await expect(page).toHaveURL(/piano=test%3Agb%3Alondon%3Ast-pancras/)
    await expect(
      page.getByRole('complementary', { name: 'Selected piano' }),
    ).toContainText('St Pancras station piano')
  })

  test('opens the add and selected-piano report dialog states', async ({
    page,
  }) => {
    await page.goto('/')

    await page
      .getByRole('button', { name: 'Add a public piano', exact: true })
      .click()
    const addDialog = page.getByRole('dialog', { name: 'Add a public piano' })
    await expect(addDialog).toBeVisible()
    await expect(addDialog.getByLabel('Name or venue')).toBeVisible()
    await expect(addDialog.getByLabel('City')).toBeVisible()
    await expect(addDialog.getByLabel('Country')).toBeVisible()
    await expect(
      addDialog.getByRole('button', { name: 'Submit for review' }),
    ).toBeVisible()
    await addDialog.getByRole('button', { name: 'Close report form' }).click()
    await expect(addDialog).toBeHidden()

    await pianoList(page)
      .getByRole('button', { name: /Seoul City Hall piano/ })
      .click()
    const selectedPiano = page.getByRole('complementary', {
      name: 'Selected piano',
    })
    await expect(selectedPiano).toBeVisible()
    await selectedPiano
      .getByRole('button', { name: 'Report', exact: true })
      .click()
    const reportDialog = page.getByRole('dialog', {
      name: 'Seoul City Hall piano',
    })
    await expect(reportDialog).toBeVisible()
    await expect(reportDialog.getByLabel('What changed?')).toHaveValue(
      'confirm_available',
    )
    await expect(reportDialog.getByLabel('Details')).toBeVisible()
    await expect(reportDialog.getByLabel('Name or venue')).toHaveCount(0)
  })

  test('sorts the nearest piano first after geolocation succeeds', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['geolocation'], {
      origin: 'http://127.0.0.1:5186',
    })
    await context.setGeolocation({ latitude: 37.5665, longitude: 126.978 })
    await page.goto('/')

    await expect(pianoList(page).getByRole('button').first()).toContainText(
      'St Pancras station piano',
    )
    await page
      .getByRole('button', { name: 'Closest to me', exact: true })
      .click()

    await expect(page.getByText('Nearest first', { exact: true })).toBeVisible()
    await expect(
      page.getByText(
        'Seoul City Hall piano is the closest listed piano to you.',
        { exact: true },
      ),
    ).toBeVisible()
    await expect(pianoList(page).getByRole('button').first()).toContainText(
      'Seoul City Hall piano',
    )
    await expect(
      page
        .getByRole('complementary', { name: 'Selected piano' })
        .getByText(/^\d+ m$/),
    ).toBeVisible()
  })

  test('uses bundled piano records when the API is unavailable', async ({
    page,
  }) => {
    await page.unroute(pianosApiUrl)
    await page.route(pianosApiUrl, async (route) => {
      await route.abort('failed')
    })
    await page.goto('/')

    await expect(page.getByText('Curated fallback layer')).toBeVisible()
    await expect(
      pianoList(page).getByRole('button', {
        name: /St Pancras station piano/,
      }),
    ).toBeVisible()
    await expect(page.getByText(/\d+ pianos?/, { exact: true })).toBeVisible()
  })
})

test.describe('mobile atlas', () => {
  test.beforeEach(async ({ page, isMobile }) => {
    test.skip(isMobile !== true, 'mobile-only coverage')
    await mockPianoApi(page)
  })

  test('switches between the map and list views', async ({ page }) => {
    await page.goto('/')

    const map = page.getByRole('region', { name: 'Public piano map' })
    const list = page.getByRole('complementary', {
      name: 'Explore public pianos',
    })
    const viewSwitch = page.getByRole('group', {
      name: 'Choose map or list view',
    })

    await expect(map).toBeVisible()
    await expect(list).toBeHidden()

    await viewSwitch.getByRole('button', { name: 'List', exact: true }).click()
    await expect(list).toBeVisible()
    await expect(map).toBeHidden()
    await expect(
      pianoList(page).getByRole('button', {
        name: /St Pancras station piano/,
      }),
    ).toBeVisible()

    await viewSwitch.getByRole('button', { name: 'Map', exact: true }).click()
    await expect(map).toBeVisible()
    await expect(list).toBeHidden()
  })

  test('has no horizontal overflow at 320px in map or list view', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 800 })
    await page.goto('/')

    await expectNoHorizontalOverflow(page)

    await page
      .getByRole('group', { name: 'Choose map or list view' })
      .getByRole('button', { name: 'List', exact: true })
      .click()
    await expect(
      page.getByRole('complementary', { name: 'Explore public pianos' }),
    ).toBeVisible()
    await expectNoHorizontalOverflow(page)
  })
})

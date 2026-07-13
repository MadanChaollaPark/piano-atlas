import { expect, test } from '@playwright/test'
import axe from 'axe-core'
import type { Page } from '@playwright/test'

const pianosApiUrl = /\/api\/pianos(?:\?.*)?$/
const reportsApiUrl = /\/api\/reports$/
const apiBaseUrl = 'http://127.0.0.1:5187'

declare global {
  interface Window {
    axe: typeof axe
  }
}

type Theme = 'light' | 'dark'

type ReportPayload = {
  pianoId?: string
  kind: string
  name?: string
  city?: string
  country?: string
  note: string
}

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

function explorerPanel(page: Page) {
  return page.getByRole('complementary', { name: 'Explore public pianos' })
}

function primaryFilterSelect(page: Page, label: string) {
  return page
    .locator('.filter-block > .filter-selects label')
    .filter({
      has: page.locator('span').filter({ hasText: new RegExp(`^${label}$`) }),
    })
    .locator('select')
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

async function setThemeBeforeLoad(page: Page, theme: Theme) {
  await page.addInitScript((themeName) => {
    window.localStorage.setItem('piano-atlas-theme', themeName)
  }, theme)
}

async function expectNoSeriousOrCriticalAxeViolations(
  page: Page,
  label: string,
) {
  await page.addScriptTag({ content: axe.source })
  const violations = await page.evaluate(async () => {
    const results = await window.axe.run(document, {
      resultTypes: ['violations'],
    })

    return results.violations
      .filter(
        (violation) =>
          violation.impact === 'serious' || violation.impact === 'critical',
      )
      .map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        help: violation.help,
        nodes: violation.nodes.map((node) => ({
          target: node.target.join(' '),
          summary: node.failureSummary,
        })),
      }))
  })

  expect(
    violations,
    `${label} has serious/critical axe violations:\n${JSON.stringify(
      violations,
      null,
      2,
    )}`,
  ).toEqual([])
}

async function openSelectedPianoReport(page: Page, isMobile: boolean) {
  if (isMobile) {
    await page
      .getByRole('group', { name: 'Choose map or list view' })
      .getByRole('button', { name: 'List', exact: true })
      .click()
  }

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
  return reportDialog
}

test.describe('accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await mockPianoApi(page)
  })

  for (const theme of ['light', 'dark'] as const) {
    test(`has no serious or critical axe violations in ${theme} mode`, async ({
      page,
      isMobile,
    }, testInfo) => {
      await setThemeBeforeLoad(page, theme)
      await page.goto('/')

      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
      await expect(
        page.getByRole('region', { name: 'Public piano map' }),
      ).toBeVisible()

      if (isMobile) {
        await expectNoSeriousOrCriticalAxeViolations(
          page,
          `${testInfo.project.name} ${theme} map view`,
        )
        await page
          .getByRole('group', { name: 'Choose map or list view' })
          .getByRole('button', { name: 'List', exact: true })
          .click()
        await expect(
          page.getByRole('complementary', { name: 'Explore public pianos' }),
        ).toBeVisible()
        await expectNoSeriousOrCriticalAxeViolations(
          page,
          `${testInfo.project.name} ${theme} list view`,
        )
      } else {
        await expect(
          page.getByRole('complementary', { name: 'Explore public pianos' }),
        ).toBeVisible()
        await expectNoSeriousOrCriticalAxeViolations(
          page,
          `${testInfo.project.name} ${theme}`,
        )
      }
    })
  }
})

test.describe('report submissions', () => {
  test.beforeEach(async ({ page }) => {
    await mockPianoApi(page)
  })

  test('submits a new piano report successfully', async ({
    page,
    isMobile,
  }) => {
    let reportPayload: ReportPayload | undefined
    await page.route(reportsApiUrl, async (route) => {
      expect(route.request().method()).toBe('POST')
      reportPayload = route.request().postDataJSON() as ReportPayload
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, id: 'report:test-success' }),
      })
    })

    await page.goto('/')
    await page
      .getByRole('button', { name: 'Add a public piano', exact: true })
      .click()
    const dialog = page.getByRole('dialog', { name: 'Add a public piano' })
    await expect(dialog).toBeVisible()

    await dialog.getByLabel('Name or venue').fill('Library atrium piano')
    await dialog.getByLabel('City').fill('Busan')
    await dialog.getByLabel('Country').fill('South Korea')
    await dialog
      .getByLabel('Details')
      .fill('Second floor atrium near the west reading room.')
    await dialog
      .getByRole('button', { name: 'Submit for review' })
      .click()

    await expect(dialog).toBeHidden()
    if (isMobile) {
      await page
        .getByRole('group', { name: 'Choose map or list view' })
        .getByRole('button', { name: 'List', exact: true })
        .click()
    }
    await expect(
      page.getByText('Thank you. Your piano tip was saved for review.', {
        exact: true,
      }),
    ).toBeVisible()
    expect(reportPayload).toEqual({
      kind: 'add_new',
      name: 'Library atrium piano',
      city: 'Busan',
      country: 'South Korea',
      note: 'Second floor atrium near the west reading room.',
    })
  })

  test('keeps the report dialog open when submission fails', async ({
    page,
    isMobile,
  }) => {
    let reportPayload: ReportPayload | undefined
    await page.route(reportsApiUrl, async (route) => {
      expect(route.request().method()).toBe('POST')
      reportPayload = route.request().postDataJSON() as ReportPayload
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'storage unavailable' }),
      })
    })

    await page.goto('/')
    const dialog = await openSelectedPianoReport(page, isMobile)
    await dialog
      .getByLabel('Details')
      .fill('The bench is missing and the sustain pedal is stuck.')
    const submit = dialog.getByRole('button', { name: 'Submit for review' })
    await submit.click()

    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('alert')).toHaveText(
      'Report rejected with 500',
    )
    await expect(submit).toBeEnabled()
    expect(reportPayload).toEqual({
      pianoId: 'test:kr:seoul:city-hall',
      kind: 'confirm_available',
      name: 'Seoul City Hall piano',
      city: 'Seoul',
      country: 'South Korea',
      note: 'The bench is missing and the sustain pedal is stuck.',
    })
  })
})

test.describe('api contract', () => {
  test.beforeEach(async ({ isMobile }) => {
    test.skip(isMobile === true, 'API contract is device-independent')
  })

  test('reports backend health', async ({ request }) => {
    const response = await request.get(`${apiBaseUrl}/api/health`)

    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toContain('application/json')
    expect(await response.json()).toEqual({
      ok: true,
      service: 'piano-atlas-api',
    })
  })

  test('rejects an invalid filter value', async ({ request }) => {
    const response = await request.get(
      `${apiBaseUrl}/api/pianos?access=private-only&limit=10`,
    )

    expect(response.status()).toBe(400)
    expect(await response.json()).toEqual({
      error: 'Invalid query parameters',
    })
  })

  test('rejects a malformed bbox value', async ({ request }) => {
    const response = await request.get(
      `${apiBaseUrl}/api/pianos?bbox=west,south,east,north&limit=5`,
    )

    expect(response.status()).toBe(400)
    expect(await response.json()).toEqual({
      error: 'Invalid query parameters',
    })
  })

  test('rejects invalid report payloads', async ({ request }) => {
    const missingNewFields = await request.post(`${apiBaseUrl}/api/reports`, {
      data: {
        kind: 'add_new',
        note: 'Enough detail to pass the length check.',
      },
    })
    const missingPianoId = await request.post(`${apiBaseUrl}/api/reports`, {
      data: {
        kind: 'missing',
        note: 'Enough detail to pass the length check.',
      },
    })

    expect(missingNewFields.status()).toBe(400)
    expect(await missingNewFields.json()).toEqual({ error: 'Invalid report' })
    expect(missingPianoId.status()).toBe(400)
    expect(await missingPianoId.json()).toEqual({ error: 'Invalid report' })
  })
})

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

  test('keeps rendering when browser storage is blocked', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get() {
          throw new DOMException('Storage blocked', 'SecurityError')
        },
      })
    })

    await page.goto('/')

    await expect(
      page.getByRole('heading', {
        level: 1,
        name: /Find a piano\.\s*Play the city\./,
      }),
    ).toBeVisible()
  })

  test('restores focus after closing the report dialog with Escape', async ({
    page,
  }) => {
    await page.goto('/')
    const opener = page.getByRole('button', {
      name: 'Add a public piano',
      exact: true,
    })

    await opener.focus()
    await opener.press('Enter')
    const dialog = page.getByRole('dialog', { name: 'Add a public piano' })
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')

    await expect(dialog).toBeHidden()
    await expect(opener).toBeFocused()
  })

  test('clusters nearby markers at the world view', async ({ page }) => {
    await page.goto('/')

    await expect(page.locator('.piano-cluster-marker')).not.toHaveCount(0)
    await expect(page.locator('.piano-marker-shell')).not.toHaveCount(
      apiPianos.length,
    )
  })

  test('shows a useful list empty state', async ({ page }) => {
    await page.goto('/')
    await page.getByLabel('Search public pianos').fill('No piano here')

    await expect(
      pianoList(page).getByText('No pianos match these filters', {
        exact: true,
      }),
    ).toBeVisible()
  })

  test('exposes source and confidence filters', async ({ page }) => {
    await page.goto('/')
    await page.getByText('More filters', { exact: true }).click()
    await page.getByLabel('Source').selectOption('curated_seed')
    await page.getByLabel('Confidence').selectOption('high')

    await expect(page).toHaveURL(/source=curated_seed/)
    await expect(page).toHaveURL(/confidence=high/)
    await expect(
      pianoList(page).getByRole('button', {
        name: /St Pancras station piano/,
      }),
    ).toBeVisible()
  })

  test('filters results and restores filters from the URL', async ({ page }) => {
    await page.goto('/')

    await page.getByLabel('Search public pianos').fill('Seoul')
    await primaryFilterSelect(page, 'Access').selectOption('public')
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

    await expect(
      explorerPanel(page).getByText('1 piano', { exact: true }),
    ).toBeVisible()
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
    await expect(primaryFilterSelect(page, 'Access')).toHaveValue('public')
    await expect(
      explorerPanel(page).getByText('1 piano', { exact: true }),
    ).toBeVisible()
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
        /Seoul City Hall piano is the closest listed piano/,
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
    await expect(
      page
        .getByRole('complementary', { name: 'Explore public pianos' })
        .getByText(/\d+ pianos?/, { exact: true })
        .first(),
    ).toBeVisible()
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

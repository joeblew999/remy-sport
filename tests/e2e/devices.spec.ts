import { test as base, expect, type BrowserContext, type Page } from '@playwright/test'
import { BASE, freshActor, releaseSessions, signIn } from '../helpers/auth'
import { visit } from '../helpers/surfaces'

// Each test owns its accounts; revoking all others cannot end a user's session.
const test = base.extend<{ devicePages: Page[] }>({
  devicePages: async ({ browser }, use) => {
    const contexts: BrowserContext[] = []
    try {
      for (let index = 0; index < 3; index++) {
        // Keep auth requests directly routable for the injected service failure.
        // Development service-worker reload behavior is tracked in the coverage plan.
        const context = await browser.newContext({ baseURL: BASE, serviceWorkers: 'block' })
        contexts.push(context)
        await context.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort())
        await context.addInitScript(() => localStorage.setItem('pwa-hide-install', 'true'))
      }
      await use(await Promise.all(contexts.map((context) => context.newPage())))
    } finally {
      await releaseSessions()
      await Promise.all(contexts.map((context) => context.close()))
    }
  },
})

async function openDevices(page: Page, email: string) {
  await page.bringToFront()
  await signIn(page.request, email)
  await visit(page, 'sessions')
  await expect(page.getByTestId('devices-list')).toBeVisible()
  const response = await page.request.get('/api/auth/get-session')
  expect(response.ok()).toBe(true)
  return ((await response.json()) as { session: { id: string } }).session.id
}

// Act on the device window the user has opened.
async function reloadDevice(page: Page) {
  await page.bringToFront()
  await page.reload({ waitUntil: 'domcontentloaded' })
}

async function signedOutAfterReload(page: Page) {
  await reloadDevice(page)
  await expect(page.getByTestId('devices-signed-out')).toBeVisible()
  expect(await (await page.request.get('/api/auth/get-session')).json()).toBeNull()
}

test('revoking a device through the browser persists after both devices reload', async ({ devicePages }) => {
  const [here, elsewhere] = devicePages as [Page, Page, Page]
  const email = freshActor()
  const ownId = await openDevices(here, email)
  const targetId = await openDevices(elsewhere, email)
  await reloadDevice(here)
  await here.getByTestId(`revoke-${targetId}`).click()
  await expect(here.getByTestId(`device-${targetId}`)).toHaveCount(0)
  await reloadDevice(here)
  await expect(here.getByTestId(`device-${ownId}`)).toBeVisible()
  await expect(here.getByTestId(`device-${targetId}`)).toHaveCount(0)
  await signedOutAfterReload(elsewhere)
})

test('revoking all other devices preserves this browser and an unrelated account after reload', async ({ devicePages }) => {
  const [here, elsewhere, stranger] = devicePages as [Page, Page, Page]
  const email = freshActor()
  const ownId = await openDevices(here, email)
  await openDevices(elsewhere, email)
  const strangerId = await openDevices(stranger, freshActor())
  await reloadDevice(here)
  await here.getByTestId('revoke-others').click()
  await expect(here.getByTestId('revoke-others')).toHaveCount(0)
  await reloadDevice(here)
  await expect(here.getByTestId(`device-${ownId}`)).toBeVisible()
  await expect(here.getByTestId('devices-list').locator('.device-row')).toHaveCount(1)
  await signedOutAfterReload(elsewhere)
  await reloadDevice(stranger)
  await expect(stranger.getByTestId(`device-${strangerId}`)).toBeVisible()
})

async function failedRevocation(devicePages: Page[], allOthers: boolean) {
  const [here, elsewhere] = devicePages as [Page, Page, Page]
  const email = freshActor()
  await openDevices(here, email)
  const targetId = await openDevices(elsewhere, email)
  await reloadDevice(here)
  const endpoint = allOthers ? '**/api/auth/revoke-other-sessions' : '**/api/auth/revoke-session'
  const control = here.getByTestId(allOthers ? 'revoke-others' : `revoke-${targetId}`)
  await here.route(endpoint, (route) => route.fulfill({
    status: 503, json: { message: 'Temporary session service failure' },
  }))
  await control.click()
  await expect(here.getByTestId('devices-error')).toContainText('Temporary session service failure')
  await expect(control).toBeEnabled()
  await reloadDevice(elsewhere)
  await expect(elsewhere.getByTestId('device-current')).toBeVisible()
  await here.bringToFront()
  await here.unroute(endpoint)
  await control.click()
  await expect(here.getByTestId('devices-error')).toHaveCount(0)
  await expect(here.getByTestId(`device-${targetId}`)).toHaveCount(0)
  await reloadDevice(here)
  await expect(here.getByTestId('device-current')).toBeVisible()
  await expect(here.getByTestId(`device-${targetId}`)).toHaveCount(0)
  await signedOutAfterReload(elsewhere)
}

test('failed device revocation keeps the session and retries successfully against the Worker', async ({ devicePages }) => {
  await failedRevocation(devicePages, false)
})

test('failed revoke-all keeps other sessions and retries successfully against the Worker', async ({ devicePages }) => {
  await failedRevocation(devicePages, true)
})

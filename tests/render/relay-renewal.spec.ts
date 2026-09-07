import { test, expect } from './fixture'
import { seedCache, entry, orpc } from '../helpers/seed-cache'
import { projectGame } from '../helpers/projections'
import { sessionFor } from '../helpers/actors'
import { visit } from '../helpers/surfaces'

for (const role of ['watch', 'publish'] as const) {
  test(`${role} renewal denial removes the media element and offers retry`, async ({ page }) => {
    await page.clock.install()
    const game = projectGame('gam_003', ['GAME_REFEREE'])
    await seedCache(page, [sessionFor('REFEREE'), entry(orpc.games.get, { id: game.id }, game)])
    await page.route('**/rpc/games/get**', (route) => route.fulfill({ json: { json: game } }))
    let denied = false
    const inputs: unknown[] = []
    await page.route('**/rpc/moq/config**', (route) => {
      const url = new URL(route.request().url())
      inputs.push(url.searchParams.get('data') ?? route.request().postData())
      return route.fulfill(denied ? {
        status: 403, contentType: 'application/json', body: JSON.stringify({ code: 'FORBIDDEN', message: 'Forbidden' }),
      } : { json: { json: { url: `https://relay.invalid/games/${game.id}`, token: 'test-capability' } } })
    })
    await visit(page, role === 'watch' ? 'watch' : 'broadcast', { id: game.id })
    const element = page.locator(role === 'watch' ? 'moq-watch' : 'moq-publish')
    await expect(element).toHaveCount(1)
    await expect.poll(() => element.evaluate((el) => String((el as HTMLElement & { url?: URL }).url ?? el.getAttribute('url')))).toMatch(/games\/gam_003\?jwt=test-capability/)
    if (role === 'publish') await element.evaluate((el) => {
      // Observe the component's cleanup contract without requesting a real camera.
      Object.defineProperty(el, 'source', { configurable: true, writable: true, value: 'camera' })
      ;(window as unknown as { oldPublisher: Element }).oldPublisher = el
    })
    denied = true
    await page.clock.fastForward(41_000)
    await expect(page.getByTestId('moq-renewal-denied')).toBeVisible()
    await expect(element).toHaveCount(0)
    if (role === 'publish') expect(await page.evaluate(() => (window as unknown as { oldPublisher: { source?: unknown } }).oldPublisher.source)).toBeUndefined()
    expect(JSON.stringify(inputs)).toContain(game.id)
    denied = false
    await page.getByTestId('moq-renewal-denied').getByRole('button').click()
    await expect(element).toHaveCount(1)
  })
}

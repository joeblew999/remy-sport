/** Real development Cloudflare relay check, with Chrome's synthetic camera.
 * Run: bun tests/integration/cloudflare-video.mjs while bun run dev is running.
 * No traces, screenshots or browser logs: relay URLs contain credentials.
 */
import { chromium, expect } from '@playwright/test'
import { BASE, IS_LOCAL, REFEREE, signIn, releaseSessions } from '../helpers/auth.ts'

if (!IS_LOCAL) throw new Error('This probe only targets local development')
const browser = await chromium.launch({ channel: 'chrome', args: [
  '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
  '--autoplay-policy=no-user-gesture-required',
] })
const publisher = await browser.newContext({ baseURL: BASE, permissions: ['camera', 'microphone'] })
const watcher = await browser.newContext({ baseURL: BASE })
let step = 'sign in'
let started = false
const progress = setInterval(() => console.log(`Checking: ${step}`), 15000)
publisher.setDefaultTimeout(15000)
watcher.setDefaultTimeout(15000)
try {
  await signIn(publisher.request, REFEREE)
  const pub = await publisher.newPage()
  const watch = await watcher.newPage()
  await watch.addInitScript(() => {
    // Count distinct decoded video timestamps painted on the actual Watch
    // canvas. Repainting the same frozen frame is not advancing video.
    window.__moqFrames = new Set()
    const draw = CanvasRenderingContext2D.prototype.drawImage
    CanvasRenderingContext2D.prototype.drawImage = function (...args) {
      const result = draw.apply(this, args)
      if (this.canvas.dataset.testid === 'moq-canvas' && args[0] instanceof VideoFrame) {
        window.__moqFrames.add(args[0].timestamp)
      }
      return result
    }
  })
  step = 'open Broadcast and Watch pages'
  await pub.goto('/#/broadcast/gam_002')
  await watch.goto('/#/watch/gam_002')
  await expect(pub.getByTestId('moq-start-camera')).toBeVisible({ timeout: 30000 })
  step = 'wait for a publisher that has not started yet'
  await watch.waitForTimeout(12_000)
  const frames = () => watch.evaluate(() => window.__moqFrames.size)
  const advancing = async () => {
    const before = await frames()
    await expect.poll(frames, { timeout: 45000 }).toBeGreaterThan(before + 10)
  }
  step = 'start synthetic camera and receive video'
  started = true
  await pub.getByTestId('moq-start-camera').click()
  await advancing()
  console.log('PASS: distinct video frames painted on the separate Watch page')
  step = 'keep healthy video connected'
  const healthy = await watch.locator('moq-watch').elementHandle()
  await watch.waitForTimeout(12_000)
  expect(await healthy.evaluate(node => node.isConnected)).toBe(true)
  await advancing()
  console.log('PASS: healthy video stays connected across the recovery interval')
  step = 'stop capture and video delivery'
  await pub.getByTestId('moq-stop').click()
  started = false
  await expect.poll(() => pub.locator('moq-publish video').evaluate(video =>
    !video.srcObject || video.srcObject.getTracks().every(track => track.readyState === 'ended')
  )).toBe(true)
  await watch.waitForTimeout(3000)
  const stopped = await frames()
  await watch.waitForTimeout(2000)
  expect(await frames()).toBe(stopped)
  console.log('PASS: capture released and watcher video stopped advancing')
  step = 'restart and receive video again'
  started = true
  await pub.getByTestId('moq-start-camera').click()
  await advancing()
  console.log('PASS: watcher video resumed after restart')
  await pub.getByTestId('moq-stop').click()
  started = false
} catch {
  console.error(`FAIL: ${step}. Browser diagnostics suppressed to protect relay credentials.`)
  for (const context of [publisher, watcher]) {
    for (const page of context.pages()) {
      console.log(await page.evaluate(() => {
        const node = document.querySelector('moq-publish, moq-watch')
        const video = document.querySelector('video')
        return {
          element: node?.tagName,
          connection: node?.connection?.status?.peek?.(),
          broadcast: node?.broadcast?.out?.status?.peek?.(),
          videoWidth: video?.videoWidth,
          frames: window.__moqFrames?.size,
        }
      }).catch(() => ({ pageUnavailable: true })))
    }
  }
  process.exitCode = 1
} finally {
  clearInterval(progress)
  if (started) await publisher.request.delete('/api/games/gam_002/broadcast').catch(() => {})
  await releaseSessions()
  await browser.close()
}

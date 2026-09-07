import { describe, it, expect, vi } from "vitest"
import { watchInstallable, type PwaInstall } from "../../src/web/lib/installable"

/**
 * Whether the app offers to install itself.
 *
 * The offer was gated on one read of `isInstallAvailable`, 1000ms after the
 * topbar mounted — earlier than every path `<pwa-install>` has to set it, and
 * the topbar mounts once, so a reader got a single one-second window per page
 * load and the install item never appeared.
 *
 * Tested here rather than in the browser tier because that tier cannot fail:
 * Playwright's WebKit presents as macOS Safari, so the component decides
 * "installable" on its own 500ms after load, and a render spec passes whether
 * or not anything is listening — measured against the broken code, which it
 * also passed. A fake element in node has no such opinion.
 */

/** The element, as much of it as the module asks about. */
function fakeElement(state: Partial<PwaInstall> = {}): PwaInstall {
  return Object.assign(new EventTarget(), state) as PwaInstall
}

/** The component's own signal, raised the way the component raises it. */
function saysAvailable(el: PwaInstall) {
  el.dispatchEvent(new CustomEvent("pwa-install-available-event"))
}

describe("watchInstallable", () => {
  it("offers nothing while the browser has not decided", () => {
    const report = vi.fn()
    watchInstallable(fakeElement(), report)
    expect(report).toHaveBeenCalledExactlyOnceWith(false)
  })

  it("offers straight away when the browser decided before we asked", () => {
    const report = vi.fn()
    watchInstallable(fakeElement({ isInstallAvailable: true }), report)
    expect(report).toHaveBeenCalledExactlyOnceWith(true)
  })

  /**
   * The regression. Every real path is later than the window the old timer
   * gave it — 500ms after `window.load` on Apple, whenever Chrome's engagement
   * heuristics fire `beforeinstallprompt`, up to thirty seconds on an Android
   * browser without it.
   */
  it("offers when the answer arrives long after we asked", () => {
    const report = vi.fn()
    const el = fakeElement()
    watchInstallable(el, report)
    expect(report).toHaveBeenLastCalledWith(false)

    saysAvailable(el)
    expect(report).toHaveBeenLastCalledWith(true)
  })

  it("offers nothing to a reader already running the installed app", () => {
    const report = vi.fn()
    const el = fakeElement({ isInstallAvailable: true, isUnderStandaloneMode: true })
    watchInstallable(el, report)
    expect(report).toHaveBeenLastCalledWith(false)

    // Not even when the component says installing is available: standalone is
    // the app it would be offering to install.
    saysAvailable(el)
    expect(report).toHaveBeenLastCalledWith(false)
  })

  it("withdraws the offer once the app is installed", () => {
    const report = vi.fn()
    const el = fakeElement({ isInstallAvailable: true })
    watchInstallable(el, report)
    expect(report).toHaveBeenLastCalledWith(true)

    el.dispatchEvent(new CustomEvent("pwa-install-success-event"))
    expect(report).toHaveBeenLastCalledWith(false)
  })

  it("stops listening when the component unmounts", () => {
    const report = vi.fn()
    const el = fakeElement()
    watchInstallable(el, report)()

    saysAvailable(el)
    expect(report).toHaveBeenCalledExactlyOnceWith(false)
  })

  /**
   * Inside Tauri main.tsx renders no element at all, and asking about one is
   * how a null reference reaches a reader who has the native app already.
   */
  it("says nothing at all where there is no element", () => {
    const report = vi.fn()
    expect(() => watchInstallable(null, report)()).not.toThrow()
    expect(report).not.toHaveBeenCalled()
  })
})

/**
 * Installing the app, from the platform's own event.
 *
 * ## Why this is not `@khmyznikov/pwa-install`
 *
 * That component did the job and cost more than it was worth. Two concrete
 * things, both recorded where they were found:
 *
 * **It is not translated.** 0.6.4 ships 33 locales and Thai is not among them,
 * so a Thai reader got English copy inside an otherwise Thai app — and it picks
 * its language from `navigator.language`, ignoring the locale this app already
 * knows. 128KB of locales we do not use, missing the one we need, in a codebase
 * where a lint rule fails the build over an untranslated placeholder.
 *
 * **It overlaid the app.** It prompted on arrival at z-index 2147483001, and
 * the first e2e run against a real deployment could not click Sign out —
 * Playwright named the element. localhost never meets the install criteria, so
 * thirty-four local runs had passed.
 *
 * What it genuinely added was iOS instructions, because Safari fires no event
 * and there is nothing to call. That is three sentences, and they are in
 * `messages/` with everything else now.
 *
 * ## What the platform gives
 *
 * Chrome, Edge and Android fire `beforeinstallprompt`. Preventing its default
 * and keeping the event lets the app ask later, at a moment a reader chose —
 * the event can only be used once, and only from a user gesture.
 *
 * Safari fires nothing. There is no API, on purpose, so the only honest thing
 * is to describe the steps.
 */

/**
 * The event Chromium fires. TypeScript's DOM lib declares it, so this uses that
 * rather than a hand-written interface — a second declaration would compile and
 * then disagree with the platform.
 */
let deferred: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()

const announce = () => listeners.forEach((fn) => fn())

/**
 * Already installed, so there is nothing to offer.
 *
 * Two ways to be running as an installed app: the display-mode media query,
 * which every platform that supports installing sets, and Safari's own
 * `navigator.standalone`, which predates it and is still the only signal on
 * iOS.
 */
export function isInstalled(): boolean {
  if (typeof window === "undefined") return false
  const standalone = (navigator as { standalone?: boolean }).standalone
  return window.matchMedia("(display-mode: standalone)").matches || standalone === true
}

/**
 * iOS Safari, where installing exists and cannot be triggered.
 *
 * Matched on the platform rather than the browser: every browser on iOS is
 * Safari underneath, so Chrome on an iPhone has the same limitation and needs
 * the same instructions.
 */
export function needsManualSteps(): boolean {
  if (typeof navigator === "undefined") return false
  const ua = navigator.userAgent
  const iOS = /iPad|iPhone|iPod/.test(ua) || (ua.includes("Mac") && navigator.maxTouchPoints > 1)
  return iOS && !deferred
}

/** Whether there is anything worth offering this reader. */
export function canInstall(): boolean {
  if (isInstalled()) return false
  return deferred !== null || needsManualSteps()
}

/**
 * Ask now.
 *
 * Returns false when there is no event to use — iOS, or a browser that never
 * fired one — which is the caller's signal to show the steps instead. The event
 * is dropped after use because Chromium refuses a second call on the same one.
 */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false
  const event = deferred
  deferred = null
  announce()
  await event.prompt()
  await event.userChoice
  return true
}

/** Re-render when the answer changes. Returns its own unsubscribe. */
export function onInstallChange(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/**
 * Start listening, once, from the app's entry.
 *
 * Not at module load: this file is imported by a component, and a component
 * that registers a window listener as a side effect of being imported is a
 * thing that fires in tests nobody meant to involve it.
 */
export function watchForInstall(): void {
  if (typeof window === "undefined") return

  window.addEventListener("beforeinstallprompt", (e) => {
    // Without this Chromium shows its own bar, which is the overlay problem
    // again in a different costume.
    e.preventDefault()
    deferred = e
    announce()
  })

  window.addEventListener("appinstalled", () => {
    deferred = null
    announce()
  })
}

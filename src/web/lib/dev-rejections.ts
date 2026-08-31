/**
 * Unhandled rejections, visible while you are working.
 *
 * The reporting half already existed and already worked: `watchForClientErrors`
 * in ./report.ts has listened for `unhandledrejection` and beaconed it since it
 * was written. What it cannot do is tell the person who caused it, in the
 * second they caused it — a beacon goes to a dataset, and the developer sees a
 * page that quietly does nothing.
 *
 * Both copies of the `pushState()` defect were exactly that: a section of the
 * profile page rendered as *nothing*, with a rejection nobody saw.
 *
 * ## Not the crash boundary, for two reasons
 *
 * A rejection is usually not fatal. Replacing a working app with a crash screen
 * is false severity, and a developer learns to dismiss it — which is how the
 * next real one gets dismissed too.
 *
 * And `tests/render/no-backend.spec.ts` asserts two things about every route:
 * that nothing rejected, *and* that the app still rendered. Those are separate
 * assertions on purpose — if a rejection unmounted the app they would collapse
 * into one and the by-name diagnosis would be lost. So this must not change
 * what that spec observes.
 *
 * Which is why it renders **outside `#root`**, appended to `document.body`. The
 * spec's `#root` assertion cannot see it, no page selector can match it, and
 * React never knows it exists.
 *
 * ## Gated on the hostname, not on `import.meta.env.DEV`
 *
 * `DEV` is never true in this repo. `mise run dev` runs `vite build --watch` —
 * a production build, watched — and the render tier serves `dist/web` through
 * `vite preview`. There is no vite dev server anywhere, deliberately: what you
 * develop against is the bundle you ship. The first version of this was gated
 * on `DEV` and was therefore dead code that could never have run.
 *
 * localhost only, which fails safe: anything else counts as not-development, so
 * a deployment cannot show a reader a red box. main.tsx imports this
 * dynamically, so it is a separate chunk production never fetches.
 */

const MAX = 4

let list: HTMLElement | null = null

/** The panel, made once, on the first rejection — never on a healthy page. */
function panel(): HTMLElement {
  if (list) return list
  const box = document.createElement("div")
  box.dataset.devRejections = ""
  // `right: 0` with `left: auto` and a max-width: a full-width bar could push
  // the document wider on a narrow viewport, and mobile-layout.spec.ts asserts
  // no route overflows at 360px.
  box.style.cssText = [
    "position:fixed",
    "bottom:8px",
    "right:8px",
    "max-width:min(420px, calc(100vw - 16px))",
    "z-index:2147483647",
    "font:12px/1.4 ui-monospace,monospace",
    "background:#3b0d0d",
    "color:#ffd7d7",
    "border:1px solid #ff6b6b",
    "border-radius:6px",
    "padding:8px 10px",
    "white-space:pre-wrap",
    "overflow-wrap:anywhere",
    // Cannot swallow a click. It is fixed in the bottom-right corner with the
    // highest z-index there is, so anything under it would become unclickable
    // the moment a rejection happened — including a Save button, in a test that
    // would then fail for a reason with nothing to do with the cause. The
    // dismiss button opts back in below.
    "pointer-events:none",
  ].join(";")

  const dismiss = document.createElement("button")
  dismiss.textContent = "dismiss"
  dismiss.style.cssText =
    "float:right;margin-left:8px;background:transparent;color:inherit;border:1px solid currentColor;border-radius:4px;font:inherit;cursor:pointer;pointer-events:auto"
  dismiss.addEventListener("click", () => {
    box.remove()
    list = null
  })
  box.appendChild(dismiss)

  document.body.appendChild(box)
  list = box
  return box
}

/**
 * What to show for a rejection.
 *
 * The *message* is shown here and deliberately never beaconed — this is one
 * developer's own browser, where "Not Found" is the useful half and there is
 * nobody to leak it to. ./report.ts sends only the bounded name.
 */
function describe(reason: unknown): string {
  if (reason instanceof Error) {
    const code = (reason as Error & { code?: unknown }).code
    const tag = typeof code === "string" && code ? `${code}: ` : ""
    return `${tag}${reason.message || reason.name}`
  }
  if (reason !== null && typeof reason === "object") {
    try {
      return JSON.stringify(reason).slice(0, 200)
    } catch {
      // The rule guards the view-model layer from shipping English to readers
      // and is right to. This panel is developer tooling — localhost only,
      // never in a reader's browser — and a translated stack-trace viewer would
      // be absurd. Every string in this file is untranslated on purpose.
      // eslint-disable-next-line no-restricted-syntax
      return "[unserialisable rejection]"
    }
  }
  return `rejected with a ${typeof reason}: ${String(reason).slice(0, 200)}`
}

export function showRejectionsInDev(): void {
  if (typeof window === "undefined") return
  window.addEventListener("unhandledrejection", (event) => {
    try {
      const box = panel()
      const line = document.createElement("div")
      line.textContent = describe(event.reason)
      box.appendChild(line)
      // A rejection loop must not grow the DOM without bound — the same reason
      // ./report.ts dedupes the beacon, for the same failure.
      while (box.querySelectorAll("div").length > MAX) box.querySelector("div")!.remove()
    } catch {
      // Showing a problem must not become one.
    }
  })
}

/**
 * Telling the server that the browser broke.
 *
 * Separate from the crash boundary because two of the three ways a page dies
 * never reach React at all: an error thrown outside a render (a timer, an event
 * handler, a dynamic import), and a promise nobody caught. A boundary sees the
 * third only.
 *
 * `sendBeacon`, like the video reporter, because the interesting moment is often
 * a page that is already on its way out — exactly when a fetch is cancelled.
 */

/** What we say about a broken page. Deliberately not much. */
interface ClientError {
  /** The error's class name — `TypeError`, `ChunkLoadError`. */
  name: string
  /** Which component threw, or where the handler was. */
  where: string
  /** The route, with ids removed. */
  route: string
}

/**
 * The hash route, without anything identifying.
 *
 * `#/team/team_017` becomes `/team/:id`. Which *kind* of page breaks is the
 * question; which row it was showing is not, and an id here would both shard
 * the data and put a user's browsing in a telemetry store.
 */
export function routeShape(hash: string): string {
  return (
    hash
      .replace(/^#/, "")
      .split("?")[0]!
      .split("/")
      .map((part) => (/^[a-z]{2,6}_[\w-]+$/i.test(part) ? ":id" : part))
      .join("/") || "/"
  )
}

/** The current route, shaped. Separated so the shaping itself is testable. */
function currentRoute(): string {
  return typeof location === "undefined" ? "/" : routeShape(location.hash)
}

/** Never throws, and never reports the same error twice in a row. */
let last = ""

export function reportClientError(error: unknown, extra: { where?: string } = {}): void {
  try {
    if (typeof navigator === "undefined" || !navigator.sendBeacon) return

    const e = error as { name?: unknown; message?: unknown } | null
    const payload: ClientError = {
      name: typeof e?.name === "string" ? e.name : "Error",
      where: (extra.where ?? "").slice(0, 120),
      route: currentRoute(),
    }

    // A broken render can throw on every frame. Without this, one bad component
    // sends thousands of identical beacons and the dataset says the app is on
    // fire everywhere rather than broken in one place.
    const key = `${payload.name}|${payload.where}|${payload.route}`
    if (key === last) return
    last = key

    navigator.sendBeacon(
      "/api/analytics",
      new Blob([JSON.stringify({ event: "client.error", fields: payload })], {
        type: "application/json",
      }),
    )
  } catch {
    // Reporting a crash must not cause one.
  }
}

/**
 * Everything React cannot see.
 *
 * `error` catches a throw from a timer, an event handler or a failed dynamic
 * import — the last of which is the common one in a deployed SPA, where a
 * client on the old build asks for a chunk the new deploy has replaced.
 * `unhandledrejection` catches a promise nobody awaited, which is most of the
 * async code in any app.
 *
 * Called once, from main.tsx. Listeners rather than `window.onerror =`, so this
 * cannot silently replace something else's handler.
 */
export function watchForClientErrors(): void {
  if (typeof window === "undefined") return
  window.addEventListener("error", (event) => {
    reportClientError(event.error ?? { name: "Error" }, {
      // The file that threw, without the origin — enough to tell app code from
      // an extension or a third-party script.
      where: (event.filename ?? "").split("/").pop()?.slice(0, 120) ?? "",
    })
  })
  window.addEventListener("unhandledrejection", (event) => {
    reportClientError(event.reason, { where: "unhandledrejection" })
  })
}

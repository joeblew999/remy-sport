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

/**
 * The most identifying *low-cardinality* thing about a failure.
 *
 * `name` alone was not enough once `unhandledrejection` started arriving here.
 * A rejected oRPC call is an `Error` whose constructor the bundler has minified
 * to `e` — measured — so every rejection in production reported as plain
 * "Error" and the dataset could not tell a 404 from a 500 from a bug.
 *
 * What it carries instead is `code` ("NOT_FOUND") and `status` (404). Those are
 * bounded — the model's own error vocabulary plus HTTP — and they are the
 * question. `message` and `data` are deliberately still never sent: a message
 * is unbounded and can name a person, which is the whole reason this payload is
 * "deliberately not much".
 */
export function errorName(error: unknown): string {
  const e = error as { name?: unknown; code?: unknown; status?: unknown } | null
  // A real subclass beats everything: TypeError and ChunkLoadError are exactly
  // what this field was for, and they survive minification because they are the
  // platform's own.
  if (typeof e?.name === "string" && e.name && e.name !== "Error") return e.name.slice(0, 60)
  if (typeof e?.code === "string" && e.code) return e.code.slice(0, 60)
  if (typeof e?.status === "number") return `HTTP_${e.status}`
  // Rejecting with a bare string or a number is its own class of bug, and one
  // worth being able to see. The value itself is not recorded: it is unbounded.
  if (error !== null && typeof error !== "object") return `non-error:${typeof error}`
  return "Error"
}

/** Never throws, and never reports the same error twice in a row. */
let last = ""

export function reportClientError(error: unknown, extra: { where?: string } = {}): void {
  try {
    if (typeof navigator === "undefined" || !navigator.sendBeacon) return

    const payload: ClientError = {
      name: errorName(error),
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

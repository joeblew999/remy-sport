/**
 * Product telemetry: what happened, where, and how often.
 *
 * An app-level capability whose first consumer happened to be the MoQ video
 * demo. It is deliberately not a MoQ pipeline — procedure failures, push
 * delivery and video sessions belong in one dataset keyed by an event name,
 * because the questions worth asking cut across features. "What is failing,
 * where, how often" is one query or it is three dashboards nobody opens.
 *
 * Analytics Engine rather than D1. A D1 row is a fact somebody can edit and a
 * foreign key means something; this is append-only, unbounded, and read only in
 * aggregate — the shape D1 is worst at and this is built for.
 *
 * ## Why there is a catalogue and not just a write call
 *
 * Analytics Engine's own model is twenty string columns called `blob1`…`blob20`
 * and twenty numbers called `double1`…`double20`. Nothing names them, nothing
 * types them, and nothing connects the code that writes column four to the query
 * that reads it. That is not a small inconvenience — it is a bug generator, and
 * it generated one immediately: the browser beacon put the country in `blob2`
 * and the server-side calls put the route there, so every report reading both
 * was wrong by one column. Silently, because a shifted string is still a string.
 *
 * `EVENTS` is the fix, and it only works because **both ends read it**. Writers
 * pass named fields and never a position. `scripts/analytics.ts` builds its SQL
 * from `blobColumn`/`doubleColumn` here, so a report cannot disagree with the
 * writer about which column is which — there is no second place to be wrong.
 *
 * **It can never fail a request.** Every path is wrapped and returns silently:
 * telemetry that can take down the thing it measures is worse than none.
 */

import type { Bindings } from "./types"
import { usesOutbox } from "./mail/mailer"

/**
 * One event's shape.
 *
 * A function rather than a bare object literal so `dimensions` can be checked
 * against `blobs` at compile time — a dimension that names a field the event
 * does not have is the exact class of mistake this file exists to end.
 */
function defineEvent<const B extends readonly string[], const D extends readonly string[]>(spec: {
  /** String fields, in column order. Append only — see the note on EVENTS. */
  blobs: B
  /** Numeric fields, in column order. */
  doubles: D
  /**
   * The subset of `blobs` worth grouping a report by.
   *
   * Not every field is a dimension. `gameId` identifies a row; grouping by it
   * produces one line per game and answers nothing, while `transport` and
   * `errorName` are the columns that turn a pile of sessions into "WebSocket
   * fallbacks fail four times as often". Reports group by these and by nothing
   * else, which is why it is declared here rather than decided per report.
   */
  dimensions: readonly B[number][]
}) {
  return spec
}

/**
 * Every event this system can emit, and what each one carries.
 *
 * The array order is the physical column order. Appending a field is safe;
 * *inserting* one changes what a column means for rows already written, so add
 * to the end.
 */
export const EVENTS = {
  /** A procedure said no: an ORPCError, carrying a code and a status. */
  "api.refused": defineEvent({
    blobs: ["route", "method", "code"],
    doubles: ["ms", "status"],
    dimensions: ["route", "method", "code"],
  }),
  /** A procedure threw something that was not a refusal. Ours to fix. */
  "api.threw": defineEvent({
    blobs: ["route", "method", "error"],
    doubles: ["ms", "status"],
    dimensions: ["route", "method", "error"],
  }),
  /** One push, to one device, keyed by whose push service took it. */
  "push.sent": defineEvent({
    blobs: ["host", "status", "tag"],
    doubles: ["ok"],
    dimensions: ["host", "status"],
  }),
  /** A camera started pointing at a game — the transition, not the heartbeat. */
  "broadcast.started": defineEvent({
    blobs: ["gameId"],
    doubles: [],
    // Nothing: the count is the answer, and one row per game is not.
    dimensions: [],
  }),
  /** ...and stopped, with how long it lasted. */
  "broadcast.ended": defineEvent({
    blobs: ["gameId"],
    doubles: ["seconds"],
    dimensions: [],
  }),
  /** One viewer's or publisher's video session, reported by the browser. */
  "moq.session": defineEvent({
    blobs: ["role", "gameId", "transport", "errorName"],
    doubles: ["errorCode", "seconds"],
    dimensions: ["role", "transport", "errorName"],
  }),
} as const

export type EventName = keyof typeof EVENTS
export type EventSpec = {
  blobs: readonly string[]
  doubles: readonly string[]
  dimensions: readonly string[]
}

/** The named fields one event takes: strings for blobs, numbers for doubles. */
export type Fields<N extends EventName> = {
  [K in (typeof EVENTS)[N]["blobs"][number]]?: string
} & {
  [K in (typeof EVENTS)[N]["doubles"][number]]?: number
}

/**
 * The two columns every event has, before its own fields.
 *
 * `event` first so every query starts by filtering on it. `country` second so
 * any result can be sliced by where it happened without the query needing to
 * know which feature wrote the row — "6% of sessions fall back to WebSocket" is
 * a different problem in one country than in twenty.
 */
export const FIXED_BLOBS = ["event", "country"] as const

/**
 * Where an event's own field N lives, physically.
 *
 * The single place a column number is computed. Both the writer below and the
 * report SQL in `scripts/analytics.ts` go through these, which is what makes
 * the two halves incapable of disagreeing.
 */
export const blobColumn = (i: number) => `blob${FIXED_BLOBS.length + i + 1}`
export const doubleColumn = (i: number) => `double${i + 1}`

export function track<N extends EventName>(
  env: TrackEnv,
  event: N,
  fields: Fields<N>,
  /** Two-letter country, where there is a request to read it from. */
  country?: string,
): void {
  write(env, event, fields as Record<string, string | number | undefined>, country)
}

/**
 * `track` for a caller whose event name is only known at runtime.
 *
 * The browser beacon, and nothing else. It reads an event name off the wire,
 * checks it against the catalogue with `isEventName`, and filters the fields to
 * the ones that event declares — so by the time it reaches here the values are
 * as validated as the generic version's, but no *type* can say so.
 *
 * A separate honest signature rather than a cast at the call site: the cast was
 * a lie about a genuinely dynamic input, and it sat in the one layer that
 * exists to be typed.
 */
export function trackDynamic(
  env: TrackEnv,
  event: EventName,
  fields: Record<string, string | number>,
  country?: string,
): void {
  write(env, event, fields, country)
}

/**
 * What `track` needs off the environment.
 *
 * `MAIL_TRANSPORT` is here because it is this codebase's existing answer to "is
 * this a deployment?" — the same flag that decides whether `/api/dev/outbox`
 * exists. Reusing it means there is one rule to get right rather than two that
 * can disagree about which worker they are running on.
 */
type TrackEnv = Pick<Bindings, "ANALYTICS" | "MAIL_TRANSPORT">

/**
 * Whether this worker keeps its telemetry where a person can read it.
 *
 * True on a dev server, false on a deployment. It is *not* "is the binding
 * missing", which is what this used to be and which was simply wrong:
 * `wrangler dev` binds Analytics Engine and then discards every write, with no
 * local dataset and no error. So the branch never ran, the ring never filled,
 * and the endpoint that serves it 404'd — the whole local half was dead, and it
 * looked like it worked because the reports fell back to the deployment.
 */
export function keepsEventsLocally(env: TrackEnv): boolean {
  return usesOutbox(env as Bindings)
}

function write(
  env: TrackEnv,
  event: EventName,
  fields: Record<string, string | number | undefined>,
  country: string | undefined,
): void {
  try {
    const spec: EventSpec = EVENTS[event]
    if (keepsEventsLocally(env)) {
      keep(event, fields, country)
      return
    }
    if (!env.ANALYTICS) return
    env.ANALYTICS.writeDataPoint({
      // A missing field becomes a blank rather than a hole. Analytics Engine
      // matches by position, so a dropped entry shifts every later field into
      // the wrong column — and the rows most worth reading are exactly the ones
      // missing fields, because they are the ones that went wrong.
      blobs: [event, country ?? "", ...spec.blobs.map((k) => String(fields[k] ?? ""))],
      doubles: spec.doubles.map((k) => Number(fields[k] ?? 0)),
      indexes: [event],
    })
  } catch {
    // Deliberately silent. A rejected write, a malformed point, a binding that
    // is not what we think it is — none of them are worth a 500 on a request
    // that had otherwise succeeded.
  }
}

/**
 * The last few hundred events, when there is nowhere to send them.
 *
 * `wrangler dev` binds Analytics Engine and then throws every write away —
 * there is no local dataset and no error either. So the whole of local
 * development, which is the loop that actually matters, was invisible: the only
 * way to see a single telemetry row was to deploy, which is the opposite of a
 * fast loop.
 *
 * Filled on a dev server and never on a deployment, so this holds no request
 * data anywhere it could not be read anyway.
 *
 * This is what `/api/dev/events` serves and what `mise run analytics` renders
 * when a dev server is up. Same reports either way, because both are generated
 * from `EVENTS` — so what you read locally is shaped exactly like what you will
 * read from the deployment.
 *
 * In memory, capped, lost on reload. That is right for what it is: a window
 * onto the last few minutes of a dev server, not a store.
 */
const RING_SIZE = 500
const ring: RecordedEvent[] = []

export interface RecordedEvent {
  event: EventName
  country: string
  at: string
  fields: Record<string, string | number>
}

function keep(
  event: EventName,
  fields: Record<string, string | number | undefined>,
  country: string | undefined,
): void {
  const spec: EventSpec = EVENTS[event]
  // Normalised the same way the real write normalises, so the local view cannot
  // show a shape the deployed one would not.
  const kept: Record<string, string | number> = {}
  for (const k of spec.blobs) kept[k] = String(fields[k] ?? "")
  for (const k of spec.doubles) kept[k] = Number(fields[k] ?? 0)
  ring.push({ event, country: country ?? "", at: new Date().toISOString(), fields: kept })
  if (ring.length > RING_SIZE) ring.shift()
}

/** What the dev endpoint serves. Oldest first, as they happened. */
export function recent(): readonly RecordedEvent[] {
  return ring
}

/**
 * Whether a string off the wire names a real event. The beacon's gate.
 *
 * `Object.hasOwn`, not `in`. `in` walks the prototype chain, so `"toString"`,
 * `"constructor"` and `"valueOf"` all passed — and the write that followed then
 * read `.blobs` off a function and threw into the silent catch. Unauthenticated
 * input reaching this, which is the whole design of the beacon, makes that the
 * difference between a gate and the appearance of one.
 */
export function isEventName(name: unknown): name is EventName {
  // `hasOwnProperty.call`, not `Object.hasOwn`: the SPA's tsconfig targets an
  // older lib and this module is reachable from it.
  return typeof name === "string" && Object.prototype.hasOwnProperty.call(EVENTS, name)
}

/**
 * Everything the platform sends you can be turned off.
 *
 * `src/web/components/notification-settings.tsx` lists the notification types
 * it offers a switch for, and it used to carry a comment asking whoever wrote
 * the next trigger to add it: "Each one is added here as its trigger is
 * written." Two were not. `EVENT_REMINDER` has sent from the cron since the
 * scheduled handler shipped and `ROSTER_CHANGE` from registration, and no
 * reader could mute either — the settings page had quietly become a partial
 * list of what arrives on their phone.
 *
 * Nothing caught it because nothing could: `push.ts` honours a preference row
 * for *any* type, so both halves were individually correct. The bug lived in
 * the gap between them, which is where a comment was doing the work.
 *
 * So this compares the two lists in both directions:
 *
 *   1. Every type the Worker sends has a switch. Otherwise it cannot be muted.
 *   2. Every switch corresponds to something that sends. Otherwise it is a
 *      control that does nothing, which is the failure the original comment was
 *      guarding against.
 *
 * ## Why the senders are found by reading source
 *
 * A trigger is a call site, not a value in a table — `notify(...)` with a
 * literal `typeCode`. There is no runtime registry to walk, and inventing one
 * so a check could read it would be adding indirection to the product to make
 * the test easier. Reading the literals is the honest version, and it is
 * checked against the model's own list so a typo cannot pass as a sender.
 */

import { readdirSync, readFileSync, statSync } from "fs"
import { join, relative, resolve } from "path"
import { NOTIFICATION_TYPE_CODES } from "../../src/domain/vocabularies"
import { rule } from "./helpers"

const ROOT = resolve(import.meta.dirname, "../..")
const SERVER = resolve(ROOT, "src")
const SETTINGS = resolve(ROOT, "src/web/components/notification-settings.tsx")

/** Server sources — the SPA cannot send a notification, so it is not searched. */
function serverSources(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) {
      // The SPA and the generated message catalogue send nothing.
      if (entry === "web" || entry === "paraglide" || entry === "domain") continue
      serverSources(path, acc)
    } else if (/\.ts$/.test(path)) acc.push(path)
  }
  return acc
}

const known = new Set<string>(NOTIFICATION_TYPE_CODES)

/**
 * Where each type is named in server code, so a failure can cite the file.
 *
 * Any string literal of a known type counts, rather than only `typeCode: "X"`.
 * The narrow version missed three of the five: games.ts picks between
 * MATCH_START and MATCH_END through a ternary into a local, then passes it
 * positionally, and SCORE_UPDATE arrives as a parameter — none of which is a
 * `typeCode:` key.
 *
 * Over-matching is the safe direction and it is deliberate. It can only make
 * rule 1 stricter — a type mentioned anywhere on the server had better be
 * mutable — while rule 2, the dead-switch half, is the one that loses a little
 * precision. Rule 1 is the one that let unmutable notifications ship.
 */
const senders = new Map<string, string[]>()
for (const file of serverSources(SERVER)) {
  const source = readFileSync(file, "utf8")
  for (const match of source.matchAll(/"([A-Z][A-Z0-9_]+)"/g)) {
    const code = match[1]!
    if (!known.has(code)) continue
    const at = relative(ROOT, file)
    if (!senders.get(code)?.includes(at)) senders.set(code, [...(senders.get(code) ?? []), at])
  }
}

const settings = readFileSync(SETTINGS, "utf8")
const block = settings.match(/const OFFERED = \[(.*?)\] as const/s)
const offered = new Set(block ? [...block[1]!.matchAll(/"([A-Z_]+)"/g)].map((m) => m[1]!) : [])

const unmutable = [...senders.keys()].filter((code) => !offered.has(code)).sort()
const dead = [...offered].filter((code) => !senders.has(code)).sort()

const problems = [
  ...(block ? [] : ["could not find `const OFFERED = [...]` in notification-settings.tsx"]),
  ...unmutable.map(
    (code) =>
      `${code} is sent from ${senders.get(code)!.join(", ")} and has no switch.\n` +
      "    A reader cannot turn it off. Add it to OFFERED in notification-settings.tsx.",
  ),
  ...dead.map(
    (code) =>
      `${code} has a switch and nothing sends it.\n` +
      "    A control that does nothing teaches a reader the controls do not work.",
  ),
]

rule(
  "everything the platform sends can be turned off",
  problems,
  "check-notifications: the settings page and the senders disagree\n\n" + problems.map((p) => `  ${p}`).join("\n"),
  `check-notifications: ${offered.size} of ${known.size} notification types are sent, ` +
    "and every one of them can be turned off",
)

/**
 * The same question, one dimension along: every offered **cell**, not type.
 *
 * The check above proves every switch corresponds to a sender. It was written
 * when there was one channel, and the day EMAIL became a second one it stopped
 * covering the thing it was for: `ROSTER_CHANGE` was offered an email switch
 * although src/api/registrations.ts has no EMAIL renderer for it and says so
 * deliberately. Turning it on wrote a preference row nothing would ever read —
 * exactly the dead control the original rule guards against, invisible to it
 * because it compared types.
 *
 * `CHANNELS_FOR` in the settings page is the claim; the renderers are the fact.
 * A renderer is a key in the object a `notify` call site passes — `PUSH:` and
 * `EMAIL:` beside a `typeCode` — so, like the senders above, it is found by
 * reading source rather than by inventing a registry for the test's benefit.
 *
 * Association is per file, which is coarser than per call site and honest about
 * it: notify-queue.ts holds the three live types and the reminder and renders
 * EMAIL for both, registrations.ts holds ROSTER_CHANGE and renders none. If a
 * file ever mixes a type that has an email body with one that does not, this
 * will pass something it should not, and the fix then is to narrow it to the
 * call site rather than to trust it further.
 */
const CHANNELS = ["PUSH", "EMAIL"] as const

const rendered = new Map<string, Set<string>>()
for (const file of serverSources(SERVER)) {
  const source = readFileSync(file, "utf8")
  const here = CHANNELS.filter((c) => new RegExp(`\\b${c}:\\s*\\(`).test(source))
  if (!here.length) continue
  for (const match of source.matchAll(/"([A-Z][A-Z0-9_]+)"/g)) {
    const code = match[1]!
    if (!known.has(code)) continue
    rendered.set(code, new Set([...(rendered.get(code) ?? []), ...here]))
  }
}

const table = settings.match(/const CHANNELS_FOR[^=]*= \{(.*?)\n\}/s)
const claimed = new Map<string, string[]>()
for (const line of table?.[1]?.split("\n") ?? []) {
  const m = line.match(/([A-Z_]+):\s*\[([^\]]*)\]/)
  if (m) claimed.set(m[1]!, [...m[2]!.matchAll(/"(\w+)"/g)].map((c) => c[1]!))
}

const cells: string[] = []
if (!table) cells.push("could not find `const CHANNELS_FOR = {...}` in notification-settings.tsx")
for (const code of offered) {
  const has = rendered.get(code) ?? new Set<string>()
  const says = claimed.get(code) ?? []
  for (const channel of says) {
    if (!has.has(channel)) {
      cells.push(
        `${code} is offered on ${channel} and nothing renders it.\n` +
          "    The switch stores a preference no sender will ever read.",
      )
    }
  }
  for (const channel of has) {
    if (!says.includes(channel)) {
      cells.push(
        `${code} has a ${channel} renderer and no cell offers it.\n` +
          "    It is sent and cannot be turned off on that channel.",
      )
    }
  }
}

rule(
  "every offered channel has something that renders it",
  cells,
  "check-notifications: the settings matrix and the renderers disagree\n\n" +
    cells.map((c) => `  ${c}`).join("\n"),
  `check-notifications: ${[...claimed.values()].flat().length} (type, channel) cells, each with a renderer`,
)

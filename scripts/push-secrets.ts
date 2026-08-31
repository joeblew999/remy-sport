/**
 * Set the VAPID keys on the deployed Worker, once, and never rotate them.
 *
 * This was a shell block in mise.toml whose whole guard was:
 *
 *     if echo "$SECRETS" | grep -q VAPID_PRIVATE_KEY; then exit 0; fi
 *
 * which asks about one half of a keypair. A deployment holding
 * `VAPID_PUBLIC_KEY` and no private one — a partial `secret put`, an
 * interrupted run, a manual fix left half-finished — fell straight through to
 * generating a fresh pair and putting all three. The result is internally
 * consistent, so nothing errors and the task exits 0. It has also just rotated
 * the public key that every already-subscribed browser pinned at `subscribe()`
 * time: every production subscription is dead, and there is nothing to detect
 * it server-side except push deliveries quietly starting to fail.
 *
 * The decision is `decideVapid` in ./vapid.ts, shared with scripts/dev-vars.ts,
 * because the consequence is identical and only the storage differs.
 *
 * ## It is a script because the bash could not be tested
 *
 * `wrangler secret list` answers JSON, so exact-name matching is
 * `names.has("VAPID_PRIVATE_KEY")` rather than a substring grep over the whole
 * listing, and the generated pair is read from a value rather than out of
 * stdout with `grep`/`cut`. More importantly the three-way decision can be
 * asserted in tests/unit/vapid-decision.test.ts against synthetic listings,
 * which is the only way to exercise the half-pair branches at all: the real
 * ones would mean rotating production to find out.
 */

import { DEFAULT_SUBJECT, decideFromNames, generateVapid, halfPairMessage } from "./vapid"

const WORKER = "the deployed worker"

/**
 * The two ways past a refusal, and they are not equivalent.
 *
 * A half-pair means push is *already* off: `vapidFrom` in src/api/push.ts needs
 * all three values, so it returns null, `/api/push/key` answers null, nobody
 * can subscribe and nothing sends. The existing subscriptions are not dead —
 * they are rows in `userNotificationChannel`, which outlive the secrets. Put
 * the missing half back and the same public key is served again, and every
 * subscription a browser pinned still matches.
 *
 * That recoverability is the whole thing the refusal protects. So the first
 * version of this offered only `PUSH_ROTATE` — and an operator with an urgent,
 * unrelated deploy blocked by a half-pair had two options: find the missing key
 * under time pressure, or set a variable that permanently kills every
 * subscription. The only escape hatch destroyed the thing being protected, and
 * it is the one somebody reaches for at 2am.
 *
 *   PUSH_SKIP=1    proceed, touch nothing. Push stays off, which it already
 *                  was, and stays recoverable. Almost always the right answer:
 *                  the deploy being shipped has nothing to do with push.
 *   PUSH_ROTATE=1  generate a new pair. Fixes push immediately and costs every
 *                  existing subscription — the browsers cannot be told, so each
 *                  reader has to turn notifications on again.
 *
 * Skipping still warns, every run. An override that goes quiet is one that
 * lives in a CI variable for a year while nobody fixes the keys.
 */
const SKIP = process.env.PUSH_SKIP === "1"
const ROTATE = process.env.PUSH_ROTATE === "1"

/** The secret names on the Worker, exactly. Empty when it is not deployed yet. */
async function currentSecrets(): Promise<Set<string> | null> {
  const proc = Bun.spawn(["bun", "x", "wrangler", "secret", "list"], {
    stdout: "pipe",
    stderr: "pipe",
  })
  const [out, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited])
  if (code !== 0) return null
  try {
    return new Set((JSON.parse(out) as { name: string }[]).map((s) => s.name))
  } catch {
    return null
  }
}

const names = await currentSecrets()
if (!names) {
  // Not an error: `deploy` runs this before the Worker exists on a first
  // deploy, and again afterwards.
  console.log("push:secret:set: worker not deployed yet — skipping (deploy runs this again afterwards)")
  process.exit(0)
}

const decision = decideFromNames(names)

if (decision.action === "refuse" && SKIP) {
  // Loud, and loud every time. Push is off either way; this only declines to
  // make that permanent by rotating.
  console.warn(
    `push:secret:set: PUSH_SKIP=1 — ${WORKER} has ${decision.have} and not ${decision.missing}.\n` +
      "  Nothing was changed. Web Push is off on this deployment and stays off, and\n" +
      `  every existing subscription stays recoverable: restore ${decision.missing} and\n` +
      "  the same public key is served again, so browsers reconnect on their own.\n" +
      "  This warning does not go away until the keys are whole.",
  )
  process.exit(0)
}

if (decision.action === "refuse" && !ROTATE) {
  console.error(`push:secret:set: ${halfPairMessage(decision, WORKER)}\n`)
  console.error(
    "  This fails the deploy on purpose. A half-pair means Web Push is already off\n" +
      "  here, and continuing would either rotate silently or ship keys that cannot\n" +
      "  send.\n\n" +
      "  Two ways past it, and they are not equivalent:\n\n" +
      "    PUSH_SKIP=1    ship this deploy, touch no keys. Push stays off — it\n" +
      "                   already is — and every existing subscription stays\n" +
      `                   recoverable the moment ${decision.missing} comes back.\n` +
      "                   This is almost certainly what you want.\n\n" +
      "    PUSH_ROTATE=1  generate a new pair. Push works again immediately, and\n" +
      "                   every existing subscription dies: the browsers pinned the\n" +
      "                   old public key and cannot be told. Each reader has to turn\n" +
      "                   notifications on again.",
  )
  process.exit(1)
}

if (decision.action === "keep") {
  console.log("push:secret:set: VAPID keys already set, no change")
  process.exit(0)
}

/**
 * A subject with no keys is not a reason to make keys.
 *
 * It carries no cryptographic relationship to the pair — it is the contact
 * address a push service complains to — so it is filled in on its own, and
 * never as part of deciding anything about the keypair.
 */
const put = async (name: string, value: string) => {
  const proc = Bun.spawn(["bun", "x", "wrangler", "secret", "put", name], {
    stdin: new TextEncoder().encode(value),
    stdout: "inherit",
    stderr: "inherit",
  })
  if ((await proc.exited) !== 0) {
    console.error(`push:secret:set: could not set ${name}`)
    process.exit(1)
  }
}

if (decision.action === "refuse") {
  console.log(`push:secret:set: PUSH_ROTATE=1 — rotating, and every existing subscription dies`)
}

const { publicKey, privateKey } = await generateVapid()
if (!names.has("VAPID_SUBJECT")) {
  await put("VAPID_SUBJECT", process.env.VAPID_SUBJECT ?? DEFAULT_SUBJECT)
}
await put("VAPID_PUBLIC_KEY", publicKey)
await put("VAPID_PRIVATE_KEY", privateKey)

console.log("push:secret:set: VAPID keys set — Web Push is on")

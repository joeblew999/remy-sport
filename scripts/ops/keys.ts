/**
 * Generate one VAPID keypair, printed as the three lines that configure push.
 *
 * VAPID is how a push service knows the notification came from us. The private
 * key signs a JWT per push; the public key is handed to the browser at
 * `subscribe()` time and pinned into the subscription. That pinning is the part
 * worth knowing: **rotating the keypair invalidates every existing
 * subscription** — the browser keeps sending to an endpoint the new key can no
 * longer sign for, and pushes fail 403 forever. So this is run once per
 * deployment and the output kept, not re-run when something looks broken.
 *
 * The encoding is what `@block65/webcrypto-web-push` reads, which is the
 * standard one: the public key is the raw uncompressed P-256 point (65 bytes,
 * leading 0x04), the private key is the JWK `d` parameter. Both base64url,
 * unpadded — a padded key is silently rejected by some push services.
 */
const b64url = (bytes: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")

/**
 * The subject tells a push service who to contact about a misbehaving sender.
 *
 * It has to be a real mailto: or https: URL — Apple's push service rejects the
 * subscription outright if it is neither, which reads as a mysterious 400.
 */
export const DEFAULT_SUBJECT = "mailto:admin@ubuntusoftware.net"

export const PUBLIC_KEY = "VAPID_PUBLIC_KEY"
export const PRIVATE_KEY = "VAPID_PRIVATE_KEY"

/** What to do about a keypair, given what is already there. */
export type VapidDecision =
  | { action: "keep" }
  | { action: "generate" }
  | { action: "refuse"; have: string; missing: string }

/**
 * The three-outcome rule, in one place, for `.dev.vars` and for the deployed
 * Worker's secrets alike.
 *
 * The public and private keys are halves of one keypair and only mean anything
 * together, so the question is never "is this key missing" — it is "what state
 * is the pair in":
 *
 *   both present   leave it alone. **Rotating invalidates every subscription**
 *                  a browser has already pinned at `subscribe()` time; they
 *                  keep sending to an endpoint the new key cannot sign for and
 *                  fail 403 forever, with nothing server-side to detect it
 *                  except deliveries quietly starting to fail.
 *   both absent    generate a pair.
 *   one present    refuse. Generating the partner produces a mismatched pair
 *                  and replacing the survivor is a full rotation; both are
 *                  silent, and which one is wanted is a person's decision.
 *
 * Written here rather than twice because the mechanisms differ — a gitignored
 * file, and `wrangler secret put` — while the decision and its consequence do
 * not. `scripts/push-secrets.ts` had this as a bash `grep -q VAPID_PRIVATE_KEY`
 * that saw only the private half, so a deployment holding a public key and no
 * private one silently rotated every production subscription and exited 0.
 */
export function decideVapid(has: { publicKey: boolean; privateKey: boolean }): VapidDecision {
  if (has.publicKey && has.privateKey) return { action: "keep" }
  if (!has.publicKey && !has.privateKey) return { action: "generate" }
  return has.publicKey
    ? { action: "refuse", have: PUBLIC_KEY, missing: PRIVATE_KEY }
    : { action: "refuse", have: PRIVATE_KEY, missing: PUBLIC_KEY }
}

/**
 * The same decision, from a listing of names.
 *
 * `wrangler secret list` answers `[{ name, type }]` and `.dev.vars` is a set of
 * keys, so both callers hold a set of names by the time they get here. Shared
 * so the mapping from a listing is the tested step rather than something each
 * caller open-codes — the bash version's `grep -q VAPID_PRIVATE_KEY` was
 * exactly that mapping, written once, wrongly, and never exercised.
 */
export const decideFromNames = (names: Set<string> | ReadonlySet<string>): VapidDecision =>
  decideVapid({ publicKey: names.has(PUBLIC_KEY), privateKey: names.has(PRIVATE_KEY) })

/**
 * What is wrong, and why it is a person's decision — with no mechanism.
 *
 * Deliberately stops before saying *how* to resolve it, because the two callers
 * resolve it differently: `.dev.vars` is a file you edit, and the deployed
 * Worker has `PUSH_SKIP` and `PUSH_ROTATE`. This said "delete the surviving key
 * and rerun", which is right for the file and became wrong advice for the
 * Worker the moment it grew flags — a shared string that names one caller's
 * mechanism is a shared string that misleads the other.
 */
export function halfPairMessage(d: { have: string; missing: string }, where: string): string {
  return (
    `${where} has ${d.have} but not ${d.missing}.\n` +
    "  These are halves of one keypair. Generating the missing half would pair it with\n" +
    "  a key it cannot sign for, and replacing the one that is there rotates it — which\n" +
    "  invalidates every subscription a browser has already pinned, silently.\n" +
    `  Restoring ${d.missing} costs nothing and loses nothing; rotating costs every\n` +
    "  subscription. Which one is right is a decision, not a default."
  )
}

/**
 * One VAPID keypair, as the three variables that configure push.
 *
 * Exported so `scripts/lib/dev-vars.ts` can seed `.dev.vars` with a pair on a fresh
 * checkout without a second copy of the encoding. There was no second copy, and
 * that was the bug: dev-vars generated BETTER_AUTH_SECRET, MAIL_TRANSPORT and
 * TEST_OTP and nothing else, so push was configured exactly once by hand and
 * silently absent for everyone who cloned afterwards.
 */
export async function generateVapid(subject = process.env.VAPID_SUBJECT ?? DEFAULT_SUBJECT) {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ])
  const publicKey = b64url(await crypto.subtle.exportKey("raw", pair.publicKey))
  const { d } = await crypto.subtle.exportKey("jwk", pair.privateKey)
  return { subject, publicKey, privateKey: d! }
}

// Printed only when run directly, so importing this to generate a pair does not
// spray a private key into somebody else's stdout.
if (import.meta.main) {
  const { subject, publicKey, privateKey } = await generateVapid()
  console.log(`VAPID_SUBJECT=${subject}`)
  console.log(`VAPID_PUBLIC_KEY=${publicKey}`)
  console.log(`VAPID_PRIVATE_KEY=${privateKey}`)
}

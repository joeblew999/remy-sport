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

/**
 * One VAPID keypair, as the three variables that configure push.
 *
 * Exported so `scripts/dev-vars.ts` can seed `.dev.vars` with a pair on a fresh
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

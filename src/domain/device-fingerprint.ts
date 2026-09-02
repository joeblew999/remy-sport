/**
 * A name for a push endpoint that is safe to send to the browser.
 *
 * The endpoint itself never leaves the Worker: it is a bearer capability, and
 * anyone holding the URL can push to that browser. But the page has one
 * question it could not previously ask — "is the device I am sitting at one of
 * the devices on this list?" — and answering it needs a stable name both sides
 * can compute without the server handing over the secret.
 *
 * SHA-256 of the endpoint, truncated. The browser hashes the subscription it
 * already holds and looks for the same string; nothing reversible crosses the
 * wire, and an attacker who obtained a fingerprint gains nothing they could
 * push to.
 *
 * ## Why this is in src/domain
 *
 * Both halves must agree exactly or the page reports every device as somebody
 * else's. src/domain is the only place the Worker and the SPA may both import
 * from — the dependency rules forbid src/web reaching into src/api at runtime,
 * and duplicating twelve characters of hashing in two files is precisely how
 * they would drift.
 *
 * Twelve hex characters: 48 bits. The set being distinguished is one person's
 * browsers — single digits — so this is far past sufficient, and the length is
 * about being readable in a debug line rather than about collisions.
 */
export async function deviceFingerprint(endpoint: string): Promise<string> {
  const bytes = new TextEncoder().encode(endpoint)
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 12)
}

/**
 * Web Push encryption and VAPID signing — RFC 8291, RFC 8188, RFC 8292.
 *
 * Written here rather than taken from a package, after measuring what the
 * package actually put on the wire. `@block65/webcrypto-web-push` — the obvious
 * choice, and the one that advertises Cloudflare Workers support — emits the
 * superseded drafts of *both* halves:
 *
 *   content-encoding: aesgcm          (draft-01, replaced by aes128gcm)
 *   Authorization: WebPush <jwt>      (VAPID draft-01, replaced by `vapid t=,k=`)
 *
 * Chrome and Firefox still accept those. **Apple does not**, and on iOS a web
 * app is the only way we reach a phone at all — so the package would have
 * failed on precisely the device this feature exists for, silently, as a 400
 * from a push service nobody was watching.
 *
 * Everything below is WebCrypto, which workerd has natively. There is no
 * dependency and nothing to keep in step with a spec that stopped moving in
 * 2017. tests/worker/push.test.ts implements the *receiving* half from the same
 * RFCs and decrypts real output, so a mistake here fails a test rather than
 * quietly reaching nobody.
 */

/**
 * Bytes backed by a plain ArrayBuffer.
 *
 * `Uint8Array` alone is generic over `ArrayBufferLike`, which includes
 * `SharedArrayBuffer` — and WebCrypto accepts neither that nor a view onto it.
 * Naming the concrete type once keeps every helper below assignable to
 * `BufferSource` instead of casting at each of the dozen call sites.
 */
type Bytes = Uint8Array<ArrayBuffer>

const utf8 = (s: string): Bytes => new TextEncoder().encode(s) as Bytes

export const b64urlEncode = (bytes: ArrayBuffer | Uint8Array): string =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")

export function b64urlDecode(value: string): Bytes {
  // base64url is not base64: `-` and `_` stand in for `+` and `/`, and padding
  // is dropped. `atob` accepts neither, and gets it wrong without throwing.
  const padded = value.padEnd(value.length + ((4 - (value.length % 4)) % 4), "=")
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"))
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i)
  return bytes
}

function concat(...parts: Uint8Array[]): Bytes {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.length
  }
  return out
}

/** HKDF-SHA256, extract and expand in one step — all these RFCs ever need. */
async function hkdf(ikm: Bytes, salt: Bytes, info: Bytes, length: number): Promise<Bytes> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"])
  return new Uint8Array(
    await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, length * 8),
  )
}

export type PushSubscription = {
  endpoint: string
  keys: { p256dh: string; auth: string }
  /**
   * When the push service will stop honouring this endpoint, if it ever does.
   * Null on every browser in practice — kept because `PushSubscription.toJSON()`
   * emits it, and dropping it here would mean the stored record no longer round
   * trips through what the browser actually gave us.
   */
  expirationTime?: number | null
}

export type VapidKeys = { subject: string; publicKey: string; privateKey: string }

/**
 * The signed token that identifies us to the push service (RFC 8292).
 *
 * The audience is the push *service's* origin, not the subscription path — a
 * token scoped to the full endpoint is rejected. Expiry is bounded: services
 * refuse anything more than 24 hours out, so 12 keeps a margin and still lets
 * one token cover a burst of sends.
 */
async function vapidToken(endpoint: string, vapid: VapidKeys): Promise<string> {
  const publicBytes = b64urlDecode(vapid.publicKey)
  // Uncompressed point: 0x04 || x(32) || y(32). The JWK needs x and y
  // separately, and they are simply the two halves after the tag byte.
  const jwk: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    x: b64urlEncode(publicBytes.subarray(1, 33)),
    y: b64urlEncode(publicBytes.subarray(33, 65)),
    d: vapid.privateKey,
    ext: true,
  }
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  )

  const header = b64urlEncode(utf8(JSON.stringify({ typ: "JWT", alg: "ES256" })))
  const claims = b64urlEncode(
    utf8(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
        sub: vapid.subject,
      }),
    ),
  )
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    utf8(`${header}.${claims}`),
  )
  // Raw r||s, which is what JWS ES256 wants. WebCrypto already returns that
  // rather than the DER encoding OpenSSL would give, so no conversion.
  return `${header}.${claims}.${b64urlEncode(signature)}`
}

/**
 * Encrypt one payload for one subscription (RFC 8291 over RFC 8188).
 *
 * A fresh keypair and salt per message, which the spec requires: the content
 * encryption key is derived from both, so reusing either across two messages to
 * the same subscriber would reuse an AES-GCM key and nonce pair.
 */
async function encrypt(subscription: PushSubscription, plaintext: Bytes): Promise<Bytes> {
  const clientPublicBytes = b64urlDecode(subscription.keys.p256dh)
  const authSecret = b64urlDecode(subscription.keys.auth)

  const local = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveBits",
  ])
  const localPublicBytes = new Uint8Array(await crypto.subtle.exportKey("raw", local.publicKey))

  const clientKey = await crypto.subtle.importKey(
    "raw",
    clientPublicBytes,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  )
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: clientKey }, local.privateKey, 256),
  )

  const salt = crypto.getRandomValues(new Uint8Array(16))

  // The step that binds the shared secret to both identities. The order is
  // normative — client key first, then ours — and swapping them yields a key
  // that is perfectly valid and decrypts nothing.
  const ikm = await hkdf(
    shared,
    authSecret,
    concat(utf8("WebPush: info\0"), clientPublicBytes, localPublicBytes),
    32,
  )
  const cek = await hkdf(ikm, salt, utf8("Content-Encoding: aes128gcm\0"), 16)
  const nonce = await hkdf(ikm, salt, utf8("Content-Encoding: nonce\0"), 12)

  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"])
  // 0x02 is RFC 8188's "last record" delimiter. One record is always enough:
  // push services cap payloads at 4KB, well under the record size below.
  const padded = concat(plaintext, new Uint8Array([2]))
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, padded),
  )

  // The aes128gcm header, which carries everything the receiver needs to derive
  // the same key: salt, record size, and our ephemeral public key.
  const recordSize = new Uint8Array(4)
  new DataView(recordSize.buffer).setUint32(0, 4096)
  return concat(
    salt,
    recordSize,
    new Uint8Array([localPublicBytes.length]),
    localPublicBytes,
    ciphertext,
  )
}

/** A ready-to-send request for one subscription. */
export async function buildPush(
  subscription: PushSubscription,
  data: unknown,
  vapid: VapidKeys,
  options: { ttl?: number; topic?: string; urgency?: "low" | "normal" | "high" } = {},
): Promise<{ method: "POST"; headers: Record<string, string>; body: ArrayBuffer }> {
  const body = await encrypt(subscription, utf8(JSON.stringify(data)))
  const token = await vapidToken(subscription.endpoint, vapid)

  const headers: Record<string, string> = {
    authorization: `vapid t=${token}, k=${vapid.publicKey}`,
    "content-encoding": "aes128gcm",
    "content-type": "application/octet-stream",
    // How long the service should hold this if the device is offline. A live
    // score is worth minutes, not days — an hour-old "score update" arriving
    // after the final whistle is noise.
    ttl: String(options.ttl ?? 300),
  }
  if (options.topic) headers.topic = options.topic
  if (options.urgency) headers.urgency = options.urgency

  // A copy sized to exactly these bytes: `body.buffer` may be a window onto a
  // larger allocation, and the trailing bytes would be read as ciphertext.
  return { method: "POST", headers, body: body.slice().buffer as ArrayBuffer }
}

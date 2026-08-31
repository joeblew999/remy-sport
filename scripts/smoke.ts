/**
 * Verify a deployed Worker, without a sign-in backdoor.
 *
 * This is what `mise run deploy` ends with. It used to end with `test:deployed`
 * — the whole Playwright suite pointed at production — which never actually ran:
 * it needs `TEST_OTP` as both a local env var and a Worker secret, and no task
 * provisions either, so the pipeline always exited red even when the deploy had
 * succeeded.
 *
 * Provisioning it to run the whole suite was the obvious fix and the wrong one:
 * the suite *writes* as it runs, and the `hook-*@remy.dev` accounts that used to
 * sit in the deployed database are what previous runs against production left
 * behind.
 *
 * `TEST_OTP` itself is now set deliberately, for a different reason — it fixes
 * the sign-in code for seeded accounts so the demo picker can offer them, since
 * `.test` addresses have no inbox. Two things keep that honest and both are
 * checked below: the seeded **admin** is excluded, because it can impersonate
 * and therefore reach a real person; and the outbox stays 404, because it would
 * expose everyone else's codes.
 *
 * The suite already runs against a real Worker earlier in the same pipeline
 * (`mise run test`, wrangler dev + local D1). Running it twice mostly re-proves
 * the same things. What it cannot prove there — and all this needs to — is that
 * *this deployment* boots, reaches its own D1, and matches the schema that was
 * just migrated onto it.
 *
 * So: read-only, plus one write that must be a no-op. Nothing here sends mail
 * or creates an account.
 */

const BASE = process.env.CF_DEPLOY_URL ?? "https://remy.ubuntusoftware.net"

/**
 * Where the VAPID keys for *this* host are supposed to come from.
 *
 * This used to say "`mise run push:secret:set` has not run" whatever was being
 * smoke-tested, and that task sets secrets on the **deployed** Worker. The dev
 * tunnel is not a deployment: `dev-remy.ubuntusoftware.net` is TUNNEL_HOSTNAME
 * pointing cloudflared at a local `wrangler dev`, so its environment is
 * `.dev.vars` and no amount of `push:secret:set` will change what it serves.
 *
 * A remedy that names the wrong file is worse than none — it sends somebody to
 * re-run a working deploy step and conclude the bug is elsewhere. So the advice
 * follows the host actually being tested.
 */
function vapidRemedy(): string {
  const host = (() => {
    try {
      return new URL(BASE).hostname
    } catch {
      return BASE
    }
  })()
  // TUNNEL_HOSTNAME by name where mise exports it, rather than sniffing a
  // "dev-" prefix — the tunnel host is configuration, and a deployment free to
  // rename it should not silently start getting the wrong advice.
  const tunnel = process.env.TUNNEL_HOSTNAME
  const local =
    host === "localhost" || host === "127.0.0.1" || (tunnel ? host === tunnel : host.startsWith("dev-"))
  return local
    ? `${host} runs from .dev.vars — run \`mise run dev:vars\` and restart wrangler dev`
    : "`mise run push:secret:set` has not run for this deployment"
}

const { SEED_ENTITIES } = await import("../src/domain/model/entities")

let failed = 0

async function check(name: string, fn: () => Promise<string | null>) {
  try {
    const problem = await fn()
    if (problem) {
      console.log(`  ✘ ${name}\n      ${problem}`)
      failed++
    } else {
      console.log(`  ✓ ${name}`)
    }
  } catch (err) {
    console.log(`  ✘ ${name}\n      ${(err as Error).message}`)
    failed++
  }
}

const get = (path: string) => fetch(`${BASE}${path}`)

console.log(`smoke: ${BASE}`)

await check("health responds", async () => {
  const res = await get("/api/health")
  if (!res.ok) return `expected 200, got ${res.status}`
  const body = (await res.json()) as { status?: string }
  return body.status === "ok" ? null : `expected status "ok", got ${JSON.stringify(body)}`
})

await check("the SPA is served", async () => {
  const res = await get("/")
  if (!res.ok) return `expected 200, got ${res.status}`
  const html = await res.text()
  // run_worker_first means a misconfigured [assets] block returns the Worker's
  // 404 rather than the app, and both are 200-shaped to a naive check.
  return html.includes("<div id=\"root\"") || html.toLowerCase().includes("remy")
    ? null
    : "response did not look like the app shell"
})

await check("every installable icon the manifest names is served", async () => {
  const res = await get("/manifest.webmanifest")
  if (!res.ok) return `expected 200, got ${res.status}`
  const { icons } = (await res.json()) as { icons?: { src: string }[] }
  if (!icons?.length) return "the manifest declares no icons"
  // The manifest names its icons unhashed, so they only resolve if vite copied
  // them verbatim from src/web/public. Authored one directory up they were
  // treated as source, content-hashed into /assets, and every one of these
  // 404'd — through a deploy, because a browser fetches a manifest icon only
  // when someone installs the app. Nothing else here would have noticed.
  const missing: string[] = []
  for (const { src } of icons) {
    const icon = await get(new URL(src, `${BASE}/manifest.webmanifest`).pathname)
    if (!icon.ok) missing.push(`${src} → ${icon.status}`)
  }
  return missing.length ? `not served: ${missing.join(", ")}` : null
})

await check("Web Push is configured and offering a usable key", async () => {
  const res = await get("/api/push/key")
  if (!res.ok) return `expected 200, got ${res.status}`
  const { publicKey } = (await res.json()) as { publicKey: string | null }
  if (!publicKey) return `no VAPID key — ${vapidRemedy()}`
  // 65 bytes base64url: an uncompressed P-256 point. A key of the wrong length
  // is accepted by `subscribe()` on some browsers and rejected on others, so
  // the shape is checked here rather than discovered on somebody's phone.
  const bytes = atob(publicKey.replace(/-/g, "+").replace(/_/g, "/"))
  return bytes.length === 65 && bytes.charCodeAt(0) === 4
    ? null
    : `key is ${bytes.length} bytes, expected a 65-byte uncompressed point`
})

await check("the events read path returns the PO's data", async () => {
  const res = await get("/api/events")
  if (!res.ok) return `expected 200, got ${res.status}`
  const { events } = (await res.json()) as { events: unknown[] }
  // Proves the Worker reaches its D1 and the seeded rows are actually there —
  // not just that the route exists.
  return events.length >= SEED_ENTITIES.events.length
    ? null
    : `expected at least ${SEED_ENTITIES.events.length} events, got ${events.length}`
})

await check("the teams read path answers", async () => {
  const res = await get("/api/teams")
  return res.ok ? null : `expected 200, got ${res.status}`
})

await check("if seeded sign-in is on, it excludes the admin", async () => {
  // Enabled by TEST_OTP, which fixes the code for seeded non-admin accounts so
  // the demo picker can offer them — `.test` addresses have no inbox to read.
  // 404 means it is off, which is also fine.
  const res = await get("/api/dev/accounts")
  if (res.status === 404) return null
  if (!res.ok) return `expected 200 or 404, got ${res.status}`

  const body = (await res.json()) as { accounts?: { role: string }[]; code?: string }
  const admin = body.accounts?.find((a) => a.role === "admin")
  // The one account that can impersonate, and therefore reach a real person.
  if (admin) return "the seeded admin is being offered a published sign-in code"
  if (!body.code) return "seeded sign-in is on but no code was published — nobody can use it"
  return null
})

await check("the dev outbox does NOT exist", async () => {
  // The outbox is mounted only under MAIL_TRANSPORT=outbox, and unlike the
  // account list above it must NEVER open on a deployment: it would let anyone
  // read other people's sign-in codes, including a real person's. Seeded
  // sign-in deliberately does not need it — the code is published instead.
  const res = await get("/api/dev/outbox")
  return res.status === 404 ? null : `expected 404, got ${res.status}`
})

await check("Better Auth is mounted and reaches the database", async () => {
  // A signed-out visitor gets 200 with a null body. A 500 here is the signature
  // of a Worker deployed ahead of its migrations — the shape migration 0007
  // caused, where every sign-in failed on a column that did not exist yet.
  const res = await get("/api/auth/get-session")
  if (res.status !== 200) return `expected 200, got ${res.status}`
  const body = await res.text()
  return body.includes("user") || body === "null" || body === "" || body === "{}"
    ? null
    : `unexpected session body: ${body.slice(0, 120)}`
})

await check("a wrong sign-in code is refused", async () => {
  // Exercises the verify path against the real database without sending mail or
  // needing a fixed code. A 500 means the auth tables are wrong; a 200 would
  // mean something far worse.
  const res = await fetch(`${BASE}/api/auth/sign-in/email-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({ email: "nobody@example.invalid", otp: "000000" }),
  })
  if (res.status < 400 || res.status >= 500) return `expected a 4xx refusal, got ${res.status}`
  // The status alone proves nothing: a host that has never heard of this route
  // also answers 4xx, so the check passed against example.com. Require Better
  // Auth's own error shape, which only something running Better Auth produces.
  const body = (await res.json().catch(() => null)) as { code?: string; message?: string } | null
  return body?.code || body?.message
    ? null
    : "4xx, but not a Better Auth error body — is that route actually mounted?"
})

await check("the seed route does NOT exist", async () => {
  // It used to, and unauthenticated: 330 D1 statements to anyone who found it,
  // plus vocabulary upserts that re-asserted the PO's labels over edited ones.
  // Seeding is an operator action now — `mise run seed:remote` applies the SQL
  // through wrangler — so on a deployment this must be as absent as the outbox.
  const res = await fetch(`${BASE}/api/seed`, { method: "POST" })
  return res.status === 404 ? null : `expected 404, got ${res.status}`
})

if (failed) {
  console.error(`\nsmoke: ${failed} check(s) failed against ${BASE}`)
  process.exit(1)
}
console.log(`\nsmoke: the deployment is serving the PO's data and refusing what it should`)

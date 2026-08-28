/**
 * Create the dev tunnel and point a fixed hostname at it. Idempotent.
 *
 * `cloudflared tunnel login` is the documented path and it cannot work here: it
 * opens a browser, asks a person to pick a zone, and writes a `cert.pem`. Fine
 * for a human, impossible for an agent — which is why `tunnel:named` sat
 * unusable for however long. It referenced `TUNNEL_NAME` and `TUNNEL_HOSTNAME`
 * that were never defined anywhere, so it expanded to an empty tunnel name and
 * would have failed the first time anyone ran it.
 *
 * A *remotely-managed* tunnel needs no certificate. It is created through the
 * account API with the token this repo already holds in fnox, and
 * `cloudflared tunnel run --token …` authenticates with the tunnel's own
 * credential rather than a local cert.
 *
 * Why a fixed hostname at all: `tunnel:quick` works but mints a random
 * `*.trycloudflare.com` name per run, so a link goes dead the moment the server
 * restarts. And it has to be HTTPS — iOS Safari with HTTPS-Only refuses a plain
 * `http://192.168.x.x`, which is the wall this started at.
 *
 * Run once. Re-running is safe and changes nothing that already matches.
 */

const API = "https://api.cloudflare.com/client/v4"

const env = (name: string): string => {
  const v = process.env[name]
  if (!v) throw new Error(`${name} is not set — mise [env] should provide it`)
  return v
}

/** The account token, from the environment or from fnox. Never printed. */
async function accountToken(): Promise<string> {
  if (process.env.CLOUDFLARE_API_TOKEN) return process.env.CLOUDFLARE_API_TOKEN
  const p = Bun.spawn(["fnox", "get", "CLOUDFLARE_API_TOKEN"], { stdout: "pipe", stderr: "ignore" })
  const out = (await new Response(p.stdout).text()).trim()
  if (!out) {
    throw new Error(
      "No CLOUDFLARE_API_TOKEN. Set it in the environment, or:\n" +
        "  mise exec -- fnox set --global -p keychain CLOUDFLARE_API_TOKEN",
    )
  }
  return out
}

async function cf<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  })
  const body = (await res.json()) as { success: boolean; result: T; errors?: { message: string }[] }
  if (!body.success) {
    const why = body.errors?.map((e) => e.message).join("; ") ?? res.statusText
    throw new Error(`${init?.method ?? "GET"} ${path} — ${why}`)
  }
  return body.result
}

const account = env("CLOUDFLARE_ACCOUNT_ID")
const name = env("TUNNEL_NAME")
const hostname = env("TUNNEL_HOSTNAME")
const zoneName = env("TUNNEL_ZONE")
const service = env("DEV_URL")
const token = await accountToken()

// ── The tunnel ───────────────────────────────────────────────────────────────

type Tunnel = { id: string; name: string }
const existing = await cf<Tunnel[]>(
  token,
  `/accounts/${account}/cfd_tunnel?name=${encodeURIComponent(name)}&is_deleted=false`,
)

let id: string
if (existing.length) {
  id = existing[0]!.id
  console.log(`tunnel-setup: '${name}' already exists`)
} else {
  // `config_src: cloudflare` is what makes it remotely managed — the ingress
  // below lives on Cloudflare's side rather than in a local config file, so
  // nothing about this setup has to exist on the machine that runs it.
  const made = await cf<Tunnel>(token, `/accounts/${account}/cfd_tunnel`, {
    method: "POST",
    body: JSON.stringify({ name, config_src: "cloudflare" }),
  })
  id = made.id
  console.log(`tunnel-setup: created '${name}'`)
}

// ── Its ingress ──────────────────────────────────────────────────────────────

// The catch-all 404 is required: a tunnel with no terminating rule is rejected.
await cf(token, `/accounts/${account}/cfd_tunnel/${id}/configurations`, {
  method: "PUT",
  body: JSON.stringify({
    config: { ingress: [{ hostname, service }, { service: "http_status:404" }] },
  }),
})
console.log(`tunnel-setup: ${hostname} -> ${service}`)

// ── The DNS record ───────────────────────────────────────────────────────────

type Zone = { id: string }
type Record = { id: string; content: string }

const [zone] = await cf<Zone[]>(token, `/zones?name=${encodeURIComponent(zoneName)}`)
if (!zone) throw new Error(`No zone '${zoneName}' on this account`)

const found = await cf<Record[]>(
  token,
  `/zones/${zone.id}/dns_records?name=${encodeURIComponent(hostname)}`,
)
// `proxied: true` is what gives it a certificate. Without it the hostname
// resolves but serves plain http, which is the thing this exists to avoid.
const record = { type: "CNAME", name: hostname, content: `${id}.cfargotunnel.com`, proxied: true }

if (!found.length) {
  await cf(token, `/zones/${zone.id}/dns_records`, { method: "POST", body: JSON.stringify(record) })
  console.log(`tunnel-setup: created DNS ${hostname}`)
} else if (found[0]!.content === record.content) {
  console.log(`tunnel-setup: DNS ${hostname} already points here`)
} else {
  await cf(token, `/zones/${zone.id}/dns_records/${found[0]!.id}`, {
    method: "PUT",
    body: JSON.stringify(record),
  })
  console.log(`tunnel-setup: repointed DNS ${hostname}`)
}

// ── The run token ────────────────────────────────────────────────────────────

/**
 * `cloudflared tunnel run` needs the tunnel's own credential, which is not the
 * account token. It goes into the keychain via fnox rather than a file, because
 * anyone holding it can serve traffic on this hostname.
 */
const runToken = await cf<string>(token, `/accounts/${account}/cfd_tunnel/${id}/token`)
const set = Bun.spawn(["fnox", "set", "--global", "-p", "keychain", "TUNNEL_RUN_TOKEN"], {
  stdin: new TextEncoder().encode(runToken),
  stdout: "ignore",
  stderr: "pipe",
})
if ((await set.exited) !== 0) {
  console.error(
    "tunnel-setup: could not store the run token in fnox.\n" +
      "  Store it yourself, then `mise run dev` will pick it up:\n" +
      "  mise exec -- fnox set --global -p keychain TUNNEL_RUN_TOKEN",
  )
  process.exit(1)
}

console.log(`\n  https://${hostname}\n  A fixed URL. 'mise run dev' brings it up with the server.\n`)

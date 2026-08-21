/**
 * Query the Cloudflare audit log for delete actions on this account.
 *
 * Answers "who removed the original worker / D1 / R2" — the one question the
 * ADR 006 postscript could not close. Everything else about that incident was
 * established from local evidence; only the actor needs Cloudflare's own record.
 *
 * Requires CLOUDFLARE_API_TOKEN. The wrangler OAuth token cannot be used: its
 * scope list has no audit entry at all (`wrangler login --scopes-list`), so
 * re-authenticating wrangler — even interactively — can never grant this.
 *
 * Env:
 *   CLOUDFLARE_API_TOKEN — token with Account Settings: Read (or Audit Logs Read)
 *   CF_ACCOUNT_ID        — optional; resolved from wrangler config when absent
 *   SINCE / BEFORE       — optional ISO dates bounding the search
 */

const TOKEN = process.env.CLOUDFLARE_API_TOKEN

if (!TOKEN) {
  console.error(
    `cf-audit: CLOUDFLARE_API_TOKEN is not set.

The wrangler OAuth token cannot be reused — its scopes contain no audit
permission, so this needs a token created in the dashboard:

  1. https://dash.cloudflare.com/profile/api-tokens -> Create Token
  2. Custom token, permission: Account | Account Settings | Read
     (include "Audit Logs | Read" if your account offers it separately)
  3. Account Resources: include the account you want to inspect

Then:

  CLOUDFLARE_API_TOKEN=... mise run cf:audit

The token is read from the environment and never written to disk.`,
  )
  process.exit(1)
}

const ACCOUNT_ID = process.env.CF_ACCOUNT_ID ?? "7384af54e33b8a54ff240371ea368440"
const SINCE = process.env.SINCE ?? "2026-03-01T00:00:00Z"
const BEFORE = process.env.BEFORE ?? "2026-08-21T00:00:00Z"

type Entry = {
  when?: string
  action?: { type?: string; result?: boolean }
  actor?: { email?: string; type?: string; ip?: string }
  resource?: { type?: string; id?: string }
}

/**
 * v1 (`/audit_logs`) and v2 (`/logs/audit`) coexist and accounts differ in which
 * they answer, so try both rather than guessing.
 */
async function fetchPage(path: string, page: number): Promise<{ ok: boolean; entries: Entry[]; error?: string }> {
  const url =
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/${path}` +
    `?since=${SINCE}&before=${BEFORE}&per_page=1000&page=${page}`

  const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } })
  const body = (await res.json()) as {
    success?: boolean
    result?: Entry[]
    errors?: { message?: string }[]
  }

  if (!body.success) {
    return { ok: false, entries: [], error: body.errors?.map((e) => e.message).join("; ") ?? `HTTP ${res.status}` }
  }
  return { ok: true, entries: body.result ?? [] }
}

async function collect(path: string): Promise<Entry[] | null> {
  const all: Entry[] = []
  for (let page = 1; page <= 20; page++) {
    const { ok, entries, error } = await fetchPage(path, page)
    if (!ok) {
      console.error(`cf-audit: ${path} unavailable — ${error}`)
      return null
    }
    all.push(...entries)
    if (entries.length === 0) break
  }
  return all
}

const entries = (await collect("audit_logs")) ?? (await collect("logs/audit"))

if (!entries) {
  console.error(
    "cf-audit: no audit endpoint accepted this token. Check it carries Account Settings: Read for this account.",
  )
  process.exit(1)
}

console.log(`cf-audit: ${entries.length} entries between ${SINCE} and ${BEFORE}`)

// Deletions are the point, but print anything touching the project by name too —
// a rename or transfer would explain the disappearance just as well.
const interesting = entries.filter((e) => {
  const action = e.action?.type?.toLowerCase() ?? ""
  const resource = `${e.resource?.type ?? ""} ${e.resource?.id ?? ""}`.toLowerCase()
  return action.includes("delete") || resource.includes("remy")
})

if (interesting.length === 0) {
  console.log("cf-audit: no delete actions in that window — widen it with SINCE / BEFORE.")
} else {
  console.log(`cf-audit: ${interesting.length} matching:\n`)
  for (const e of interesting) {
    console.log(
      [
        e.when ?? "?",
        e.action?.type ?? "?",
        e.resource?.type ?? "?",
        e.resource?.id ?? "",
        `by ${e.actor?.email ?? e.actor?.type ?? "?"}`,
        e.actor?.ip ? `from ${e.actor.ip}` : "",
      ]
        .filter(Boolean)
        .join("  "),
    )
  }
}

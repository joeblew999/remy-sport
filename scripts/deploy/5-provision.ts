/**
 * One provisioning path, for one named environment.
 *
 * ## What this replaces
 *
 * Provisioning was six entry points with three different idempotency stories:
 * `cf:secret:set` guarded by a substring `grep`, `push:secret:set` correct,
 * `moq:relay:set` and `demo:on` with no guard at all, and `cf:d1:create` /
 * `cf:r2:create` duplicating the ensure path without the `database_id` write.
 * `cf:env:bootstrap` claimed to provision "all Cloudflare resources" and ran
 * three of them; two were called by nothing.
 *
 * The queues were the sharpest version of it: `wrangler.toml` declares a
 * producer and two consumers, and **nothing anywhere created them**.
 *
 * ## Why it is environment-aware rather than parameterised later
 *
 * The old path resolved names from `CF_D1_NAME` and `CF_R2_NAME`, mise `[env]`
 * literals pinned to production. Those cannot express three environments, and
 * the failure would not be an error — every task would quietly do the right
 * thing to the wrong account resource. So names come from **resolved wrangler
 * config** for a named target, the same mechanism `check-envs.ts` uses, and
 * there is no default: a run that cannot identify its target refuses.
 *
 * Never defaulting to production is the same rule as everywhere else in this
 * codebase, pointed the other way. `environmentOf()` resolves the unknown to
 * production because the risk there is an *opened door*. Here the risk is a
 * *write*, and the strictest answer for a write is to not perform it.
 */

import { DEMO_SIGN_IN_CODE, POLICY, type Environment } from "../../src/environment"
import { DEFAULT_SUBJECT, PRIVATE_KEY, PUBLIC_KEY, generateVapid } from "../ops/keys"
import {
  DEPLOYABLE,
  Refused,
  type Target,
  patchDatabaseId,
  resolveTarget,
  resolvedConfig,
  unreachable,
  wrangler,
} from "../cloudflare"
import { DEFAULT_BULK_FROM, DEFAULT_FROM } from "../../src/mail/mailer"

// The target, the credential, the account, how wrangler is run and what its
// errors mean all live in ./cloudflare now. They were defined here, which is
// why only this file could tell "could not ask" from "absent" — see
// docs/dev/cloudflare-module.md.
export { DEPLOYABLE, Refused, resolveTarget, type Target }

// ── Steps ────────────────────────────────────────────────────────────────────

/**
 * What one resource needs, decided before anything is done about it.
 *
 * Deciding and acting are separate so `cf:env:plan` and `cf:env:bootstrap` run
 * the *same* code and differ only in whether `apply` is called. A plan produced
 * by a second implementation is a plan that can disagree with the thing it
 * describes, which is worse than having no plan at all.
 */
export type Outcome = "exists" | "would-create" | "would-set" | "skip" | "refuse" | "unknown"

export interface Step {
  resource: string
  outcome: Outcome
  detail: string
  /** Performed only in apply mode, and only when the outcome calls for it. */
  apply?: () => void
}

const EXPECTED: Record<Outcome, string> = {
  exists: "✓ exists",
  "would-create": "+ create",
  "would-set": "+ set",
  skip: "· skip",
  refuse: "✗ REFUSE",
  unknown: "? unknown",
}

// ── D1 ───────────────────────────────────────────────────────────────────────

function planD1(target: Target, config: ReturnType<typeof resolvedConfig>): Step[] {
  const steps: Step[] = []
  const binding = config.d1_databases[0] as { database_name?: string; database_id?: string } | undefined
  if (!binding?.database_name) {
    return [
      {
        resource: "D1",
        outcome: "refuse",
        detail: `no d1_databases binding resolves for ${target.environment} — check wrangler.toml`,
      },
    ]
  }
  const name = binding.database_name
  const listing = listD1()
  if (!listing.ok) {
    // Names still come from config, so the plan says WHAT it would provision
    // even when it cannot say whether it already exists. That is most of the
    // value of a plan on a machine that is not logged in — and it stays a plan:
    // `blocking()` turns these two into a refusal in apply mode, so the run that
    // follows never acts on the half-answer this one is allowed to print.
    return [
      { resource: `D1 ${name}`, outcome: "unknown", detail: listing.why },
      { resource: `D1 migrations → ${name}`, outcome: "unknown", detail: "depends on the above" },
    ]
  }
  const found = listing.dbs.find((d) => d.name === name)

  if (found) {
    const idMatches = binding.database_id === found.uuid
    steps.push({
      resource: `D1 ${name}`,
      outcome: "exists",
      detail: idMatches
        ? `${found.uuid}, database_id already correct`
        : `${found.uuid} — wrangler.toml says ${binding.database_id}, would be corrected`,
      apply: idMatches
        ? undefined
        : () => {
            patchDatabaseId({
              configPath: "wrangler.toml",
              env: target.flag,
              databaseName: name,
              uuid: found.uuid,
            })
          },
    })
  } else {
    steps.push({
      resource: `D1 ${name}`,
      outcome: "would-create",
      detail: `then write its database_id into ${target.flag ? `[env.${target.flag}]` : "the top-level"} block`,
      apply: () => {
        const made = wrangler(["d1", "create", name])
        if (made.code !== 0 && !/already exists/.test(made.out + made.err)) {
          throw new Refused(`creating D1 "${name}" failed:\n${made.out}${made.err}`)
        }
        const after = listD1()
        const now = after.ok ? after.dbs.find((d) => d.name === name) : undefined
        if (!now) throw new Refused(`created D1 "${name}" but it did not appear in the listing`)
        patchDatabaseId({
          configPath: "wrangler.toml",
          env: target.flag,
          databaseName: name,
          uuid: now.uuid,
        })
      },
    })
  }

  steps.push({
    resource: `D1 migrations → ${name}`,
    outcome: found ? "would-set" : "would-set",
    detail: "wrangler applies only what is missing; a fully-migrated database is a no-op",
    apply: () => {
      const applied = wrangler(["d1", "migrations", "apply", name, "--remote"], target)
      if (applied.code !== 0) {
        throw new Refused(`applying migrations to "${name}" failed:\n${applied.out}${applied.err}`)
      }
    },
  })
  return steps
}

type Listing = { ok: true; dbs: Array<{ uuid: string; name: string }> } | { ok: false; why: string }

function listD1(): Listing {
  const listed = wrangler(["d1", "list", "--json"])
  if (listed.code !== 0) {
    return { ok: false, why: unreachable(listed) ?? `wrangler d1 list failed:\n${listed.err.trim()}` }
  }
  const start = listed.out.indexOf("[")
  if (start === -1) return { ok: false, why: `no JSON in 'wrangler d1 list --json'` }
  return { ok: true, dbs: JSON.parse(listed.out.slice(start)) as Array<{ uuid: string; name: string }> }
}

// ── R2 ───────────────────────────────────────────────────────────────────────

/**
 * Probed by `r2 bucket info`, not by scraping the listing.
 *
 * `wrangler r2 bucket list` has no `--json` and silently paginates at 20. This
 * account has 26 buckets and `remy-sport-storage` fell off page one, so a
 * listing-based check once reported an existing bucket as absent. Asking about
 * one bucket by name cannot be truncated.
 */
function planR2(target: Target, config: ReturnType<typeof resolvedConfig>): Step[] {
  const bucket = config.r2_buckets[0] as { bucket_name?: string } | undefined
  if (!bucket?.bucket_name) {
    return [{ resource: "R2", outcome: "refuse", detail: `no r2_buckets binding for ${target.environment}` }]
  }
  const name = bucket.bucket_name
  const info = wrangler(["r2", "bucket", "info", name])
  const why = info.code === 0 ? null : unreachable(info)
  if (why) return [{ resource: `R2 ${name}`, outcome: "unknown", detail: why }]
  const exists = info.code === 0

  return [
    {
      resource: `R2 ${name}`,
      outcome: exists ? "exists" : "would-create",
      detail: exists ? "already on the account" : "not found",
      apply: exists
        ? undefined
        : () => {
            const made = wrangler(["r2", "bucket", "create", name])
            if (made.code !== 0 && !/already exists, and you own it|10004/.test(made.out + made.err)) {
              throw new Refused(`creating R2 "${name}" failed:\n${made.out}${made.err}`)
            }
          },
    },
  ]
}

// ── Queues ───────────────────────────────────────────────────────────────────

/**
 * Every queue this environment references, producers and dead-letter included.
 *
 * The DLQ is the one that would have been missed by hand: it appears only as a
 * `dead_letter_queue` string inside a consumer, never as a queue of its own, so
 * a person reading the config for "queues to create" sees two names and needs
 * three. Nothing created any of them.
 */
export function queueNames(config: ReturnType<typeof resolvedConfig>): string[] {
  const queues = config.queues as {
    producers?: Array<{ queue: string }>
    consumers?: Array<{ queue: string; dead_letter_queue?: string }>
  }
  const names = new Set<string>()
  for (const p of queues.producers ?? []) names.add(p.queue)
  for (const c of queues.consumers ?? []) {
    names.add(c.queue)
    if (c.dead_letter_queue) names.add(c.dead_letter_queue)
  }
  return [...names].sort()
}

function planQueues(target: Target, config: ReturnType<typeof resolvedConfig>): Step[] {
  return queueNames(config).map((name) => {
    const info = wrangler(["queues", "info", name])
    const why = info.code === 0 ? null : unreachable(info)
    if (why) return { resource: `Queue ${name}`, outcome: "unknown" as const, detail: why }
    const exists = info.code === 0
    return {
      resource: `Queue ${name}`,
      outcome: exists ? ("exists" as const) : ("would-create" as const),
      detail: exists ? "already on the account" : "not found",
      apply: exists
        ? undefined
        : () => {
            const made = wrangler(["queues", "create", name])
            if (made.code !== 0 && !/already exists/i.test(made.out + made.err)) {
              throw new Refused(`creating queue "${name}" failed:\n${made.out}${made.err}`)
            }
          },
    }
  })
}

// ── Secrets ──────────────────────────────────────────────────────────────────

/**
 * A group of secrets that are only meaningful together.
 *
 * The three-outcome decision from `push-secrets.ts`, generalised — because the
 * bug it was written for is not about VAPID. `cf:secret:set` had the same shape
 * of bug in a worse form: `grep -q BETTER_AUTH_SECRET` over the whole listing,
 * so an unrelated `OLD_BETTER_AUTH_SECRET_BACKUP` satisfied it and the task
 * skipped, leaving the worker with no usable secret. Exact names, and
 * all-or-nothing membership, remove both.
 */
export interface SecretGroup {
  label: string
  /** All-or-nothing. Some present and some absent is a refusal, never a rewrite. */
  pair: string[]
  /** Filled in independently when absent; never a reason to refuse. */
  extras?: string[]
  /** Values for the whole group, or why it cannot supply them. */
  supply: () => Promise<Record<string, string> | { unavailable: string }>
  appliesTo: (env: Environment) => boolean
  /** Appended to a refusal, where a half-group has consequences worth stating. */
  refusalNote?: string
}

/**
 * Three outcomes, and no fourth.
 *
 * "Cannot supply a value" is deliberately not one of them — that is a property
 * of the group (MoQ's token comes from a dashboard and cannot be generated),
 * not of what the deployment currently holds. Keeping the two apart is what
 * lets this function be decided purely from a set of names and tested against
 * synthetic listings, which is the only way to exercise the half-pair branch
 * without rotating a real key to find out.
 */
export type SecretDecision =
  | { action: "keep" }
  | { action: "set"; which: string[] }
  | { action: "refuse"; have: string[]; missing: string[] }

/**
 * The one decision, shared by every secret this project sets.
 *
 * Exact-name membership, so no secret's name can be a substring of another's
 * and satisfy the check. All-or-nothing on `pair`, so a half-written group is
 * never completed by generating a fresh one — for VAPID that would rotate a
 * public key every subscribed browser has pinned, and for BETTER_AUTH_SECRET it
 * would invalidate every session.
 */
export function decideSecrets(present: ReadonlySet<string>, group: SecretGroup): SecretDecision {
  const have = group.pair.filter((n) => present.has(n))
  const missing = group.pair.filter((n) => !present.has(n))
  const extrasMissing = (group.extras ?? []).filter((n) => !present.has(n))

  if (have.length && missing.length) return { action: "refuse", have, missing }
  if (!missing.length) {
    return extrasMissing.length ? { action: "set", which: extrasMissing } : { action: "keep" }
  }
  return { action: "set", which: [...missing, ...extrasMissing] }
}

/**
 * 32 random bytes, base64.
 *
 * Through WebCrypto rather than node:crypto because this file is typechecked
 * under the tests' tsconfig as well as the worker's, and `randomBytes().toString("base64")`
 * does not resolve under both. The bytes are the same either way.
 */
function randomSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes))
}

const GROUPS: SecretGroup[] = [
  {
    label: "BETTER_AUTH_SECRET",
    pair: ["BETTER_AUTH_SECRET"],
    // Generated, never asked for. Nothing outside the deployment needs to know
    // it, and a value nobody chose is one nobody can paste somewhere.
    supply: async () => ({
      BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? randomSecret(),
    }),
    appliesTo: () => true,
    refusalNote:
      "Replacing it invalidates every session on this deployment — everybody is signed out.",
  },
  {
    label: "VAPID (Web Push)",
    pair: [PUBLIC_KEY, PRIVATE_KEY],
    // The subject carries no cryptographic relationship to the pair — it is the
    // contact address a push service complains to — so it is filled in on its
    // own and never participates in deciding anything about the keys.
    extras: ["VAPID_SUBJECT"],
    supply: async () => {
      const { publicKey, privateKey } = await generateVapid()
      return {
        VAPID_SUBJECT: process.env.VAPID_SUBJECT ?? DEFAULT_SUBJECT,
        [PUBLIC_KEY]: publicKey,
        [PRIVATE_KEY]: privateKey,
      }
    },
    appliesTo: () => true,
    refusalNote:
      "A half-pair means Web Push is ALREADY off (vapidFrom needs all three) and every\n" +
      "      existing subscription is dormant, not dead — restore the missing half and the\n" +
      "      same public key is served again. Generating a fresh pair kills them all: the\n" +
      "      browsers pinned the old key and cannot be told.\n" +
      "      PUSH_SKIP=1 proceeds and touches nothing. PUSH_ROTATE=1 rotates and accepts that.",
  },
  {
    label: "MoQ relay (live video)",
    pair: ["MOQ_RELAY_URL", "MOQ_RELAY_TOKEN"],
    extras: ["MOQ_RELAY_TOKEN_SUBSCRIBE"],
    // Cannot be generated: the token is issued by the dashboard and shown once.
    // So an absent token is a skip, not a failure — video is a feature this
    // deployment can be without, unlike a session secret.
    supply: async (): Promise<Record<string, string> | { unavailable: string }> =>
      process.env.MOQ_RELAY_TOKEN
        ? {
            MOQ_RELAY_URL:
              process.env.MOQ_RELAY_URL ?? "https://draft-16.cloudflare.mediaoverquic.com",
            MOQ_RELAY_TOKEN: process.env.MOQ_RELAY_TOKEN,
            ...(process.env.MOQ_RELAY_TOKEN_SUBSCRIBE
              ? { MOQ_RELAY_TOKEN_SUBSCRIBE: process.env.MOQ_RELAY_TOKEN_SUBSCRIBE }
              : {}),
          }
        : {
            unavailable:
              "no MOQ_RELAY_TOKEN in the environment. Live video stays off; /api/moq/config\n" +
              "      answers nothing and the broadcast page says so. Create a relay at\n" +
              "      Media > Realtime > MoQ Relay (the token is shown once) and re-run with\n" +
              "      MOQ_RELAY_TOKEN=… to switch it on.",
          },
    appliesTo: () => true,
  },
  {
    label: "TEST_OTP (seeded sign-in)",
    pair: ["TEST_OTP"],
    supply: async () => ({ TEST_OTP: DEMO_SIGN_IN_CODE }),
    /**
     * Derived where the policy says so, and a human decision where it does not.
     *
     * `signInCode` is the row: dev and staging derive the code, because every
     * seeded address there is `.test` and reaches nobody. Production is
     * `"secret"` precisely so a person decides *when* seeded sign-in is on, and
     * `mise run demo:off` can take it away without a redeploy.
     */
    appliesTo: (env) => POLICY[env].signInCode === "derived",
  },
]

/** The secret names on this environment's Worker, exactly — or why we cannot tell. */
function currentSecrets(target: Target): Set<string> | { undeployed: true } | { error: string } {
  const listed = wrangler(["secret", "list", "--format", "json"], target)
  if (listed.code !== 0) {
    const text = listed.out + listed.err
    /**
     * "Not deployed yet" is a specific answer, not any failure.
     *
     * The old bash read `if ! SECRETS=$(...)` — so an auth failure, a network
     * blip or an API 500 all meant "worker not deployed, skipping", and the
     * deploy carried on without a secret. Two independent routes to the same
     * silent breakage, and this is the second one.
     */
    const why = unreachable(listed)
    if (why) return { error: why }
    if (/workers\.api\.error\.script_not_found|10007|not found/i.test(text)) {
      return { undeployed: true }
    }
    return { error: text.trim() }
  }
  try {
    return new Set((JSON.parse(listed.out) as Array<{ name: string }>).map((s) => s.name))
  } catch {
    return { error: `could not parse 'wrangler secret list' output:\n${listed.out}` }
  }
}

async function planSecrets(target: Target): Promise<Step[]> {
  const present = currentSecrets(target)

  if ("error" in present) {
    return [
      {
        resource: "Secrets",
        outcome: "refuse",
        detail:
          `could not read the secret list for ${target.environment}, and this is NOT treated as\n` +
          `      "not deployed yet" — that guess is how a deploy once shipped with no secret.\n` +
          `      ${present.error.split("\n")[0]}`,
      },
    ]
  }

  const applicable = GROUPS.filter((g) => g.appliesTo(target.environment))

  if ("undeployed" in present) {
    return [
      {
        resource: "Secrets",
        outcome: "skip",
        detail:
          `the Worker does not exist yet, so there is nothing to set secrets on.\n` +
          `      Bootstrap runs again after the first deploy and sets: ` +
          applicable.map((g) => g.label).join(", "),
      },
    ]
  }

  const steps: Step[] = []
  for (const group of applicable) {
    const decision = decideSecrets(present, group)

    if (decision.action === "keep") {
      steps.push({ resource: group.label, outcome: "exists", detail: "already set, no change" })
      continue
    }

    if (decision.action === "refuse") {
      const rotate = group.label.startsWith("VAPID") && process.env.PUSH_ROTATE === "1"
      const skip = group.label.startsWith("VAPID") && process.env.PUSH_SKIP === "1"
      if (skip) {
        steps.push({
          resource: group.label,
          outcome: "skip",
          detail: `PUSH_SKIP=1 — has ${decision.have.join(", ")} and not ${decision.missing.join(", ")}. Nothing changed, and it stays recoverable.`,
        })
        continue
      }
      if (!rotate) {
        steps.push({
          resource: group.label,
          outcome: "refuse",
          detail:
            `has ${decision.have.join(", ")} but not ${decision.missing.join(", ")}.\n` +
            `      Refusing rather than completing the group: a fresh value here is not a fix.\n` +
            (group.refusalNote ? `      ${group.refusalNote}` : ""),
        })
        continue
      }
      const rotated = await group.supply()
      if ("unavailable" in rotated) {
        steps.push({ resource: group.label, outcome: "skip", detail: rotated.unavailable })
        continue
      }
      steps.push({
        resource: group.label,
        outcome: "would-set",
        detail: "PUSH_ROTATE=1 — rotating, and every existing subscription dies",
        apply: () => setGroup(target, rotated),
      })
      continue
    }

    const supplied = await group.supply()
    if ("unavailable" in supplied) {
      steps.push({ resource: group.label, outcome: "skip", detail: supplied.unavailable })
      continue
    }
    steps.push({
      resource: group.label,
      outcome: "would-set",
      detail: `would set ${decision.which.join(", ")}`,
      // The values are captured HERE, not regenerated inside apply(). Calling
      // supply() a second time would produce a *different* VAPID keypair from
      // the one the plan described — the plan and the apply must be the same
      // secret, or the plan is fiction.
      apply: () => setGroup(target, supplied, decision.which),
    })
  }
  return steps
}

function setGroup(target: Target, values: Record<string, string>, only?: string[]): void {
  for (const [name, value] of Object.entries(values)) {
    if (only && !only.includes(name)) continue
    const put = wrangler(["secret", "put", name], target, { stdin: value })
    if (put.code !== 0) throw new Refused(`could not set ${name}:\n${put.out}${put.err}`)
  }
}

// ── What cannot be automated ─────────────────────────────────────────────────

/**
 * The manual remainder, printed at the end of every run.
 *
 * Deliberately short and deliberately not a to-do list of everything: it names
 * only what this script cannot do at all, so that "the printout is empty"
 * eventually means something. Each line says which check verifies it, because
 * an instruction with no way to confirm it worked is how the sending domain
 * went unnoticed in the first place.
 */
/**
 * Which zones have Email Sending enabled, from the account.
 *
 * `wrangler email sending list` exists, so this is checked rather than
 * asserted. The first version of this printout told you to onboard
 * `remy.ubuntusoftware.net` — a domain that is not in the list and from which
 * production nonetheless sends successfully, with `dkim=pass`. Enablement is
 * per **zone**: `ubuntusoftware.net` is enabled (through
 * `mail.ubuntusoftware.net`) and every subdomain of it signs with the zone key.
 *
 * That is also why the bulk/transactional split does not buy separate DKIM
 * reputation today, whatever docs/dev/email-deliverability.md claims — worth
 * knowing before relying on it.
 */
function enabledZones(): Set<string> | null {
  const listed = wrangler(["email", "sending", "list"])
  if (listed.code !== 0) return null
  const zones = new Set<string>()
  for (const line of listed.out.split("\n")) {
    const cells = line.split("│").map((c) => c.replace(/\u001b\[[0-9;]*m/g, "").trim())
    if (cells.length >= 5 && cells[3] === "yes" && cells[1] && cells[1] !== "zone") {
      zones.add(cells[1])
    }
  }
  return zones
}

function manualSteps(target: Target, config: ReturnType<typeof resolvedConfig>): string[] {
  const vars = config.vars as Record<string, string | undefined>
  // Both senders, including the one no [vars] block mentions: senderFor() falls
  // back to a constant when NOTIFY_EMAIL_FROM is unset, so reading only the
  // config misses the bulk domain entirely — the one most likely to be missing.
  const senders = [
    { kind: "transactional (sign-in)", address: vars.EMAIL_FROM ?? DEFAULT_FROM },
    { kind: "bulk (notifications)", address: vars.NOTIFY_EMAIL_FROM ?? DEFAULT_BULK_FROM },
  ]
  const zones = enabledZones()
  const steps: string[] = []
  const seen = new Set<string>()

  for (const { kind, address } of senders) {
    const domain = address.split("@")[1]!
    if (seen.has(domain)) continue
    seen.add(domain)
    if (zones === null) {
      steps.push(
        `Email Sending for "${domain}" (${kind}) — could not check.\n` +
          `      Run \`bun x wrangler email sending list\` once logged in.`,
      )
      continue
    }
    const zone = [...zones].find((z) => domain === z || domain.endsWith(`.${z}`))
    if (!zone) {
      steps.push(
        `Email Sending: enable a zone covering "${domain}" — ${kind}, as ${address}.\n` +
          `      \`bun x wrangler email sending enable <zone>\`, or the dashboard at\n` +
          `      Email > Email Service > Sending domains. Until then mail from this\n` +
          `      address is REJECTED AT SEND.`,
      )
    }
  }
  if (!steps.length && zones !== null) {
    steps.push(
      `Nothing. Both sending domains for ${target.environment} sit under an enabled zone\n` +
        `      (${[...zones].join(", ")}), which is how production already sends with dkim=pass.`,
    )
  }
  return steps
}

// ── Entry ────────────────────────────────────────────────────────────────────

/**
 * What stops an apply — and "I could not ask" stops one exactly as surely as
 * "I will not".
 *
 * A refusal is a decision this script reached; an unknown is a decision it was
 * unable to reach. Apply mode asks one question — is it safe to write? — and
 * both are the same answer to it. Anything softer for `unknown` is how a run
 * skips a step it could not see, which is what happened on 2026-09-01: the D1
 * API answered "Authentication error [code: 10000]" while every other product
 * answered normally, so both D1 steps planned as `unknown`, carried no `apply`,
 * and passed a gate that looked only for `refuse`. Bootstrap created the two
 * queues, silently skipped the database and five pending migrations, and exited
 * 0 — which would have left `deploy` publishing a Worker whose code expected
 * tables that were never made, over a production that was serving fine.
 *
 * `planSecrets` already had this right: an unreadable secret list refuses
 * outright rather than guessing "not deployed yet", for the same reason and
 * after the same kind of incident. This puts D1, R2 and the queues — the three
 * that report `unknown` — on that footing too.
 */
export function blocking(steps: readonly Step[]): Step[] {
  return steps.filter((s) => s.outcome === "refuse" || s.outcome === "unknown")
}

/**
 * Why the run stopped, naming each step rather than pointing at the table.
 *
 * The unknowns get the longer half deliberately: a refusal is self-explaining,
 * whereas an unknown looks like something you can shrug past until it is spelled
 * out that both available guesses write the wrong thing.
 */
export function refusalMessage(blocked: readonly Step[]): string {
  const refused = blocked.filter((s) => s.outcome === "refuse")
  const unknown = blocked.filter((s) => s.outcome === "unknown")
  const lines = ["refusing to provision. Nothing was changed."]

  if (refused.length) {
    lines.push("", "  Refused:", ...refused.map((s) => `    ${s.resource} — ${s.detail}`))
  }
  if (unknown.length) {
    lines.push(
      "",
      `  Could not determine (${unknown.length}):`,
      ...unknown.map((s) => `    ${s.resource} — ${s.detail}`),
      "",
      `  Not knowing is not the same as "absent". Creating what already exists and`,
      "  skipping what is actually missing are both wrong, and both report success —",
      "  so this run does neither. Restore access, then plan again.",
    )
  }
  return lines.join("\n")
}

export async function run(argv: string[], mode: "plan" | "apply"): Promise<void> {
  const target = resolveTarget(argv)
  const config = resolvedConfig(target.flag)

  console.log(
    `\n${mode === "plan" ? "cf:env:plan" : "cf:env:bootstrap"} — ${target.environment}` +
      ` (worker "${config.name}")\n`,
  )
  if (mode === "plan") {
    console.log("  Nothing below is performed. This run changes nothing.\n")
  }

  const steps = [
    ...planD1(target, config),
    ...planR2(target, config),
    ...planQueues(target, config),
    ...(await planSecrets(target)),
  ]

  const width = Math.max(...steps.map((s) => s.resource.length))
  for (const step of steps) {
    console.log(`  ${EXPECTED[step.outcome].padEnd(10)} ${step.resource.padEnd(width)}  ${step.detail}`)
  }

  // Counted the same way in both modes, because a plan that described a
  // smaller set of blockers than the apply it precedes would be exactly the
  // second implementation this file exists to avoid.
  const blocked = blocking(steps)
  if (blocked.length) {
    const unknown = blocked.filter((s) => s.outcome === "unknown").length
    const refusals = blocked.length - unknown
    const parts = [
      refusals ? `${refusals} refusal(s)` : "",
      unknown ? `${unknown} unanswered` : "",
    ].filter(Boolean)
    console.log(
      `\n  ${parts.join(" and ")}. ` +
        (mode === "plan" ? "Bootstrap would stop here." : "Nothing further was attempted."),
    )
  }

  if (mode === "apply") {
    // Plan reports and exits 0; only apply refuses. Reading is safe when the
    // account cannot be reached — writing is what is not.
    if (blocked.length) throw new Refused(refusalMessage(blocked))
    console.log("")
    for (const step of steps) {
      if (step.apply) {
        console.log(`  → ${step.resource}`)
        step.apply()
      }
    }
  }

  const manual = manualSteps(target, config)
  if (manual.length) {
    console.log(`\n  Still manual — this script cannot do these:\n`)
    for (const line of manual) console.log(`    • ${line}\n`)
  }
}

if (import.meta.main) {
  const mode = process.argv.includes("--apply") ? "apply" : "plan"
  try {
    await run(process.argv.slice(2), mode)
  } catch (err) {
    if (err instanceof Refused) {
      console.error(`\ncf-provision: ${(err as Error).message}\n`)
      process.exit(1)
    }
    throw err
  }
}

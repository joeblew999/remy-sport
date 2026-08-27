/**
 * Is seeded sign-in on, and who does it let in?
 *
 * Asks the deployment, not the config. What is *set* and what is *serving* are
 * different questions — a secret can be set on a Worker that has not been
 * deployed since, and a deploy can carry a change nobody meant — and only the
 * second question matters to someone deciding whether to worry.
 *
 * `mise run demo:on` / `mise run demo:off` change it.
 */

const BASE = process.env.CF_DEPLOY_URL ?? "https://remy.ubuntusoftware.net"

const res = await fetch(`${BASE}/api/dev/accounts`)

if (res.status === 404) {
  console.log(`demo: OFF at ${BASE}`)
  console.log(`      The fixtures' addresses are .test, so there is no way to sign in as them.`)
  process.exit(0)
}

if (!res.ok) {
  console.error(`demo: could not tell — ${BASE}/api/dev/accounts answered ${res.status}`)
  process.exit(1)
}

const { accounts = [], code } = (await res.json()) as {
  accounts?: { name: string; role: string; holds: string[] }[]
  code?: string
}

console.log(`demo: ON at ${BASE}`)
console.log(`      code ${code ?? "(none published — nobody can actually sign in)"}`)
console.log(`      ${accounts.length} accounts offered:\n`)
for (const a of accounts) {
  console.log(`        ${a.name.padEnd(24)} ${a.role.padEnd(10)} ${a.holds.join(" · ")}`)
}

/**
 * The invariant, restated here so it is visible to whoever ran this rather than
 * only to whoever reads cf:smoke. The seeded admin holds ban, set-role and
 * impersonate, and impersonation is the one power that reaches a real person.
 */
const admin = accounts.find((a) => a.role === "admin")
console.log(
  admin
    ? `\n      ⚠  THE ADMIN IS BEING OFFERED. That account can impersonate a real\n` +
        `         user. Run 'mise run demo:off' now and check src/auth.ts.`
    : `\n      The admin is not offered, and could not use the code if it were.\n` +
        `      Run 'mise run demo:off' before the platform has real users.`,
)

if (admin) process.exit(1)

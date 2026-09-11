/**
 * Every procedure declares how it is authorised, or the build fails.
 *
 * This exists because model-driven authorisation was opt-in, and opt-in
 * authorisation is not authorisation. `requireAction` was something a person
 * remembered; on 2026-08-28 all forty-seven procedures declared nothing that
 * could be inspected, and an entire feature — Web Push, including who receives
 * a notification — shipped with no authorisation at all. Nothing caught it,
 * because "deliberately public" and "somebody forgot" were the same thing to
 * every check in the repo.
 *
 * The router is walked for real, not parsed: these are the procedures the
 * Worker serves, so a procedure cannot be reachable and invisible here.
 *
 * What it enforces:
 *
 *   1. Every procedure carries exactly one policy.
 *   2. Every action named is an action the model actually defines.
 *   3. Anything served publicly is granted to PUBLIC *in the model* — so the
 *      day the PO closes something, this fails rather than keeping it open.
 *   4. The escape hatches stay countable, and are printed every run.
 */

import { GRANTS } from "../../src/domain/vocabularies"
import { policyOf, type Policy } from "../../src/api/base"
import { router } from "../../src/api/index"
import { rule } from "./helpers"

type Node = Record<string, unknown>

const found: { path: string; policy: Policy | null }[] = []

function walk(node: Node, path: string[]) {
  for (const [key, value] of Object.entries(node)) {
    const internals = (value as Record<string, Node> | null)?.["~orpc"]
    if (internals?.handler) {
      const middlewares = (internals.middlewares ?? []) as unknown[]
      const policies = middlewares.map(policyOf).filter((p): p is Policy => p !== null)
      found.push({ path: [...path, key].join("."), policy: policies[0] ?? null })
    } else if (value && typeof value === "object") {
      walk(value as Node, [...path, key])
    }
  }
}

walk(router as unknown as Node, [])

const problems: string[] = []
const escapes: string[] = []
const actions = new Set(Object.keys(GRANTS))

for (const { path, policy } of found) {
  if (!policy) {
    problems.push(
      `${path}: declares no policy. Add requireAction(...), openTo(...), ` +
        "checkedInHandler(...) or infrastructure(...) — see src/api/base.ts.",
    )
    continue
  }

  const named =
    policy.kind === "handler"
      ? policy.actions
      : policy.kind === "infrastructure"
        ? []
        : [policy.action]

  for (const action of named) {
    if (!actions.has(action)) {
      problems.push(`${path}: names "${action}", which the model does not define.`)
    }
  }

  if (policy.kind === "open") {
    // Re-checked here as well as at load: openTo throws on a bad action, but
    // only when that module is imported, and a rarely-loaded route would find
    // out in production.
    const grants = (GRANTS as Record<string, ReadonlyArray<{ relation: string }>>)[policy.action]
    if (!grants?.some((g) => g.relation === "PUBLIC")) {
      problems.push(
        `${path}: served publicly as "${policy.action}", but the model no longer grants ` +
          "that to PUBLIC. Either the model changed or this should be authed.",
      )
    }
    escapes.push(`  open            ${path}  (${policy.action})`)
  }
  if (policy.kind === "infrastructure") escapes.push(`  infrastructure  ${path}  — ${policy.why}`)
  if (policy.kind === "stricter") {
    escapes.push(`  stricter        ${path}  (${policy.action}) — ${policy.why}`)
  }
  if (policy.kind === "handler") {
    escapes.push(`  handler-checked ${path}  (${policy.actions.join(", ")})`)
  }
}

const enforced = found.filter((f) => f.policy?.kind === "action").length

/**
 * The second rule this file used to carry is gone, and its subject with it.
 *
 * It read Hono's own route table off the exported app and asserted it against
 * a hand-written list, so that a route mounted outside the router could not
 * appear without a sentence saying how it was guarded. Deleting Hono deletes
 * `app.routes` — the rule would have iterated an empty set and passed, which
 * is the failure it existed to prevent, turned on itself.
 *
 * Its replacement is tests/repo/dispatch.test.ts, asserting against the
 * `DISPATCH` array, which cannot become empty. This was removed only once that
 * was green.
 */
rule(
  "every procedure declares how it is authorised",
  problems,
  `check-authz: ${problems.length} of ${found.length} procedures are a problem\n\n` +
    problems.map((p) => `  ${p}`).join("\n") +
    "\n\nAuthorisation is the model's answer and every procedure must say which. " +
    "A procedure that declares nothing is not public — it is unreviewed.",
  `check-authz: ${found.length} procedures, ${enforced} enforced by the model, ` +
    `${escapes.length} declared otherwise` +
    escapes
      .sort()
      .map((line) => `\n${line}`)
      .join(""),
)

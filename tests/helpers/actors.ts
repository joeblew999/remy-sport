/**
 * Who a render test is signed in as, from the PO's own seeded people.
 *
 * What a page shows depends on who is looking — that is the whole point of the
 * grant model, and it is why every spec needs to establish an identity before
 * asserting anything. Ten render specs did it by pasting a session object
 * inline, each inventing its own user id and role, none of them corresponding
 * to anybody the seed actually contains. A test asserting what a COACH sees was
 * using a made-up coach.
 *
 * These come from `SEED_ENTITIES.users`, the same list the worker and e2e tiers
 * use through `actorFor()`. So "as a coach" means the same person in all three
 * tiers, and a change to the model's people reaches the render tier instead of
 * being quietly contradicted by a literal.
 *
 * ## Signed out is a value, not an absence
 *
 * `useSession` reports `loading: q.isPending`, so an *unseeded* session query on
 * a tier with no backend stays pending through its retries — and a page gated
 * on the session renders only its loading branch, forever as far as a test is
 * concerned. `asVisitor` seeds the resolved-and-empty answer a signed-out
 * visitor really gets (200 with a null body — see `fetchSession`).
 */
import type { Page } from "@playwright/test"
import { SEED_ENTITIES } from "../../src/domain/model/entities"
import { sessionKey } from "../../src/web/lib/session"
import { seedCache } from "./seed-cache"

/** The role codes the seed actually contains, so a typo is a compile error. */
export type Role = "ADMIN" | "ORGANIZER" | "COACH" | "PLAYER" | "REFEREE" | "SPECTATOR"

/**
 * Read off the model rather than restated.
 *
 * `SEED_ENTITIES.users` is a readonly tuple of literals, so its element type IS
 * the shape — declaring a parallel interface here would be a second definition
 * to drift, which is the thing src/domain exists to prevent. A person's display
 * name is the locale-keyed `names` column, the same as every other named row in
 * this product (see src/domain/names.ts on why there is no nameTh field).
 */
type SeededUser = (typeof SEED_ENTITIES.users)[number]

function seeded(role: Role): SeededUser {
  const found = SEED_ENTITIES.users.find((u) => u.roleCode === role)
  if (!found) {
    // Loud, because the alternative is a test that silently asserts what
    // `undefined` can see.
    throw new Error(
      `no seeded user with roleCode ${role} — the model's people changed and this test's premise with them`,
    )
  }
  return found
}

/** The session entry for one seeded person, as the cache holds it. */
export function sessionFor(role: Role) {
  const u = seeded(role)
  return {
    queryKey: sessionKey as unknown as readonly unknown[],
    data: {
      user: { id: u.id, email: u.email, name: u.names?.en ?? u.email, role: u.roleCode.toLowerCase() },
      session: { activeOrganizationId: null, impersonatedBy: null },
    },
  }
}

/** Nobody signed in — resolved, not merely absent. See the note above. */
export const VISITOR = { queryKey: sessionKey as unknown as readonly unknown[], data: null }

/**
 * Seed an identity, plus anything else this spec needs in the cache.
 *
 * One call, so a spec cannot half-establish who it is — which is how a test
 * ends up asserting a signed-out view while believing it tested a coach.
 */
export async function as(
  page: Page,
  role: Role,
  ...also: Parameters<typeof seedCache>[1]
): Promise<void> {
  await seedCache(page, [sessionFor(role), ...also])
}

/** The same, for nobody. */
export async function asVisitor(
  page: Page,
  ...also: Parameters<typeof seedCache>[1]
): Promise<void> {
  await seedCache(page, [VISITOR, ...also])
}

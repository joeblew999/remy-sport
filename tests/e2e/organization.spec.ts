import { test, expect } from "@playwright/test"
import { signInViaPage, deleteOrgViaPage, ORGANIZER } from "../helpers/auth"

/**
 * Organizations, wired access control and database hooks (ADR 007).
 *
 * These go through `page.evaluate(fetch)` rather than the `request` fixture on
 * purpose. Better Auth runs its origin check on any cookie-bearing request, and
 * once wrangler.toml declares a [[routes]] custom_domain, `wrangler dev`
 * rewrites the request origin to that domain locally. A browser sets Origin to
 * whatever it actually loaded, so it lines up in both environments; a raw
 * request fixture sends none and would need an environment-specific header.
 */

/** Unique per run so repeated runs against the same database do not collide. */
const unique = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`

async function json(page: import("@playwright/test").Page, url: string, body?: unknown) {
  return page.evaluate(
    async ([u, b]) => {
      const res = await fetch(u as string, {
        method: b ? "POST" : "GET",
        headers: b ? { "Content-Type": "application/json" } : undefined,
        body: b ? JSON.stringify(b) : undefined,
      })
      return { status: res.status, body: await res.json().catch(() => null) }
    },
    [url, body] as const,
  )
}

test.describe("Default role — database hook", () => {
  test("a brand new account defaults to spectator, not Better Auth's generic user", async ({
    page,
  }) => {
    // There is no sign-up endpoint any more (ADR 012). A first-time address
    // that proves it can receive a code gets an account, so this exercises
    // auto-provisioning and the default-role hook in one go.
    const email = `hook-${unique()}@remy.dev`
    await signInViaPage(page, email)

    // Before ADR 007 this was "user", which matches no role in
    // access-control.ts — so require-permission.ts denied everything.
    const session = await json(page, "/api/auth/get-session")
    expect(session.body?.user?.role).toBe("spectator")
  })
})

test.describe.serial("Organizations", () => {
  test("an organizer can create an organization and becomes its owner", async ({ page }) => {
    await page.goto("/")

    await signInViaPage(page, ORGANIZER)

    const slug = `club-${unique()}`
    const created = await json(page, "/api/auth/organization/create", {
      name: "Bangkok Ballers",
      slug,
    })
    expect(created.status).toBe(200)
    expect(created.body?.slug).toBe(slug)

    // Membership roles are Better Auth's own (owner/admin/member) and are
    // distinct from the six domain roles — the creator is the owner.
    expect(created.body?.members?.[0]?.role).toBe("owner")

    await deleteOrgViaPage(page, created.body!.id as string)
  })

  test("an organization is listed for the member who created it", async ({ page }) => {
    await page.goto("/")

    await signInViaPage(page, ORGANIZER)

    const slug = `club-${unique()}`
    const created = await json(page, "/api/auth/organization/create", { name: "Listed Club", slug })

    const list = await json(page, "/api/auth/organization/list")
    expect(list.status).toBe(200)
    expect(Array.isArray(list.body)).toBe(true)
    expect((list.body as { slug: string }[]).some((o) => o.slug === slug)).toBe(true)

    await deleteOrgViaPage(page, (created.body as { id: string }).id)
  })

  test("an anonymous visitor cannot create an organization", async ({ page }) => {
    await page.goto("/")

    const created = await json(page, "/api/auth/organization/create", {
      name: "Nope",
      slug: `nope-${unique()}`,
    })
    expect(created.status).toBeGreaterThanOrEqual(400)
  })
})

import { test, expect, type APIRequestContext } from "@playwright/test"
import { ACTOR_NAMES, signIn, deleteOrg, ORGANIZER } from "./helpers/auth"

// The outbox transport, and therefore /api/dev/outbox, exists only locally:
// production runs MAIL_TRANSPORT=cloudflare and the route 404s there by design.
// `mise run deploy` reruns this whole suite against the deployed Worker
// (test:deployed), so without this guard these specs would fail the deploy.
const LOCAL_ONLY = !process.env.BASE_URL

// ADR 010. Invitations are the first feature that sends mail, so these tests
// exist to assert what the email *said* — not merely that the endpoint
// returned 200.
//
// The suite runs with MAIL_TRANSPORT=outbox (set in .dev.vars by
// `mise run dev:vars`), so messages are captured in the Worker isolate and read
// back through /api/dev/outbox. Nothing is delivered.


interface OutboxMessage {
  to: string
  subject: string
  body: string
}

async function inviteTo(request: APIRequestContext, baseURL: string, invitee: string) {
  // Better Auth's own routes reject a cookie-bearing request with no Origin
  // (ADR 006 §9a); a browser sets it, APIRequestContext does not.
  const headers = { Origin: baseURL }

  await signIn(request, ORGANIZER)

  const slug = `invite-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
  const created = await request.post("/api/auth/organization/create", {
    data: { name: "Invite Test Org", slug },
    headers,
  })
  expect(created.ok(), "org creation should succeed").toBeTruthy()
  const org = await created.json()

  const invited = await request.post("/api/auth/organization/invite-member", {
    data: { email: invitee, role: "member", organizationId: org.id },
    headers,
  })
  expect(invited.ok(), "invite should succeed").toBeTruthy()
  return { invitation: await invited.json(), org, cleanup: () => deleteOrg(request, org.id) }
}

async function outboxFor(request: APIRequestContext, to: string): Promise<OutboxMessage[]> {
  const res = await request.get(`/api/dev/outbox?to=${encodeURIComponent(to)}`)
  expect(res.ok(), "the dev outbox should be available under MAIL_TRANSPORT=outbox").toBeTruthy()
  return (await res.json()).messages
}

test.describe("Organization invitations send mail", () => {
  test.skip(!LOCAL_ONLY, "mail capture is local-only (ADR 010)")
  test("an invitation produces an email addressed to the invitee", async ({ request, baseURL }) => {
    const invitee = `coach-${Date.now()}@example.com`
    const { cleanup } = await inviteTo(request, baseURL!, invitee)

    const messages = await outboxFor(request, invitee)
    expect(messages.length, "exactly one message for this invitee").toBe(1)
    expect(messages[0]!.to).toBe(invitee)
    expect(messages[0]!.subject).toContain("Invite Test Org")
    // The inviter is named, so the recipient can tell a real invite from spam.
    expect(messages[0]!.subject).toContain(ACTOR_NAMES.ORGANIZER)
    await cleanup()
  })

  test("the accept link carries the invitation id, not a guessable one", async ({ request, baseURL }) => {
    const invitee = `link-${Date.now()}@example.com`
    const { invitation, cleanup } = await inviteTo(request, baseURL!, invitee)

    const [message] = await outboxFor(request, invitee)
    // The whole point of the mail: without the right id the link is useless.
    expect(message!.body).toContain(invitation.id)
    expect(message!.body).toContain(`/#/accept-invitation/${invitation.id}`)
    await cleanup()
  })

  test("the link uses the canonical URL, not the request origin", async ({ request, baseURL }) => {
    const invitee = `canon-${Date.now()}@example.com`
    const { cleanup } = await inviteTo(request, baseURL!, invitee)

    const [message] = await outboxFor(request, invitee)
    // An email outlives the request that sent it. Building the link from the
    // request origin would bake localhost — or the http:// host wrangler
    // rewrites to locally — into someone's inbox.
    expect(message!.body).toContain("https://remy.ubuntusoftware.net/#/accept-invitation/")
    expect(message!.body).not.toContain("localhost")
    await cleanup()
  })

  test("inviting does not leak mail for other recipients", async ({ request, baseURL }) => {
    const mine = `mine-${Date.now()}@example.com`
    const { cleanup } = await inviteTo(request, baseURL!, mine)

    const others = await outboxFor(request, "nobody-was-invited@example.com")
    expect(others).toHaveLength(0)

    await cleanup()
  })
})

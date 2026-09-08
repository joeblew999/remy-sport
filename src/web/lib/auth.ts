import { identityChanged } from "./session";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

/**
 * Better Auth's endpoints, as TanStack mutations. One definition each.
 *
 * The same OTP flow was hand-written three times — login.tsx, the admin page's
 * role switcher, and the accept-invitation page — each with its own `fetch`,
 * its own `try/catch`, its own `useState` for pending and error, and its own
 * idea of what a failure looks like. Roughly a hundred lines of the machine
 * `useMutation` already is.
 *
 * These stay outside oRPC deliberately: `/api/auth/*` is Better Auth's
 * passthrough, and restating its response shapes as procedure `.output()`
 * schemas would create a parallel contract that drifts the first time they add
 * a field. What is shared here is the *calling*, not the schema.
 *
 * Every mutation that changes who is signed in calls `identityChanged`, which
 * lives beside the session query in lib/session.tsx: the session refetches,
 * and so does everything else the previous person was shown.
 */

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  credentials: "include",
  body: JSON.stringify(body),
});

/** Better Auth answers a refusal with a body carrying the reason. */
async function call(path: string, body: unknown): Promise<void> {
  const res = await fetch(path, json(body));
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(data.message || "That did not work. Try again.");
  }
}

/**
 * End the current session WITHOUT telling the cache.
 *
 * Only for switching from one actor to another, which Better Auth requires:
 * it refuses a sign-in from a request that already carries a session cookie.
 *
 * The ordinary `useSignOut` invalidates, which is right for a person leaving —
 * but here it fires an identity change mid-way through a compound operation.
 * The session momentarily resolves to nobody, and any page gating on "is
 * anyone signed in" redirects to the login screen before the sign-in lands.
 * That is what broke the role switcher: the switch worked, the page had gone.
 *
 * One identity change per identity change. `useVerifyCode` does it, once, at
 * the end.
 */
export const signOutSilently = () =>
  fetch("/api/auth/sign-out", json({})).then(() => undefined)

/** Step one of sign-in: ask for a code. */
export const useRequestCode = () =>
  useMutation({
    mutationFn: (email: string) =>
      call("/api/auth/email-otp/send-verification-otp", { email, type: "sign-in" }),
  });

/** Step two: redeem it. Success changes who is signed in. */
export function useVerifyCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ email, otp }: { email: string; otp: string }) =>
      call("/api/auth/sign-in/email-otp", { email, otp }),
    onSuccess: () => identityChanged(qc),
  });
}

/** Admin plugin writes — set-role, ban-user, impersonate-user, and friends. */
export function useAdminAction() {
  return useMutation({
    mutationFn: ({ path, body }: { path: string; body: unknown }) =>
      call(`/api/auth/admin/${path}`, body),
    /**
     * A full reload, not an invalidation.
     *
     * Impersonation replaces who the session *is*, and a ban or role change
     * alters what Better Auth will answer for every subsequent request. Half
     * this page's data comes from the plugin rather than from a query we own,
     * so refetching the two keys we know about leaves the rest — the role
     * select's own value among them — showing the pre-change answer.
     *
     * The page it lives on is an admin console reached by a handful of people a
     * handful of times; a reload is the honest way to say "everything you were
     * looking at is now stale". This is what the server-rendered version did,
     * and replacing it with targeted invalidation is what broke "an admin can
     * change someone's role, and it sticks".
     */
    onSuccess: () => window.location.reload(),
  });
}


// ── Seeded sign-in ─────────────────────────────────────────────────────────
// The outbox 404s unless MAIL_TRANSPORT=outbox and must never do otherwise: it
// would expose real people's codes. The account *list* also opens up on a
// deployment where TEST_OTP is set, because `.test` addresses have no inbox and
// a published code is the only way in — see src/routes/dev-mail.ts. Either way
// a 404 yields an empty list and the UI renders nothing, so no page branches on
// the environment.

export interface DevAccount {
  role: string;
  email: string;
  name: string;
  /**
   * The relations this account holds, as the access matrix names them —
   * `ORG_ADMIN org_001`, `GAME_REFEREE gam_002`. Derived from the model, so
   * it is the same answer the API will give when you act as them.
   *
   * This is what makes signing in as a seeded person useful rather than
   * arbitrary: two coaches differ by which school they run, and picking the
   * wrong one is why a permission looks broken when it is working.
   */
  holds: string[];
}

export const useDevAccounts = () =>
  useQuery({
    queryKey: ["dev", "accounts"],
    staleTime: Infinity, // fixtures; they do not change while the page is open
    queryFn: async (): Promise<{ accounts: DevAccount[]; code?: string }> => {
      const res = await fetch("/api/dev/accounts");
      if (!res.ok) return { accounts: [] };
      const body = (await res.json()) as { accounts?: DevAccount[]; code?: string };
      return { accounts: body.accounts ?? [], code: body.code };
    },
  });

/** Read a just-emailed code back out of the dev outbox. */
/**
 * Forget a pending code before asking for a new one, on a development server.
 *
 * Better Auth invalidates a code after `allowedAttempts` and throttles re-sends,
 * so a second request inside the window returns 200, issues nothing, and
 * leaves the outbox holding a code somebody else may already have spent. The
 * test helper clears first for that reason; the dev role switcher, which is
 * the same sign-in driven from the console, has to as well. Best effort: a
 * deployment has no outbox and answers 404, which is fine — there is no dev
 * outbox there to read the code from either.
 */
export async function clearDevCode(email: string): Promise<void> {
  await fetch(`/api/dev/otp?to=${encodeURIComponent(email)}`, { method: "DELETE" }).catch(() => undefined);
}

export async function codeFromOutbox(email: string): Promise<string | null> {
  const res = await fetch(`/api/dev/outbox?to=${encodeURIComponent(email)}`);
  if (!res.ok) return null;
  const { messages } = (await res.json()) as { messages: { body: string }[] };
  return messages[0]?.body.match(/Your code is (\d{6})/)?.[1] ?? null;
}

// ── Devices (Better Auth core, not the multiSession plugin — ADR 014) ───────

/** Every session this user holds, with the current one marked. */
export function useDevices() {
  return useQuery({
    queryKey: ["devices"],
    queryFn: async () => {
      const [list, current] = await Promise.all([
        fetch("/api/auth/list-sessions", { credentials: "include" }),
        fetch("/api/auth/get-session", { credentials: "include" }),
      ]);
      if (!list.ok) throw new Error("Could not load your sessions.");
      const sessions = await list.json();
      /**
       * Both, or neither — this used to degrade `get-session` to null.
       *
       * `currentToken` is what marks the row you are using, and `toDevices`
       * offers a Sign-out button on every row that is not it. So a failed or
       * slow `get-session` did not produce a slightly worse list: it produced a
       * list where the session doing the asking looks like somebody else's, with
       * a button that ends it. lib/devices.ts states the opposite promise in so
       * many words — the UI must "refuse to offer revoke on it without warning,
       * signing yourself out from a device-management screen is a surprise, not
       * a feature" — and null silently withdrew it.
       *
       * It bit the e2e tier first, which is the luckiest possible place: the
       * spec clicked the first revocable row, that row was its own session, and
       * the page vanished mid-assertion ("Received: undefined"). A reader would
       * have experienced the same thing as being mysteriously signed out.
       *
       * Throwing puts it in the error branch the page already renders, and lets
       * React Query retry — which is the right answer for a request that failed,
       * and a far better one than a list that cannot be trusted.
       */
      if (!current.ok) throw new Error("Could not load your sessions.");
      const session = (await current.json()) as { session?: { token?: string } } | null;
      const currentToken = session?.session?.token ?? null;
      if (!currentToken) throw new Error("Could not load your sessions.");
      return { sessions, currentToken };
    },
  });
}

/** Sign one device out, or all the others. Either changes the list. */
export function useRevokeDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (token: string | "others") =>
      token === "others"
        ? call("/api/auth/revoke-other-sessions", {})
        : call("/api/auth/revoke-session", { token }),
    /**
     * Refetch and WAIT, rather than invalidate and hope.
     *
     * `invalidateQueries` marks the query stale and returns immediately, so the
     * mutation settles before the new list exists. `isPending` goes false, the
     * button re-enables, and the row you just signed out is still on screen
     * until some later render happens to pick up the refetch. The server had
     * already done the work — measured on dev: two sessions, revoke the right
     * one, one left — while the page kept showing the one that was gone.
     *
     * Returning the promise makes the mutation stay pending until the list has
     * actually been replaced, which is what "signing out" means to the person
     * pressing it.
     */
    onSuccess: () => qc.refetchQueries({ queryKey: ["devices"] }),
  });
}

// ── Invitations ────────────────────────────────────────────────────────────

/**
 * Look up an invitation, where the HTTP status *is* the answer.
 *
 * This one cannot use `call()`: 401 and 403 are not failures here, they are
 * distinct states the page renders differently, and throwing would collapse
 * them into one. Returned as a discriminated result instead.
 *
 * - `needs-signin` (401) — `get-invitation` requires a session and someone
 *   clicking a link in their inbox usually has none. This is the common path,
 *   not an error; treating it as "invalid invitation" told every genuine
 *   invitee their invitation was dead.
 * - `wrong-account` (403) — signed in as somebody else. Safe to say so: the
 *   caller is authenticated and Better Auth discloses it itself.
 * - `invalid` — expired, cancelled, used, or never existed. Better Auth does
 *   not distinguish and neither should the page: an invitation id is a bearer
 *   token, so a precise message is an oracle.
 */
export type InvitationResult =
  | { state: "ok"; invitation: { id: string; email: string; organizationName?: string } }
  | { state: "needs-signin" }
  | { state: "wrong-account" }
  | { state: "invalid" };


/**
 * The account list, from Better Auth's admin plugin.
 *
 * Through `auth.api` rather than reading the `user` table, so the plugin's own
 * permission check decides whether it answers — reading the table directly
 * would be a second answer to "may you see this", which is the drift ADR 007
 * objected to.
 */
export interface Account {
  id: string;
  email: string;
  name: string | null;
  role?: string | null;
  banned?: boolean | null;
  /**
   * The Product Owner's lifecycle state — ACTIVE, PENDING_APPROVAL, SUSPENDED,
   * DEACTIVATED. Distinct from `banned`, which is Better Auth's own flag.
   *
   * `list-users` has always returned it, because auth.config.ts declares it as
   * an additional field. Nothing here read it, so the console's Status column
   * showed "banned or active" and an administrator could not see that a referee
   * was waiting for them.
   */
  statusCode?: string | null;
}

export const useAccounts = (enabled: boolean) =>
  useQuery({
    queryKey: ["admin", "accounts"],
    enabled,
    queryFn: async (): Promise<Account[]> => {
      const res = await fetch(
        "/api/auth/admin/list-users?limit=50&sortBy=createdAt&sortDirection=asc",
        { credentials: "include" },
      );
      if (!res.ok) return [];
      return ((await res.json()) as { users?: Account[] }).users ?? [];
    },
  });

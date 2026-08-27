import { sessionKey } from "./session";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

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
 * Every mutation that changes who is signed in invalidates `sessionKey`, so
 * `useSession` updates without anyone calling a `refresh()` by hand.
 */

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  credentials: "include",
  body: JSON.stringify(body),
});

/**
 * Identity changed — throw the whole cache away, do not merely refetch it.
 *
 * Every cached response was answered *for somebody*. After a sign-in, sign-out,
 * impersonation or role change, each one is an answer to "what may that other
 * person see", and invalidating only the session key leaves the rest on screen.
 *
 * Targeted, and `invalidateQueries` rather than `resetQueries`. Reset clears the cache outright,
 * which blanks the session for a frame — and a page that gates on "is anyone
 * signed in" then redirects to the login screen in the middle of a role
 * switch. That is exactly what broke "the role switcher actually switches
 * role": the switch worked, the page had already navigated away from it.
 *
 * Invalidate refetches every active query immediately and keeps the previous
 * answer on screen only until the new one lands, which is a frame, not a state
 * anything should branch on.
 *
 * Awaited, so a caller that navigates afterwards navigates into the new
 * identity rather than racing it.
 */
async function identityChanged(qc: QueryClient): Promise<void> {
  // The session, and the lists whose contents depend on who is asking.
  //
  // NOT `invalidateQueries()` with no filter, tempting as that is: every active
  // query refetches at once, and against one local D1 that storm is enough to
  // make a concurrently-running spec's sign-in fail. Measured — it cost five
  // passing e2e tests.
  await qc.invalidateQueries({ queryKey: sessionKey })
  await qc.invalidateQueries({ queryKey: ["admin"] })
}

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
  const qc = useQueryClient();
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


// ── Dev-only reads ─────────────────────────────────────────────────────────
// Both 404 unless MAIL_TRANSPORT=outbox, which is the point: they cannot work
// against production. `enabled` is left on — a 404 simply yields an empty
// list, and the UI renders nothing rather than branching on the environment.

export interface DevAccount {
  role: string;
  email: string;
  name: string;
}

export const useDevAccounts = () =>
  useQuery({
    queryKey: ["dev", "accounts"],
    staleTime: Infinity, // fixtures; they do not change while the page is open
    queryFn: async (): Promise<DevAccount[]> => {
      const res = await fetch("/api/dev/accounts");
      if (!res.ok) return [];
      return ((await res.json()) as { accounts?: DevAccount[] }).accounts ?? [];
    },
  });

/** Read a just-emailed code back out of the dev outbox. */
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
      const session = current.ok ? await current.json() : null;
      return { sessions, currentToken: session?.session?.token ?? null };
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["devices"] }),
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

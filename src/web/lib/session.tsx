import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

/**
 * Who is signed in — a query, like every other remote read in this app.
 *
 * This was a `SessionProvider`: three `useState`s, a `useEffect`, a `refresh`
 * callback threaded through context, and a `signOut` that called `refresh()`
 * when it was done. Forty lines of the machine TanStack already is, and the
 * only remaining hand-rolled async in `src/web/`.
 *
 * There is no provider now. `QueryClientProvider` in main.tsx is the only one
 * needed, and any component can ask who is signed in without being wrapped in
 * anything. Deduplication, caching and invalidation come from the same place
 * they do for events and teams.
 */

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  role: string | null;
  /**
   * The Product Owner's lifecycle state — ACTIVE, PENDING_APPROVAL, SUSPENDED,
   * DEACTIVATED. Better Auth returns it because auth.config.ts declares it as an
   * additional field; nothing here read it.
   *
   * SUSPENDED and DEACTIVATED never reach a page: they are refused at session
   * creation. PENDING_APPROVAL deliberately is not — see the note in
   * src/auth.config.ts, which says such a referee "has an account and needs to
   * see that they are waiting". This is what lets a screen keep that promise.
   */
  statusCode?: string | null;
}

interface SessionBody {
  user?: SessionUser | null;
  session?: { activeOrganizationId?: string | null; impersonatedBy?: string | null } | null;
}

/** One key, so `useSession` and `useSignOut` cannot disagree about it. */
export const sessionKey = ["session"] as const;

async function fetchSession(): Promise<SessionBody | null> {
  const res = await fetch("/api/auth/get-session", { credentials: "include" });
  // A signed-out visitor gets 200 with a null body, not an error status — so
  // `res.ok` alone says nothing about whether anyone is signed in.
  return res.ok ? ((await res.json()) as SessionBody | null) : null;
}

/**
 * Not wrapped in an oRPC procedure, deliberately.
 *
 * Better Auth owns `/api/auth/*` as a passthrough and its response shape is
 * Better Auth's to change. Restating that shape as a procedure's `.output()`
 * would create a hand-written parallel schema that drifts the first time they
 * add a field.
 */
export function useSession() {
  const q = useQuery({
    queryKey: sessionKey,
    queryFn: fetchSession,
    // Identity does not change while someone reads a page; it changes when they
    // act, and the mutations below invalidate it when they do.
    staleTime: 60_000,
  });

  return {
    user: q.data?.user ?? null,
    activeOrganizationId: q.data?.session?.activeOrganizationId ?? null,
    /** Set only while an admin is viewing the platform as someone else (ADR 013). */
    impersonatedBy: q.data?.session?.impersonatedBy ?? null,
    loading: q.isPending,
  };
}

/**
 * Identity changed: every cached answer was given to the previous person.
 *
 * `teams.get` carries `can`, the roster carries the coaches for a signed-in
 * reader and nobody else, `me.mine` is a list of what *you* hold. After a
 * sign-in, sign-out, impersonation or role change each of those is an answer
 * to "what may that other person see". Found on 2026-09-06 by pressing Sign
 * out on a team page as its head coach: "Team details" and "Manage squad"
 * stayed on screen for the visitor, and a page read before signing in kept
 * its visitor's answer after. Only the session key was being invalidated.
 *
 * Two moves. Queries nobody is looking at are removed outright — a roster of
 * children with its coaches' names has no business sitting in a visitor's
 * cache waiting to be asked for. Queries on screen are invalidated, which
 * refetches them and keeps the previous answer up only until the new one
 * lands: a frame, not a state anything should branch on. Not `resetQueries`,
 * which blanks the session for that frame, and a page that gates on "is
 * anyone signed in" then redirects to the login screen in the middle of a
 * role switch — that is what once broke the admin page's role switcher.
 *
 * On the cost: an earlier version invalidated only the session and the admin
 * lists, out of a measured fear that refetching every active query at once
 * would contend on one local D1 and fail a concurrent spec's sign-in. What
 * refetches here is the current page's handful of queries, and the e2e tier
 * is the measurement: it was green twice over after this change.
 *
 * Awaited, so a caller that navigates afterwards navigates into the new
 * identity rather than racing it.
 */
export async function identityChanged(qc: QueryClient): Promise<void> {
  qc.removeQueries({ type: "inactive" });
  await qc.invalidateQueries();
}

export function useSignOut() {
  const qc = useQueryClient();
  return useMutation({
    // POST, not the `/api/auth/sign-out` link the old harness used: a GET that
    // destroys a session can be triggered by any page that embeds it.
    mutationFn: async () => {
      await fetch("/api/auth/sign-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: "{}",
      });
    },
    // The whole cache, not just the session: everything in it was an answer
    // given to the person who just left.
    onSettled: () => identityChanged(qc),
  });
}

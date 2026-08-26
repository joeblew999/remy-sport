import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

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

/** Invalidate the session — after signing in, impersonating, or stopping. */
export function useRefreshSession() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: sessionKey });
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
    onSettled: () => qc.invalidateQueries({ queryKey: sessionKey }),
  });
}

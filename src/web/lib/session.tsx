import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";

/**
 * Who is signed in — ADR 008 step 4, finally.
 *
 * Until now the SPA never learned the viewer's identity: the accept-invitation
 * page fetched `/api/auth/get-session` directly because there was nowhere to
 * put the answer, and every other page rendered the same for everyone. That is
 * also what made the two GUIs feel unrelated — one knew about sessions and the
 * other did not.
 *
 * One fetch, shared through context, refreshable after sign-in or sign-out.
 */

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  role: string | null;
}

interface SessionState {
  user: SessionUser | null;
  activeOrganizationId: string | null;
  /**
   * Set only while an admin is viewing the platform as someone else.
   *
   * Better Auth's impersonation keeps the admin's own session underneath and
   * records who is behind the view on `session.impersonated_by` (ADR 013). The
   * admin page needs it to render the banner and to hide the console — nesting
   * an impersonation inside another is not something Better Auth models.
   */
  impersonatedBy: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [activeOrganizationId, setActiveOrganizationId] = useState<string | null>(null);
  const [impersonatedBy, setImpersonatedBy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/get-session", { credentials: "include" });
      // A signed-out visitor gets 200 with a null body, not an error status —
      // so `res.ok` alone says nothing about whether anyone is signed in.
      const body = res.ok ? await res.json() : null;
      setUser(body?.user ?? null);
      setActiveOrganizationId(body?.session?.activeOrganizationId ?? null);
      setImpersonatedBy(body?.session?.impersonatedBy ?? null);
    } catch {
      setUser(null);
      setActiveOrganizationId(null);
      setImpersonatedBy(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signOut = useCallback(async () => {
    // POST, not the /api/auth/sign-out link the harness uses: a GET that
    // destroys a session can be triggered by any page that embeds it.
    await fetch("/api/auth/sign-out", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: "{}",
    }).catch(() => undefined);
    await refresh();
  }, [refresh]);

  return (
    <SessionContext.Provider value={{ user, activeOrganizationId, impersonatedBy, loading, refresh, signOut }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}

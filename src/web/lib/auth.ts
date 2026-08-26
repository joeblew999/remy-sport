import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { sessionKey } from "./session";

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

/** Better Auth answers a refusal with a body carrying the reason. */
async function call(path: string, body: unknown): Promise<void> {
  const res = await fetch(path, json(body));
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(data.message || "That did not work. Try again.");
  }
}

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
    onSuccess: () => qc.invalidateQueries({ queryKey: sessionKey }),
  });
}

/** Admin plugin writes — set-role, ban-user, impersonate-user, and friends. */
export function useAdminAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ path, body }: { path: string; body: unknown }) =>
      call(`/api/auth/admin/${path}`, body),
    onSuccess: () => {
      // Impersonation and bans change the viewer, not just a row.
      void qc.invalidateQueries({ queryKey: sessionKey });
      void qc.invalidateQueries({ queryKey: ["admin"] });
    },
  });
}

export function useAcceptInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (invitationId: string) =>
      call("/api/auth/organization/accept-invitation", { invitationId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: sessionKey }),
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

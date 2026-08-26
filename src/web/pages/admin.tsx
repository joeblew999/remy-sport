/**
 * The admin console, in the product GUI (ADR 013, moved here by ADR 020).
 *
 * This was `src/views/dashboard.ts` — 386 lines of Hono template literal with
 * DaisyUI from a CDN, served at /dashboard, and the sole reason a second GUI
 * existed. AGENTS.md justified that second GUI on the grounds that it was "the
 * only place authorization is exercised end to end against real data". That was
 * measurably untrue: 20 of `authz.spec.ts`'s 26 tests use Playwright's `request`
 * fixture and never open a browser. Only six touched this page, and they
 * asserted per-actor *rendering*, not authorization.
 *
 * So the page moves rather than the argument surviving. Everything the specs
 * hook on — the testids, and the `badge-success` class the permission grid is
 * asserted against — is preserved verbatim, which is what makes the port
 * checkable: the tests written for the implementation being replaced still pass
 * against the replacement.
 *
 * Reads go through TanStack Query. Writes are Better Auth's admin endpoints,
 * called directly: they are Better Auth's contract, not ours, and wrapping them
 * in oRPC procedures would restate a response shape that is theirs to change.
 */

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, orpc } from "../lib/orpc";
import { useAccounts, useAdminAction, useDevAccounts, useRequestCode, useVerifyCode, codeFromOutbox } from "../lib/auth";
import { useSession } from "../lib/session";
import type { Route } from "../lib/router";

const ROLES = ["admin", "organizer", "coach", "player", "spectator", "referee"] as const;

/**
 * Which actions each role holds over an event.
 *
 * A copy of the platform access-control model, for display only — the real
 * answer is enforced in `src/api/base.ts` and asserted by the 20 request-level
 * tests in authz.spec.ts. Rendering it here is how a person sees what their
 * role means; it is not what decides anything.
 */
const ROLE_PERMISSIONS: Record<string, string[]> = {
  admin: ["create", "read", "update", "delete"],
  organizer: ["create", "read", "update", "delete"],
  coach: ["read"],
  player: ["read"],
  spectator: ["read"],
  referee: ["read"],
  user: ["read"],
};

export function AdminPage({ goto }: { goto: (r: Route) => void }) {
  const { user, impersonatedBy, loading } = useSession();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  // Signed-out visitors get the login screen, matching what /dashboard did with
  // a redirect. Rendered as a route change so the SPA stays a single document.
  useEffect(() => {
    if (!loading && !user) goto({ page: "login" });
  }, [loading, user, goto]);

  const role = user?.role || "user";
  const perms = ROLE_PERMISSIONS[role] || ["read"];
  const canCreate = perms.includes("create");
  const canDelete = perms.includes("delete");
  const isAdmin = role === "admin";

  const events = useQuery(orpc.events.list.queryOptions());

  /**
   * The account list comes from Better Auth's admin plugin, so the plugin's own
   * permission check decides whether it answers. Reading the `user` table
   * directly would be a second answer to "may you see this" — the drift ADR 007
   * objected to.
   */
  const accounts = useAccounts(isAdmin && !impersonatedBy);


  // One definition, in lib/auth.ts, shared with every other admin write.
  // Invalidating the session and the account list is its job, not this page's —
  // so nothing here calls window.location.reload().
  const adminAction = useAdminAction();
  if (adminAction.error && !error) setError(adminAction.error.message);

  const deleteEvent = useMutation({
    mutationFn: (id: string) => api.events.delete({ id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: orpc.events.key() }),
    onError: (e: Error) => setError(e.message),
  });

  if (loading || !user) return <div className="page-header"><h1>Loading…</h1></div>;

  return (
    <div className="admin">
      {impersonatedBy && (
        <div className="admin-banner" data-testid="impersonation-banner">
          <span>
            You are viewing the platform as <strong>{user.email}</strong>. Your own admin
            session is intact.
          </span>
          <button
            data-testid="stop-impersonating"
            onClick={() =>
              adminAction.mutate({ path: "stop-impersonating", body: {} })
            }
          >
            Stop impersonating
          </button>
        </div>
      )}

      <div className="page-header">
        <div className="crumbs">ADMIN</div>
        <h1>Dashboard</h1>
        <div className="sub">
          {user.name || user.email} ·{" "}
          <span className="badge" data-testid="role-badge">
            {role}
          </span>
        </div>
      </div>

      {error && <div className="admin-error">{error}</div>}

      <section className="admin-card">
        <h2>Your permissions (event)</h2>
        <div className="admin-perms" data-testid="permissions">
          {["create", "read", "update", "delete"].map((p) => (
            <span
              key={p}
              // `badge-success` is asserted directly by authz.spec.ts for all
              // six roles. The class name is the contract, not decoration.
              className={`badge ${perms.includes(p) ? "badge-success" : "badge-off"}`}
              data-testid={`perm-${p}`}
            >
              {p}
            </span>
          ))}
        </div>
      </section>

      <section className="admin-card">
        <h2>Events</h2>
        <table className="admin-table" data-testid="events-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Description</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {events.data?.events.length ? (
              events.data.events.map((e) => (
                <tr key={e.id}>
                  <td>{e.name}</td>
                  <td>
                    <span className="badge badge-outline">{e.typeCode}</span>
                  </td>
                  <td className="muted">{e.description || "—"}</td>
                  <td>
                    {canDelete && (e.createdBy === user.id || isAdmin) && (
                      <button
                        className="danger"
                        onClick={() => deleteEvent.mutate(e.id)}
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="muted">
                  {events.isPending ? "Loading…" : "No events yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {canCreate ? (
        <CreateEvent onError={setError} />
      ) : (
        <section className="admin-card dim" data-testid="create-event-denied">
          <h2>Create event</h2>
          <p className="muted">
            Your role (<strong>{role}</strong>) does not have permission to create events.
          </p>
        </section>
      )}

      {/* Only for an admin who is not already impersonating: Better Auth does
          not model a nested impersonation, and the way out is the banner. */}
      {isAdmin && !impersonatedBy && (
        <section className="admin-card" data-testid="admin-console">
          <h2>Accounts</h2>
          <p className="muted">
            Platform administration, via Better Auth's admin plugin. Impersonation keeps
            your admin identity — the session records who is behind it.
          </p>
          <table className="admin-table" data-testid="accounts-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(accounts.data ?? []).map((a) => (
                <tr key={a.id} data-testid={`account-row-${a.email}`}>
                  <td>
                    {a.name || a.email}
                    <div className="muted small">{a.email}</div>
                  </td>
                  <td>
                    <select
                      data-testid={`role-select-${a.email}`}
                      value={a.role ?? "spectator"}
                      onChange={(ev) =>
                        adminAction.mutate({
                          path: "set-role",
                          body: { userId: a.id, role: ev.target.value },
                        })
                      }
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {a.banned ? (
                      <span className="badge badge-danger" data-testid={`banned-${a.email}`}>
                        banned
                      </span>
                    ) : (
                      <span className="badge">active</span>
                    )}
                  </td>
                  <td>
                    {a.id === user.id ? (
                      <span className="muted small">you</span>
                    ) : (
                      <>
                        <button
                          data-testid={`impersonate-${a.email}`}
                          onClick={() =>
                            adminAction.mutate({
                              path: "impersonate-user",
                              body: { userId: a.id },
                            })
                          }
                        >
                          Impersonate
                        </button>
                        <button
                          data-testid={`ban-${a.email}`}
                          onClick={() =>
                            adminAction.mutate({
                              path: a.banned ? "unban-user" : "ban-user",
                              body: { userId: a.id },
                            })
                          }
                        >
                          {a.banned ? "Unban" : "Ban"}
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <RoleSwitcher current={role} />
    </div>
  );
}

function CreateEvent({ onError }: { onError: (m: string | null) => void }) {
  const qc = useQueryClient();
  const [done, setDone] = useState(false);

  const create = useMutation({
    mutationFn: (input: { names: { en: string }; typeCode: string; description?: string }) =>
      api.events.create(input as never),
    onSuccess: () => {
      onError(null);
      setDone(true);
      qc.invalidateQueries({ queryKey: orpc.events.key() });
      setTimeout(() => setDone(false), 2000);
    },
    onError: (e: Error) => onError(e.message),
  });

  return (
    <section className="admin-card" data-testid="create-event-form">
      <h2>Create event</h2>
      {done && <div className="admin-ok">Event created.</div>}
      <form
        className="admin-form"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          create.mutate({
            names: { en: String(f.get("name")) },
            typeCode: String(f.get("type")),
            description: String(f.get("description") || "") || undefined,
          });
          e.currentTarget.reset();
        }}
      >
        <input name="name" placeholder="Event name" required autoComplete="off" />
        <select name="type" required defaultValue="tournament">
          <option value="tournament">Tournament</option>
          <option value="league">League</option>
          <option value="camp">Camp / Clinic</option>
          <option value="showcase">Showcase</option>
        </select>
        <input name="description" placeholder="Description (optional)" autoComplete="off" />
        <button type="submit" disabled={create.isPending}>
          {create.isPending ? "Creating…" : "Create event"}
        </button>
      </form>
    </section>
  );
}

/**
 * Dev-only sign-in-as, and honestly labelled.
 *
 * There are no passwords (ADR 012), so switching role means completing a real
 * sign-in: request a code, read it from the dev outbox, redeem it. The outbox
 * only exists under MAIL_TRANSPORT=outbox, so this cannot work against
 * production — which is correct. A control that silently signs you in as an
 * admin would be a hole, not a convenience.
 *
 * Prefer Impersonate above when you are an admin: it keeps your identity and is
 * recorded on the session (ADR 013).
 */
function RoleSwitcher({ current }: { current: string }) {
  const [status, setStatus] = useState("");
  const requestCode = useRequestCode();
  const verifyCode = useVerifyCode();
  // `useDevAccounts` 404s to an empty list off localhost, so this renders
  // nothing there rather than branching on the environment.
  const actors = (useDevAccounts().data ?? []).map((a) => ({
    ...a,
    label: a.role.charAt(0).toUpperCase() + a.role.slice(1),
  }));

  const switchTo = async (email: string) => {
    try {
      setStatus("Requesting a code…");
      await requestCode.mutateAsync(email);

      const otp = await codeFromOutbox(email);
      if (!otp) return setStatus("Local-only — no dev outbox on this deployment.");

      setStatus("Signing in…");
      await verifyCode.mutateAsync({ email, otp });
      setStatus("");
    } catch (e) {
      setStatus((e as Error).message);
    }
  };

  return (
    <section className="admin-card">
      <h2>Sign in as (dev, local only)</h2>
      <p className="muted small" data-testid="switch-status">
        {status}
      </p>
      <div className="admin-switcher" data-testid="role-switcher">
        {actors.map((a) => (
          <button
            key={a.email}
            title={a.email}
            className={current === a.role ? "active" : ""}
            onClick={() => switchTo(a.email)}
          >
            {a.label}
          </button>
        ))}
      </div>
    </section>
  );
}

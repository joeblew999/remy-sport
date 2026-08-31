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
import { formErrors } from "../lib/form-errors";
import { m } from "../lib/i18n";
import { useLocale } from "../lib/locale";
import { api, orpc } from "../lib/orpc";
import { useAccounts, useAdminAction, useDevAccounts, useRequestCode, useVerifyCode, codeFromOutbox, signOutSilently } from "../lib/auth";
import { useSession } from "../lib/session";
import { useTeams } from "../lib/data";
import type { Route } from "../lib/router";

const ROLES = ["admin", "organizer", "coach", "player", "spectator", "referee"] as const;

/**
 * There is no role→permission table here any more.
 *
 * There was one, and its docstring said it was "for display only — it is not
 * what decides anything". Twenty lines further down it decided two things:
 * whether the create form appeared, and whether a Delete button did. Beside the
 * second it also tested `e.organizerUserId === user.id`, which is the OWNER
 * relation reimplemented in a component.
 *
 * It happened to agree with the model, so nothing was visibly broken — which is
 * the failure mode a second copy has. It agrees until the model changes, and
 * then it is a screen offering a control the API refuses, or hiding one the
 * viewer is entitled to, with no test able to tell.
 *
 * Every flag below is the server's answer now: `canCreate` on the list
 * (`CREATE_EVENT` is a PLATFORM action, so it belongs to the list and not to an
 * event), `canDelete` per event, `canEdit` per event.
 */
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
  const isAdmin = role === "admin";

  const events = useQuery(orpc.events.list.queryOptions());

  /**
   * Approving a referee who has been waiting.
   *
   * `PENDING_APPROVAL` could be entered and never left: the action was granted
   * to PLATFORM_ADMIN and had no endpoint, so a referee signed up, signed in —
   * which is deliberate, so they can see they are waiting — and stayed there.
   */
  const approve = useMutation({
    mutationFn: (id: string) => api.admin.approveReferee({ id }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin", "accounts"] }),
    onError: (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
  });

  /**
   * What the viewer may do, as the server reports it.
   *
   * `read` is true by definition — this list is what they are reading. `update`
   * and `delete` are "on at least one event you can see", because that is the
   * only honest role-level reading of a permission the model resolves per
   * object: a co-organiser holds EDIT_EVENT on one tournament and nothing on
   * the rest, and a single badge cannot say more than whether they hold it
   * anywhere.
   */
  const rows = events.data?.events ?? [];
  const canCreate = events.data?.canCreate ?? false;
  const held: Record<string, boolean> = {
    create: canCreate,
    read: true,
    update: rows.some((e) => e.canEdit),
    delete: rows.some((e) => e.canDelete),
  };

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
  if (adminAction.error && !error) setError(formErrors(adminAction.error).form);

  const deleteEvent = useMutation({
    mutationFn: (id: string) => api.events.delete({ id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: orpc.events.key() }),
    onError: (e: Error) => setError(formErrors(e).form),
  });

  if (loading || !user) return <div className="page-header"><h1>{m.loading()}</h1></div>;

  return (
    <div className="admin">
      {impersonatedBy && (
        <div className="admin-banner" data-testid="impersonation-banner">
          <span>
            {m.impersonating_as({ email: user.email })}
          </span>
          <button
            data-testid="stop-impersonating"
            onClick={() =>
              adminAction.mutate({ path: "stop-impersonating", body: {} })
            }
          >
            {m.stop_impersonating()}
          </button>
        </div>
      )}

      <div className="page-header">
        <div className="crumbs">{m.admin_crumb()}</div>
        <h1>{m.dashboard()}</h1>
        <div className="sub">
          {user.name || user.email} ·{" "}
          <span className="badge" data-testid="role-badge">
            {role}
          </span>
        </div>
      </div>

      {error && <div className="admin-error">{error}</div>}

      <section className="admin-card">
        <h2>{m.your_permissions()}</h2>
        <div className="admin-perms" data-testid="permissions">
          {["create", "read", "update", "delete"].map((p) => (
            <span
              key={p}
              // `badge-success` is asserted directly by the render specs. The
              // class name is the contract, not decoration.
              className={`badge ${held[p] ? "badge-success" : "badge-off"}`}
              data-testid={`perm-${p}`}
            >
              {p}
            </span>
          ))}
        </div>
      </section>

      <section className="admin-card">
        <h2>{m.events()}</h2>
        <table className="admin-table" data-testid="events-table">
          <thead>
            <tr>
              <th>{m.name()}</th>
              <th>{m.type()}</th>
              <th>{m.description()}</th>
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
                    {e.canDelete && (
                      <button
                        className="danger"
                        onClick={() => deleteEvent.mutate(e.id)}
                      >
                        {m.delete()}
                      </button>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="muted">
                  {events.isPending ? m.loading() : m.no_events_yet()}
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
          <h2>{m.create_event()}</h2>
          <p className="muted">
            {m.create_event_denied({ role })}
          </p>
        </section>
      )}

      {/* `teams.delete` is granted to PLATFORM_ADMIN and to nobody else — no
          relation to the team is required or accepted — so this is the one
          place it can live. It had no screen at all, which meant a team created
          by mistake stayed forever. */}
      {isAdmin && !impersonatedBy && <DeleteTeams />}

      {/* Only for an admin who is not already impersonating: Better Auth does
          not model a nested impersonation, and the way out is the banner. */}
      {isAdmin && !impersonatedBy && (
        <section className="admin-card" data-testid="admin-console">
          <h2>{m.accounts()}</h2>
          <p className="muted">
            {m.accounts_note()}
          </p>
          <table className="admin-table" data-testid="accounts-table">
            <thead>
              <tr>
                <th>{m.email_column()}</th>
                <th>{m.role()}</th>
                <th>{m.status()}</th>
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
                    {/* Banned first: it is Better Auth's own flag and overrides
                        whatever the model's lifecycle says. Then the real
                        status, which this column used to ignore — so a referee
                        awaiting approval was indistinguishable from an active
                        one. */}
                    {a.banned ? (
                      <span className="badge badge-danger" data-testid={`banned-${a.email}`}>
                        {m.banned()}
                      </span>
                    ) : a.statusCode === "PENDING_APPROVAL" ? (
                      <span className="badge badge-off" data-testid={`pending-${a.email}`}>
                        {m.awaiting_approval()}
                      </span>
                    ) : (
                      <span className="badge">{m.active()}</span>
                    )}
                  </td>
                  <td>
                    {a.id === user.id ? (
                      <span className="muted small">{m.you()}</span>
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
                          {m.impersonate()}
                        </button>
                        {/* Only where it means something. APPROVE_REFEREE is
                            "approve a referee", not "set a status", so the
                            control exists exactly where the action does. */}
                        {a.statusCode === "PENDING_APPROVAL" && a.role === "referee" && (
                          <button
                            className="primary"
                            data-testid={`approve-${a.email}`}
                            disabled={approve.isPending}
                            onClick={() => approve.mutate(a.id)}
                          >
                            {m.approve()}
                          </button>
                        )}
                        <button
                          data-testid={`ban-${a.email}`}
                          onClick={() =>
                            adminAction.mutate({
                              path: a.banned ? "unban-user" : "ban-user",
                              body: { userId: a.id },
                            })
                          }
                        >
                          {a.banned ? m.unban() : m.ban()}
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
  const { reference, name } = useLocale();
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
    onError: () => undefined,
  });

  // Anything these two do not claim — a bad type code, a date range the API
  // refuses — is rendered at form level below rather than vanishing.
  const createErr = formErrors(create.error, ["names[en]", "description"]);

  return (
    <section className="admin-card" data-testid="create-event-form">
      <h2>{m.create_event()}</h2>
      {done && <div className="admin-ok">{m.event_created()}</div>}
      {createErr.form && (
        <div className="admin-error" data-testid="create-event-error">{createErr.form}</div>
      )}
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
        {/* The schema's own message, under the field it belongs to — `names` is
            a locale map, so an issue on the English name arrives at names.en. */}
        {createErr.field("names[en]") && (
          <p className="admin-error small" data-testid="create-event-name-issue">
            {createErr.field("names[en]")}
          </p>
        )}
        {/* From the PO's vocabulary, not four hardcoded English strings. The
            same shape GameStatus uses: an event type added upstream appears
            here, already translated, with nothing edited in this file. The
            hardcoded version was also a second place for the code list to
            drift from the model. */}
        <select name="type" required defaultValue="tournament">
          {(reference?.eventTypes ?? []).map((t) => (
            <option key={t.code} value={t.code}>
              {name(t.names, t.code)}
            </option>
          ))}
        </select>
        <input name="description" placeholder="Description (optional)" autoComplete="off" />
        {createErr.field("description") && (
          <p className="admin-error small" data-testid="create-event-description-issue">
            {createErr.field("description")}
          </p>
        )}
        <button type="submit" disabled={create.isPending}>
          {create.isPending ? m.creating() : m.create_event()}
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
  // One per role, deliberately. /api/dev/accounts lists every seeded person now,
  // because the differences *within* a role are what you check a permission
  // against — but this control switches ROLE, and three buttons all reading
  // "Coach" would be three ways to do the same thing. Choosing a particular
  // person is the login page's job.
  const actors = (useDevAccounts().data?.accounts ?? [])
    .filter((a, i, all) => all.findIndex((o) => o.role === a.role) === i)
    .map((a) => ({ ...a, label: a.role.charAt(0).toUpperCase() + a.role.slice(1) }));

  const switchTo = async (email: string) => {
    try {
      // Sign out first, and this is not optional: Better Auth refuses a
      // sign-in from a request that already carries a session cookie, so
      // switching straight from one actor to another silently does nothing.
      //
      // Silently, because this is one step of a switch and not a sign-out.
      // Invalidating here resolves the session to nobody for a moment, and
      // this page redirects to /#/login when nobody is signed in.
      setStatus("Signing out…");
      await signOutSilently();

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
      <h2>{m.sign_in_as_dev()}</h2>
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

/**
 * Removing a team, which only a platform admin may do.
 *
 * `DELETE_TEAM` is granted to `PLATFORM_ADMIN` alone: a head coach may edit
 * their team's profile and manage its roster, and may not delete it. That is
 * the PO's line and it is why this control is here rather than beside the edit
 * form on the team page.
 *
 * It cascades. Three tables carry a non-null FK to `team.id` — the roster, the
 * coaching staff and the event entries — and the procedure clears them first,
 * because none is declared ON DELETE CASCADE. So the confirmation names what
 * goes with it rather than asking a bare "are you sure": somebody agreeing to
 * delete a team is not necessarily agreeing to delete its history.
 */
function DeleteTeams() {
  const qc = useQueryClient();
  const { data: teams = [] } = useTeams();

  const remove = useMutation({
    mutationFn: (id: string) => api.teams.delete({ id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: orpc.teams.key() }),
  });

  return (
    <section className="admin-card" data-testid="admin-teams">
      <h2>{m.admin_teams()}</h2>
      {teams.length === 0 && <div className="empty" data-testid="admin-no-teams">{m.admin_no_teams()}</div>}
      {teams.map((t) => (
        <div key={t.id} className="invite-row" data-testid={`admin-team-${t.id}`}>
          <div>
            <div className="row-title">{t.name}</div>
            <div className="row-meta">{[t.orgName, t.ageGroupCode, t.genderLabel].filter(Boolean).join(" · ")}</div>
          </div>
          <button
            className="btn"
            data-testid={`delete-team-${t.id}`}
            disabled={remove.isPending}
            onClick={() => {
              if (window.confirm(m.admin_delete_team_confirm({ team: t.name }))) remove.mutate(t.id);
            }}
          >
            {m.admin_delete_team()}
          </button>
        </div>
      ))}
    </section>
  );
}

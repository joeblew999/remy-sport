import { CreateEvent } from "../components/create-event";
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
import { useCan, useTeams } from "../lib/data";
import { STORED_ROLE } from "../../domain/vocabularies";
import type { Route } from "../lib/router";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

/**
 * The roles, as Better Auth stores them — derived, not typed out again.
 *
 * This was a literal array of the same six strings. It agreed with the model,
 * which is what a second copy does right up until it does not: a role the
 * Product Owner adds upstream would appear in `label("roles", …)` and be absent
 * from every select on this page, and nothing would fail.
 */
const ROLES = Object.values(STORED_ROLE);

/** The model's own code for a stored role, for `label("roles", …)`. */
const ROLE_CODE = Object.fromEntries(
  Object.entries(STORED_ROLE).map(([code, stored]) => [stored, code]),
) as Record<string, string>;

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
 * Every answer below is the server's: `can.CREATE_EVENT` from `me.mine`
 * (a PLATFORM action, so it belongs to no event), `can.DELETE_EVENT` and
 * `can.EDIT_EVENT` per event.
 *
 * @answers MANAGE_ALL_USERS, APPROVE_REFEREE, CREATE_EVENT, DELETE_EVENT, DELETE_TEAM,
 *          DELETE_PLAYER, CREATE_USER_ACCOUNT
 *
 * The platform-admin console. Every action here is granted to PLATFORM_ADMIN
 * and to nobody else, which is why they are on one screen.
 */
export function AdminPage({ goto }: { goto: (r: Route) => void }) {
  const { user, impersonatedBy, loading } = useSession();
  const { label } = useLocale();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  // Signed-out visitors get the login screen, matching what /dashboard did with
  // a redirect. Rendered as a route change so the SPA stays a single document.
  useEffect(() => {
    if (!loading && !user) goto({ page: "login" });
  }, [loading, user, goto]);

  const role = user?.role || "user";
  /**
   * The model's answer, not a role string read in the browser.
   *
   * This was `role === "admin"`, which is a second copy of a rule `GRANTS`
   * already holds — `MANAGE_ALL_USERS` is granted to PLATFORM_ADMIN there. The
   * two can disagree, and they already did once: the console "decided this
   * from a role table copied
   * into the client, which is a second answer to a question the model already
   * answers".
   *
   * `role` survives below only for display — showing a person what they are.
   */
  const { data: isAdmin } = useCan("MANAGE_ALL_USERS");
  // Asked of the model, not inferred from `isAdmin`: they happen to have the
  // same answer today because the PO grants both to PLATFORM_ADMIN, and a
  // screen that assumes so is the second copy this whole pass removed.
  const { data: canDeletePlayer } = useCan("DELETE_PLAYER");
  const { data: canCreateAccount } = useCan("CREATE_USER_ACCOUNT");

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
  const { data: canCreate } = useCan("CREATE_EVENT");
  const held: Record<string, boolean> = {
    create: canCreate,
    read: true,
    update: rows.some((e) => e.can.EDIT_EVENT),
    delete: rows.some((e) => e.can.DELETE_EVENT),
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
    <div className="admin page-inner">
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
        {/* "Dashboard" until Home existed; this is the console. */}
        <h1>{m.home_admin()}</h1>
        <div className="sub">
          {user.name || user.email} ·{" "}
          <span className="badge" data-testid="role-badge">
            {role}
          </span>
        </div>
      </div>

      {error && <div className="feedback-error" role="alert">{error}</div>}

      <section className="panel">
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

      <section className="panel">
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
                    {e.can.DELETE_EVENT && (
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
        <section className="panel dim" data-testid="create-event-denied">
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

      {/* `DELETE_PLAYER` is PLATFORM_ADMIN alone, the same line as teams — and
          it is not the roster's "Remove", which ends a spell on a squad. */}
      {canDeletePlayer && !impersonatedBy && <DeletePlayers />}

      {/* Asked of the model, like the two above it. */}
      {canCreateAccount && !impersonatedBy && <CreateAccount />}

      {/* Only for an admin who is not already impersonating: Better Auth does
          not model a nested impersonation, and the way out is the banner. */}
      {isAdmin && !impersonatedBy && (
        <section className="panel" data-testid="admin-console">
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
                        whatever the model's lifecycle says.

                        Then the model's own status, resolved through the
                        `userStatuses` vocabulary rather than branched on here.
                        This tested for PENDING_APPROVAL and called everything
                        else "Active" — and the model defines four: ACTIVE,
                        PENDING_APPROVAL, SUSPENDED and DEACTIVATED. A suspended
                        account read as active in the admin console, which is
                        the one screen whose job is to say otherwise.

                        The pending testid stays, because approval is a state
                        with an action beside it and the specs hook on it. */}
                    {a.banned ? (
                      <span className="badge badge-danger" data-testid={`banned-${a.email}`}>
                        {m.banned()}
                      </span>
                    ) : (
                      <span
                        className={`badge ${a.statusCode === "ACTIVE" ? "" : "badge-off"}`}
                        data-testid={
                          a.statusCode === "PENDING_APPROVAL" ? `pending-${a.email}` : undefined
                        }
                      >
                        {label("userStatuses", a.statusCode ?? "ACTIVE")}
                      </span>
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
  const devAccounts = useDevAccounts();
  // The server supplies permitted actors and, on staging, their seeded code.
  // One per role, deliberately. /api/dev/accounts lists every seeded person now,
  // because the differences *within* a role are what you check a permission
  // against — but this control switches ROLE, and three buttons all reading
  // "Coach" would be three ways to do the same thing. Choosing a particular
  // person is the login page's job.
  const actors = (devAccounts.data?.accounts ?? [])
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

      const otp = devAccounts.data?.code ?? (await codeFromOutbox(email));
      if (!otp) return setStatus("Local-only — no dev outbox on this deployment.");

      setStatus("Signing in…");
      await verifyCode.mutateAsync({ email, otp });
      setStatus("");
    } catch (e) {
      setStatus((e as Error).message);
    }
  };

  return (
    <section className="panel">
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
 * Making an account for somebody who cannot make their own.
 *
 * `CREATE_USER_ACCOUNT` is granted to PLATFORM_ADMIN and had no screen — one of
 * the last two actions the model granted and the app did not offer. Sign-up is
 * self-serve and passwordless, so this is not the way most people arrive; it is
 * for the coach who has to exist as a user before a team can name them, and for
 * the person whose address keeps bouncing.
 *
 * ## No password, on purpose
 *
 * `emailAndPassword` is disabled in auth.config.ts and Better Auth's
 * `create-user` treats `password` as optional — it links a credential account
 * only `if (ctx.body.password)`. So this sends none, the row exists with no way
 * to sign in by password, and the person gets in the way everybody else does:
 * they ask for a code. Sending a throwaway password would create a credential
 * account nobody can use and one more thing to explain.
 *
 * The role is sent explicitly and survives: the `user.create.before` hook reads
 * `u.role ?? "spectator"`, so it fills a gap rather than overwriting a choice.
 * Better Auth refuses a duplicate address itself, with
 * USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL, so there is no check here that could
 * disagree with it.
 */
function CreateAccount() {
  const { label } = useLocale();
  const create = useAdminAction();
  const issue = create.error ? formErrors(create.error).form : null;

  return (
    <section className="panel" data-testid="create-account">
      <h2>{m.admin_create_account()}</h2>
      <p className="muted">{m.admin_create_account_sub()}</p>
      {issue && (
        <Alert variant="destructive" data-testid="create-account-error" role="alert">
          <AlertDescription>{issue}</AlertDescription>
        </Alert>
      )}
      <form
        data-testid="create-account-form"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          create.mutate({
            path: "create-user",
            // No `password` key at all, not an empty one: Better Auth branches
            // on its presence.
            body: {
              email: String(f.get("email")),
              name: String(f.get("name")),
              role: String(f.get("role")),
            },
          });
        }}
      >
        <FieldGroup className="max-w-[420px]">
          <Field>
            <FieldLabel htmlFor="create-account-email">{m.admin_create_account_email()}</FieldLabel>
            <Input name="email" type="email" required id="create-account-email" data-testid="create-account-email" />
          </Field>
          <Field>
            <FieldLabel htmlFor="create-account-name">{m.admin_create_account_name()}</FieldLabel>
            <Input name="name" required id="create-account-name" data-testid="create-account-name" />
          </Field>
          <Field>
            <FieldLabel htmlFor="create-account-role">{m.role()}</FieldLabel>
            <NativeSelect name="role" id="create-account-role" data-testid="create-account-role" defaultValue={STORED_ROLE.SPECTATOR}>
              {ROLES.map((r) => (
                <NativeSelectOption key={r} value={r}>{label("roles", ROLE_CODE[r] ?? r)}</NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Button type="submit" data-testid="create-account-submit" disabled={create.isPending} className="w-fit">
            {m.admin_create_account_submit()}
          </Button>
        </FieldGroup>
      </form>
    </section>
  );
}

/**
 * Removing a player, which only a platform admin may do.
 *
 * The same line the PO drew for teams, drawn again: `DELETE_PLAYER` is granted
 * to `PLATFORM_ADMIN` and to nobody else. A head coach manages a squad and may
 * not delete the people in it — so this sits here rather than beside "Remove"
 * on the roster, which is a coach's tool. Those two buttons mean genuinely
 * different things and putting them side by side would invite the mistake.
 *
 * Removing from a squad *ends the spell*: `playerTeam` carries from and to
 * dates and the departure stops granting access without making last season's
 * team sheet wrong. This deletes the person. Four tables carry a non-null FK to
 * `player.id` — squads, event entries, attendance and guardians — and none is
 * ON DELETE CASCADE, so the procedure clears them first. The confirmation names
 * them for the reason the team one does: agreeing to delete a player is not the
 * same as agreeing to delete who was responsible for them.
 *
 * The list is `players.list`, which already existed and is already behind a
 * session — `domain.ts` holds it stricter than the model on purpose, because
 * these rows name minors.
 */
function DeletePlayers() {
  const qc = useQueryClient();
  const { name, label } = useLocale();
  const { data } = useQuery(orpc.players.list.queryOptions());

  const remove = useMutation({
    mutationFn: (id: string) => api.players.remove({ id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: orpc.players.key() }),
  });

  const players = data?.items ?? [];

  return (
    <section className="panel" data-testid="admin-players">
      <h2>{m.admin_players()}</h2>
      {players.length === 0 && (
        <div className="empty" data-testid="admin-no-players">{m.admin_no_players()}</div>
      )}
      {players.map((p) => (
        <div key={p.id} className="invite-row" data-testid={`admin-player-${p.id}`}>
          <div>
            <div className="row-title">{name(p.names)}</div>
            {/* The code is the model's, not a reader's — `label` is how every
                other screen turns one into words, in their language. */}
            <div className="row-meta">
              {[`#${p.jerseyNumber}`, label("positions", p.positionCode)].join(" · ")}
            </div>
          </div>
          <Button
            variant="outline"
            data-testid={`delete-player-${p.id}`}
            disabled={remove.isPending}
            onClick={() => {
              if (window.confirm(m.admin_delete_player_confirm({ player: name(p.names) })))
                remove.mutate(p.id);
            }}
          >
            {m.admin_delete_player()}
          </Button>
        </div>
      ))}
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
    <section className="panel" data-testid="admin-teams">
      <h2>{m.admin_teams()}</h2>
      {teams.length === 0 && <div className="empty" data-testid="admin-no-teams">{m.admin_no_teams()}</div>}
      {teams.map((t) => (
        <div key={t.id} className="invite-row" data-testid={`admin-team-${t.id}`}>
          <div>
            <div className="row-title">{t.name}</div>
            <div className="row-meta">{[t.orgName, t.ageGroupLabel, t.genderLabel].filter(Boolean).join(" · ")}</div>
          </div>
          <Button
            variant="outline"
            data-testid={`delete-team-${t.id}`}
            disabled={remove.isPending}
            onClick={() => {
              if (window.confirm(m.admin_delete_team_confirm({ team: t.name }))) remove.mutate(t.id);
            }}
          >
            {m.admin_delete_team()}
          </Button>
        </div>
      ))}
    </section>
  );
}

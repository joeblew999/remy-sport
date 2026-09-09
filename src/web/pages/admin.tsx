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
 * hook on — the testids, and the `data-held` attribute the permission grid is
 * asserted against — is preserved, which is what makes the port checkable: the
 * tests written for the implementation being replaced still pass against the
 * replacement.
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
import { useAccounts, useAdminAction, useDevAccounts, useRequestCode, useVerifyCode, clearDevCode, codeFromOutbox, signOutSilently } from "../lib/auth";
import { useSession } from "../lib/session";
import { useCan, useTeams } from "../lib/data";
import { STORED_ROLE } from "../../domain/vocabularies";
import type { Route } from "../lib/router";
import { Muted, PageHeader, PageInner } from "../components/page";
import { EmptyState, Loading } from "../components/states";
import { Alert, AlertAction, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

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
 * A delete that asks first, as the registry's AlertDialog in the reader's
 * language. The description names what goes with the row — a player's
 * guardians, a team's history — because agreeing to delete one is not the
 * same as agreeing to delete the other.
 */
function ConfirmDelete({ label, description, onConfirm, disabled, "data-testid": testId }: {
  label: string; description: string; onConfirm: () => void; disabled?: boolean; "data-testid": string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <Button variant="outline" data-testid={testId} disabled={disabled} onClick={() => setOpen(true)}>{label}</Button>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{label}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{m.cancel()}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" data-testid={`confirm-${testId}`} onClick={() => { setOpen(false); onConfirm(); }}>{label}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * There is no role→permission table here any more.
 *
 * There was one, and its docstring said it was "for display only — it is not
 * what decides anything". Twenty lines further down it decided two things:
 * whether the create form appeared, and whether a Delete button did. Beside the
 * second it also tested `e.organizerUserId === user.id`, which is the OWNER
 * relation reimplemented in a component.
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
   * The model's answer, not a role string read in the browser. `role` survives
   * below only for display — showing a person what they are.
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
   * What the viewer may do, as the server reports it. `read` is true by
   * definition — this list is what they are reading. `update` and `delete` are
   * "on at least one event you can see", the only honest role-level reading of
   * a permission the model resolves per object.
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

  if (loading || !user) return <PageInner><Loading /></PageInner>;

  return (
    <div data-testid="admin-page">
      {impersonatedBy && (
        <Alert className="rounded-none border-x-0 border-t-0" data-testid="impersonation-banner">
          <AlertDescription>{m.impersonating_as({ email: user.email })}</AlertDescription>
          <AlertAction>
            <Button
              size="sm"
              variant="outline"
              data-testid="stop-impersonating"
              onClick={() => adminAction.mutate({ path: "stop-impersonating", body: {} })}
            >
              {m.stop_impersonating()}
            </Button>
          </AlertAction>
        </Alert>
      )}

      <PageHeader
        // "Dashboard" until Home existed; this is the console.
        title={m.home_admin()}
        sub={<>{user.name || user.email} · <Badge variant="secondary" data-testid="role-badge">{role}</Badge></>}
      />

      <PageInner className="flex flex-col gap-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader><CardTitle>{m.your_permissions()}</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-1.5" data-testid="permissions">
            {["create", "read", "update", "delete"].map((p) => (
              <Badge
                key={p}
                // `data-held` is asserted directly by the render specs. The
                // attribute is the contract, not decoration.
                variant={held[p] ? "default" : "outline"}
                className={held[p] ? undefined : "opacity-60"}
                data-held={held[p] ? "true" : "false"}
                data-testid={`perm-${p}`}
              >
                {p}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{m.events()}</CardTitle></CardHeader>
        <CardContent>
        <Table data-testid="events-table">
          <TableHeader>
            <TableRow>
              <TableHead>{m.name()}</TableHead>
              <TableHead>{m.type()}</TableHead>
              {/* A paragraph of description is a desktop column: on a phone
                  it wrapped one word per line and pushed Delete off the
                  screen. The name says which event; the description is on
                  its page. */}
              <TableHead className="hidden md:table-cell">{m.description()}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.data?.events.length ? (
              events.data.events.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="whitespace-normal font-medium">{e.name}</TableCell>
                  <TableCell><Badge variant="outline">{e.typeCode}</Badge></TableCell>
                  <TableCell className="hidden max-w-md whitespace-normal text-muted-foreground md:table-cell">{e.description || "—"}</TableCell>
                  <TableCell className="text-right">
                    {e.can.DELETE_EVENT && (
                      <Button variant="destructive" size="sm" onClick={() => deleteEvent.mutate(e.id)}>
                        {m.delete()}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground">
                  {events.isPending ? m.loading() : m.no_events_yet()}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        </CardContent>
      </Card>

      {canCreate ? (
        <CreateEvent onError={setError} />
      ) : (
        <Card className="opacity-60" data-testid="create-event-denied">
          <CardHeader>
            <CardTitle>{m.create_event()}</CardTitle>
            <CardDescription>{m.create_event_denied({ role })}</CardDescription>
          </CardHeader>
        </Card>
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
        <Card data-testid="admin-console">
          <CardHeader>
            <CardTitle>{m.accounts()}</CardTitle>
            <CardDescription>{m.accounts_note()}</CardDescription>
          </CardHeader>
          <CardContent>
          <Table data-testid="accounts-table">
            <TableHeader>
              <TableRow>
                <TableHead>{m.email_column()}</TableHead>
                <TableHead>{m.role()}</TableHead>
                <TableHead>{m.status()}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(accounts.data ?? []).map((a) => (
                <TableRow key={a.id} data-testid={`account-row-${a.email}`}>
                  <TableCell className="whitespace-normal">
                    {a.name || a.email}
                    <Muted as="div">{a.email}</Muted>
                  </TableCell>
                  <TableCell>
                    <NativeSelect
                      size="sm"
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
                        <NativeSelectOption key={r} value={r}>{r}</NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </TableCell>
                  <TableCell>
                    {/* Banned first: it is Better Auth's own flag and overrides
                        whatever the model's lifecycle says. Then the model's own
                        status, through the `userStatuses` vocabulary — ACTIVE,
                        PENDING_APPROVAL, SUSPENDED and DEACTIVATED. The pending
                        testid stays, because approval is a state with an action
                        beside it and the specs hook on it. */}
                    {a.banned ? (
                      <Badge variant="destructive" data-testid={`banned-${a.email}`}>{m.banned()}</Badge>
                    ) : (
                      <Badge
                        variant={a.statusCode === "ACTIVE" ? "secondary" : "outline"}
                        data-off={a.statusCode === "ACTIVE" ? undefined : "true"}
                        data-testid={a.statusCode === "PENDING_APPROVAL" ? `pending-${a.email}` : undefined}
                      >
                        {label("userStatuses", a.statusCode ?? "ACTIVE")}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {a.id === user.id ? (
                      <Muted as="span">{m.you()}</Muted>
                    ) : (
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          data-testid={`impersonate-${a.email}`}
                          onClick={() => adminAction.mutate({ path: "impersonate-user", body: { userId: a.id } })}
                        >
                          {m.impersonate()}
                        </Button>
                        {/* Only where it means something. APPROVE_REFEREE is
                            "approve a referee", not "set a status", so the
                            control exists exactly where the action does. */}
                        {a.statusCode === "PENDING_APPROVAL" && a.role === "referee" && (
                          <Button
                            size="sm"
                            data-testid={`approve-${a.email}`}
                            disabled={approve.isPending}
                            onClick={() => approve.mutate(a.id)}
                          >
                            {m.approve()}
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          data-testid={`ban-${a.email}`}
                          onClick={() => adminAction.mutate({ path: a.banned ? "unban-user" : "ban-user", body: { userId: a.id } })}
                        >
                          {a.banned ? m.unban() : m.ban()}
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </CardContent>
        </Card>
      )}

      <RoleSwitcher current={role} />
      </PageInner>
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
  // One per role, deliberately: this control switches ROLE, and three buttons
  // all reading "Coach" would be three ways to do the same thing. Choosing a
  // particular person is the login page's job.
  const actors = (devAccounts.data?.accounts ?? [])
    .filter((a, i, all) => all.findIndex((o) => o.role === a.role) === i)
    .map((a) => ({ ...a, label: a.role.charAt(0).toUpperCase() + a.role.slice(1) }));

  const switchTo = async (email: string) => {
    try {
      // Sign out first, and this is not optional: Better Auth refuses a
      // sign-in from a request that already carries a session cookie, so
      // switching straight from one actor to another silently does nothing.
      // Silently, because this is one step of a switch and not a sign-out.
      setStatus("Signing out…");
      await signOutSilently();

      // A code somebody else requested for this person inside the re-send
      // window would be the one read back below, already spent. Clear it,
      // the way the test helper does; see lib/auth.ts.
      setStatus("Requesting a code…");
      await clearDevCode(email);
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
    <Card>
      <CardHeader>
        <CardTitle>{m.sign_in_as_dev()}</CardTitle>
        <CardDescription data-testid="switch-status">{status}</CardDescription>
      </CardHeader>
      <CardContent>
        <ToggleGroup
          variant="outline"
          value={[current]}
          data-testid="role-switcher"
          aria-label={m.sign_in_as_dev()}
          onValueChange={(groupValue: unknown[]) => {
            const next = groupValue.at(-1);
            const actor = actors.find((a) => a.role === next);
            if (actor) void switchTo(actor.email);
          }}
        >
          {actors.map((a) => (
            <ToggleGroupItem key={a.email} value={a.role} title={a.email}>{a.label}</ToggleGroupItem>
          ))}
        </ToggleGroup>
      </CardContent>
    </Card>
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
 * they ask for a code. The role is sent explicitly and survives: the
 * `user.create.before` hook reads `u.role ?? "spectator"`, so it fills a gap
 * rather than overwriting a choice.
 */
function CreateAccount() {
  const { label } = useLocale();
  const create = useAdminAction();
  const issue = create.error ? formErrors(create.error).form : null;

  return (
    <Card data-testid="create-account">
      <CardHeader>
        <CardTitle>{m.admin_create_account()}</CardTitle>
        <CardDescription>{m.admin_create_account_sub()}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
      {issue && (
        <Alert variant="destructive" data-testid="create-account-error">
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
      </CardContent>
    </Card>
  );
}

/**
 * Removing a player, which only a platform admin may do.
 *
 * `DELETE_PLAYER` is granted to `PLATFORM_ADMIN` and to nobody else. A head
 * coach manages a squad and may not delete the people in it — so this sits here
 * rather than beside "Remove" on the roster, which is a coach's tool. Removing
 * from a squad *ends the spell*; this deletes the person. Four tables carry a
 * non-null FK to `player.id` — squads, event entries, attendance and guardians
 * — and the procedure clears them first. The confirmation names them: agreeing
 * to delete a player is not the same as agreeing to delete who was responsible
 * for them.
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
    <Card data-testid="admin-players">
      <CardHeader><CardTitle>{m.admin_players()}</CardTitle></CardHeader>
      <CardContent>
      {players.length === 0 && <EmptyState data-testid="admin-no-players">{m.admin_no_players()}</EmptyState>}
      {players.length > 0 && (
        <ItemGroup>
          {players.map((p) => (
            <Item variant="outline" size="sm" key={p.id} data-testid={`admin-player-${p.id}`}>
              <ItemContent>
                <ItemTitle>{name(p.names)}</ItemTitle>
                {/* The code is the model's, not a reader's — `label` is how every
                    other screen turns one into words, in their language. */}
                <ItemDescription>{[`#${p.jerseyNumber}`, label("positions", p.positionCode)].join(" · ")}</ItemDescription>
              </ItemContent>
              <ItemActions>
                <ConfirmDelete
                  label={m.admin_delete_player()}
                  description={m.admin_delete_player_confirm({ player: name(p.names) })}
                  disabled={remove.isPending}
                  data-testid={`delete-player-${p.id}`}
                  onConfirm={() => remove.mutate(p.id)}
                />
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
      )}
      </CardContent>
    </Card>
  );
}

/**
 * Removing a team, which only a platform admin may do.
 *
 * `DELETE_TEAM` is granted to `PLATFORM_ADMIN` alone: a head coach may edit
 * their team's profile and manage its roster, and may not delete it. It
 * cascades — the roster, the coaching staff and the event entries go with it —
 * so the confirmation names what goes rather than asking a bare "are you sure".
 */
function DeleteTeams() {
  const qc = useQueryClient();
  const { data: teams = [] } = useTeams();

  const remove = useMutation({
    mutationFn: (id: string) => api.teams.delete({ id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: orpc.teams.key() }),
  });

  return (
    <Card data-testid="admin-teams">
      <CardHeader><CardTitle>{m.admin_teams()}</CardTitle></CardHeader>
      <CardContent>
      {teams.length === 0 && <EmptyState data-testid="admin-no-teams">{m.admin_no_teams()}</EmptyState>}
      {teams.length > 0 && (
        <ItemGroup>
          {teams.map((t) => (
            <Item variant="outline" size="sm" key={t.id} data-testid={`admin-team-${t.id}`}>
              <ItemContent>
                <ItemTitle>{t.name}</ItemTitle>
                <ItemDescription>{[t.orgName, t.ageGroupLabel, t.genderLabel].filter(Boolean).join(" · ")}</ItemDescription>
              </ItemContent>
              <ItemActions>
                <ConfirmDelete
                  label={m.admin_delete_team()}
                  description={m.admin_delete_team_confirm({ team: t.name })}
                  disabled={remove.isPending}
                  data-testid={`delete-team-${t.id}`}
                  onConfirm={() => remove.mutate(t.id)}
                />
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
      )}
      </CardContent>
    </Card>
  );
}

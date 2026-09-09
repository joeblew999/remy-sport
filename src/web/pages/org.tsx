import { QueryError, isNotFound } from "../components/query-error";
import { NameTranslations, namesFrom } from "../components/name-translations";
import { Muted, PageHeader, PageInner, SectionHeading, SubHeading } from "../components/page";
import { EmptyState, Loading } from "../components/states";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "../components/button-link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronRightIcon } from "lucide-react";
/**
 * Organisations — the GUI for `/api/orgs`.
 *
 * The backend has read, profile edit and member management since the
 * organization plugin was removed; nothing reached any of it, so a school could
 * be edited only with a curl command.
 *
 * **There is no permission model in this file, deliberately.** The page does not
 * ask what the viewer's role is and does not carry a copy of the access matrix.
 * It asks the server for the member list; a 403 means "not yours" and the
 * section renders as denied. Every relation is derived upstream from the Product
 * Owner's model (`src/api/relations.ts`), and a mirror of that here is exactly
 * the second answer to "may you" that keeps drifting from the first — the same
 * objection ADR 007 raised, and what `admin.tsx`'s ROLE_PERMISSIONS is careful
 * to label display-only.
 *
 * So the shape is: try, and let the answer decide what renders.
 *
 * The same idea runs through the forms. A failed write comes back with the
 * server's own validation issues, and `getIssueMessage` puts each one under the
 * field it belongs to — so "Invalid email address" appears beneath the email
 * box rather than as a banner saying "Input validation failed". The rules are
 * the procedure's zod schema and are never restated here.
 */

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useInitial } from "../lib/initial";
import { api, orpc } from "../lib/orpc";
import { useCan, useMine, useOrg, useOrgMembers, useOrgs, useTeams } from "../lib/data";
import { useSession } from "../lib/session";
import { ORG_ROLE_CODES } from "../../domain/vocabularies";
import { routeHref } from "../lib/router";
import { formErrors } from "../lib/form-errors";
import { m } from "../lib/i18n";
import { useLocale } from "../lib/locale";

const LIST = "gap-0 divide-y overflow-hidden rounded-xl border";

/**
 * @answers VIEW_ORG, EDIT_ORG_PROFILE, INVITE_ORG_MEMBER, REMOVE_ORG_MEMBER, CREATE_TEAM
 *
 * A school or club, its people, and the teams it fields.
 */
export function OrgsPage() {
  const orgs = useOrgs();
  const { label } = useLocale();
  /**
   * Yours first, then the rest.
   *
   * The list showed every school on the platform with no way to find your own —
   * a hole found by asking, for each kind of thing a person can hold, where
   * they see *theirs*. `me.mine` has answered ORG holdings since it was written
   * and nothing read them.
   *
   * A section rather than a separate screen, and not a filter: this page's job
   * is browsing, which the model says is genuinely most of what happens here for
   * schools. Yours is the shortcut on top of it, marked so a person can see why
   * a row is there.
   */
  const { data: mine } = useMine("ORG");
  const held = new Map(mine.map((h) => [h.id, h.relation]));
  const yours = (orgs.data ?? []).filter((o) => held.has(o.id));

  return (
    <div data-testid="orgs-page">
      <PageHeader  title={m.orgs_heading()} sub={m.orgs_sub()} />
      <PageInner className="flex flex-col gap-6">
        {yours.length > 0 && (
          <section>
            <SectionHeading title={m.your_orgs()} className="mt-0" />
            <ItemGroup className={LIST} data-testid="your-orgs">
              {yours.map((o) => (
                <Item key={o.id} data-testid={`your-org-${o.id}`}>
                  <ItemContent>
                    <ItemTitle>{o.name}</ItemTitle>
                    <ItemDescription>
                      {[o.city, label("relations", held.get(o.id)!)].filter(Boolean).join(" · ")}
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <ButtonLink variant="outline" href={routeHref({ page: "org", id: o.id })}>{m.org_open()}</ButtonLink>
                  </ItemActions>
                </Item>
              ))}
            </ItemGroup>
          </section>
        )}

        {orgs.error && <QueryError error={orgs.error} retry={orgs.refetch} pending={orgs.isFetching} />}
        {orgs.isPending ? (
          <Loading>{m.loading_orgs()}</Loading>
        ) : orgs.data?.length ? (
          <ItemGroup className={LIST} data-testid="orgs-list">
            {orgs.data.map((o) => (
              <Item key={o.id} data-testid={`org-${o.id}`}>
                <ItemContent>
                  <ItemTitle>{o.name}</ItemTitle>
                  {/* What kind of organisation, in the reader's language — not
                      the slug, which is an identifier and read as one. */}
                  <ItemDescription>{[o.city, o.orgType].filter(Boolean).join(" · ")}</ItemDescription>
                </ItemContent>
                {/* "Open", not "Manage": this is everyone's list, and a visitor
                    manages nothing. The rows under "Your organisations" above
                    keep "Manage", because there the reader holds a role. */}
                <ItemActions>
                  <ButtonLink variant="outline" href={routeHref({ page: "org", id: o.id })}>{m.org_view()}</ButtonLink>
                </ItemActions>
              </Item>
            ))}
          </ItemGroup>
        ) : orgs.error ? null : (
          <EmptyState>{m.orgs_empty()}</EmptyState>
        )}
      </PageInner>
    </div>
  );
}

export function OrgPage({ id }: { id?: string }) {
  const org = useOrg(id);
  const { user } = useSession();
  // A platform grant — a coach may create a team, full stop; the school is
  // chosen on the form. It used to ride on the org row as `canCreateTeam`.
  const { data: canCreateTeam } = useCan("CREATE_TEAM");

  if (org.error && !org.data && !isNotFound(org.error)) return <PageInner><QueryError error={org.error} retry={org.refetch} pending={org.isFetching} /></PageInner>;
  if (org.isPending) return <PageInner><Loading>{m.loading_org()}</Loading></PageInner>;
  if (!org.data) return <PageInner><EmptyState data-testid="not-found">{m.not_found_org()}</EmptyState></PageInner>;

  return (
    <div data-testid="org-page">
      <PageHeader
        crumbs={[{ label: m.nav_orgs(), href: routeHref({ page: "orgs" }) }]}
        title={org.data.name}
        // City and kind, not city and slug: the slug is an identifier.
        sub={[org.data.city, org.data.orgType].filter(Boolean).join(" · ")}
      />
      <PageInner className="flex flex-col gap-6">
        <OrgProfile key={org.data.id} id={org.data.id} names={org.data.names} cityCode={org.data.cityCode} provinceCode={org.data.provinceCode} canEdit={org.data.can.EDIT_ORG_PROFILE} />
        {/* Signed-out visitors are not offered a members section at all: the
            query would 403 for a reason that has nothing to do with this org. */}
        {user && <OrgMembers id={org.data.id} />}
        {/* A school's own teams, and — for a coach — the only way to make one.
            `teams.create` was enforced and unreachable, so a team could not be
            created from the app at all. */}
        <OrgTeams orgId={org.data.id} canCreate={canCreateTeam} />
      </PageInner>
    </div>
  );
}

/**
 * The profile, editable only by someone the server says may edit it.
 *
 * `canEdit` is `can.EDIT_ORG_PROFILE` off the org itself — see src/api/orgs.ts. It is not derived
 * here from the viewer's role, which would be the copy of the access matrix
 * this file opens by refusing to keep. Before it existed, every viewer got a
 * Save button and a coach from another school got a 403 for pressing it.
 *
 * Names follow the configured locales; geography uses the model vocabularies.
 */
function OrgProfile({
  id,
  names,
  cityCode,
  provinceCode,
  canEdit,
}: {
  id: string;
  names: Record<string, string>;
  cityCode: string;
  provinceCode: string;
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const { terms, name } = useLocale();
  // The fields open with the profile as it was, and keep that after the
  // save's refetch — see lib/initial.ts. Keyed by id where rendered.
  const initial = useInitial({ names, cityCode, provinceCode });

  // No `useState` for the error: the mutation already holds it, and a copy in
  // state has to be cleared by hand on every success — which is a second place
  // for "is there an error right now" to be wrong.
  const save = useMutation({
    mutationFn: (f: FormData) => api.orgs.update({ id, names: namesFrom(f, names),
      cityCode: String(f.get("cityCode")) as Parameters<typeof api.orgs.update>[0]["cityCode"], provinceCode: String(f.get("provinceCode")) as Parameters<typeof api.orgs.update>[0]["provinceCode"] }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: orpc.orgs.key() });
    },
  });

  const saveErr = formErrors(save.error, ["names[en]"]);

  if (!canEdit) {
    return (
      <Card data-testid="org-profile">
        <CardHeader><CardTitle>{m.org_profile()}</CardTitle></CardHeader>
        <CardContent><p className="text-muted-foreground" data-testid="org-name-readonly">{names.en ?? ""}</p></CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="org-profile">
      <CardHeader><CardTitle>{m.org_profile()}</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-4">
      {save.isSuccess && (
        <Alert role="status">
          <AlertDescription>{m.org_profile_saved()}</AlertDescription>
        </Alert>
      )}
      {saveErr.form && (
        <Alert variant="destructive" data-testid="org-profile-error">
          <AlertDescription>{saveErr.form}</AlertDescription>
        </Alert>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          save.mutate(f);
        }}
      >
        <FieldGroup className="max-w-[420px]">
          <Field data-invalid={!!saveErr.field("names[en]") || undefined}>
            <FieldLabel htmlFor="org-name-en">{m.team_name_label()}</FieldLabel>
            <Input
              id="org-name-en"
              aria-invalid={!!saveErr.field("names[en]")}
              aria-describedby={saveErr.field("names[en]") ? "org-name-issue" : undefined}
              name="name"
              data-testid="org-name-input"
              defaultValue={initial.names.en ?? ""}
              required
              autoComplete="off"
            />
            {/* Bracket notation for the path into the input object: the schema takes
                `names` as a locale map, so the issue arrives at `names.en`. If that
                path ever stops matching, the message moves to `saveErr.form` above
                rather than disappearing. */}
            {saveErr.field("names[en]") && (
              <FieldError id="org-name-issue" data-testid="org-name-issue">
                {saveErr.field("names[en]")}
              </FieldError>
            )}
          </Field>
          <NameTranslations names={initial.names} id="org-name" />
          {([
            ["cityCode", "cities", m.event_city(), initial.cityCode],
            ["provinceCode", "provinces", m.province(), initial.provinceCode],
          ] as const).map(([field, vocabulary, title, value]) => (
            <Field key={field}>
              <FieldLabel htmlFor={`org-${field}`}>{title}</FieldLabel>
              <NativeSelect id={`org-${field}`} name={field} defaultValue={value}>
                {terms(vocabulary).map((term) => <NativeSelectOption key={term.code} value={term.code}>{name(term.names, term.code)}</NativeSelectOption>)}
              </NativeSelect>
            </Field>
          ))}
          <Button type="submit" data-testid="org-save" disabled={save.isPending} className="w-fit">
            {save.isPending ? m.org_saving() : m.org_save()}
          </Button>
        </FieldGroup>
      </form>
      </CardContent>
    </Card>
  );
}

function OrgMembers({ id }: { id: string }) {
  const qc = useQueryClient();
  const { label } = useLocale();
  const members = useOrgMembers(id);

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: orpc.orgs.members.key({ input: { id } }) });

  const add = useMutation({
    mutationFn: (v: { email: string; orgRoleCode: string }) =>
      api.orgs.addMember({ id, email: v.email, orgRoleCode: v.orgRoleCode as never }),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (userId: string) => api.orgs.removeMember({ id, userId }),
    onSuccess: invalidate,
  });

  // "Unknown user" is a 404 with no field issues, so it belongs at the top of
  // the section rather than under the email box.
  const addErr = formErrors(add.error, ["email"]);
  const sectionError = addErr.form ?? formErrors(remove.error).form;

  // The server's answer, not a role check. See the note at the top of the file.
  if (members.error) {
    return (
      <Card className="opacity-60" data-testid="org-members-denied">
        <CardHeader><CardTitle>{m.org_members()}</CardTitle><CardDescription>{m.org_members_denied()}</CardDescription></CardHeader>
      </Card>
    );
  }

  return (
    <>
      <Card data-testid="org-members">
        <CardHeader><CardTitle>{m.org_members()}</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4">
        {sectionError && (
          <Alert variant="destructive" data-testid="org-members-error">
            <AlertDescription>{sectionError}</AlertDescription>
          </Alert>
        )}

        <Table data-testid="members-table">
          <TableHeader>
            <TableRow>
              <TableHead>{m.org_add_member_email()}</TableHead>
              <TableHead>{m.org_role()}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.data?.length ? (
              members.data.map((mem) => (
                <TableRow key={mem.userId} data-testid={`member-row-${mem.email}`}>
                  <TableCell className="whitespace-normal">
                    {mem.name || mem.email}
                    <Muted as="div">{mem.email}</Muted>
                  </TableCell>
                  <TableCell>
                    {/* The model's name for the role, in the reader's
                        language. This printed the raw code — "ORG_ADMIN" — so
                        a Thai reader got a SCREAMING_SNAKE identifier, and the
                        `orgRoles` vocabulary that exists to name it was
                        fetched on every page load and read by nothing. */}
                    <Badge variant="outline">{label("orgRoles", mem.orgRoleCode)}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="destructive"
                      data-testid={`remove-${mem.email}`}
                      disabled={remove.isPending}
                      onClick={() => remove.mutate(mem.userId)}
                    >
                      {m.org_remove_member()}
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={3} className="text-muted-foreground">
                  {members.isPending ? m.loading() : m.org_members_empty()}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        </CardContent>
      </Card>

      {/* Its own card, like admin.tsx gives "Create event" one. Inside the
          members card the heading butted straight onto the last table row and
          read as another column header. */}
      <Card data-testid="add-member">
        <CardHeader><CardTitle>{m.org_add_member()}</CardTitle></CardHeader>
        <CardContent>
        <form
          data-testid="add-member-form"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const f = new FormData(form);
            // Cleared on success only. Resetting on submit threw away what the
            // reader typed the moment it was refused, so "Invalid email
            // address" sat under an empty box describing a value they could no
            // longer see or correct.
            add.mutate(
              { email: String(f.get("email")), orgRoleCode: String(f.get("role")) },
              { onSuccess: () => form.reset() },
            );
          }}
        >
          <FieldGroup className="max-w-[420px]">
          {/* No `type="email"`: the browser would refuse to submit and the
              server's own rule — the one that actually decides — would never
              run. The schema is the single source of what a valid address is,
              and its message is what the reader sees. */}
          <Field data-invalid={!!addErr.field("email") || undefined}>
            <FieldLabel htmlFor="add-member-email">{m.org_add_member_email()}</FieldLabel>
            <Input
              id="add-member-email"
              name="email"
              data-testid="add-member-email"
              required
              autoComplete="off"
            />
            {addErr.field("email") && (
              <FieldError data-testid="add-member-email-issue">
                {addErr.field("email")}
              </FieldError>
            )}
          </Field>
          {/* From the PO's vocabulary, not a list written out here. */}
          <Field>
            <FieldLabel htmlFor="add-member-role">{m.org_role()}</FieldLabel>
            <NativeSelect id="add-member-role" name="role" defaultValue="MEMBER">
              {ORG_ROLE_CODES.map((r) => (
                <NativeSelectOption key={r} value={r}>
                  {r}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Button type="submit" data-testid="add-member-submit" disabled={add.isPending} className="w-fit">
            {m.org_add_member_submit()}
          </Button>
          </FieldGroup>
        </form>
        </CardContent>
      </Card>
    </>
  );
}

/**
 * A school's teams, and adding one.
 *
 * The list is filtered from `teams.list` rather than fetched per org: the whole
 * list is already in the cache for the teams page, it is small, and a second
 * endpoint returning a subset of it would be a second thing to keep correct.
 *
 * `canCreate` is `CREATE_TEAM`, which the PO grants to ANY_COACH with no
 * relation to any organisation — so this is "may you create a team", not "may
 * you create one *here*". The org is chosen by being on this page. That is the
 * model's shape and not this file's decision; if creating for another school
 * should require membership, the grant is where that changes.
 */
function OrgTeams({
  orgId,
  canCreate,
}: {
  orgId: string;
  canCreate: boolean;
}) {
  const qc = useQueryClient();
  const { terms, name } = useLocale();
  const { data: teams = [], isPending } = useTeams();
  const [created, setCreated] = useState(false);

  const mine = teams.filter((t) => t.orgId === orgId);

  const add = useMutation({
    mutationFn: (v: { name: string; ageGroupCode: string; genderCode: string }) =>
      api.teams.create({
        orgId,
        names: { en: v.name },
        ageGroupCode: v.ageGroupCode as never,
        genderCode: v.genderCode as never,
      }),
    onSuccess: () => {
      setCreated(true);
      qc.invalidateQueries({ queryKey: orpc.teams.key() });
      setTimeout(() => setCreated(false), 2000);
    },
  });

  const err = formErrors(add.error, ["names[en]"]);

  return (
    <Card data-testid="org-teams">
      <CardHeader><CardTitle>{m.org_teams()}</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-4">
      {isPending && <Loading />}
      {!isPending && mine.length === 0 && <EmptyState data-testid="org-no-teams">{m.org_no_teams()}</EmptyState>}
      {mine.length > 0 && (
        <ItemGroup className={LIST}>
          {mine.map((t) => (
            <Item key={t.id} data-testid={`org-team-${t.id}`} render={<a href={routeHref({ page: "team", id: t.id })} />}>
              <ItemContent>
                <ItemTitle>{t.name}</ItemTitle>
                <ItemDescription>{t.ageGroupLabel} · {t.genderLabel}</ItemDescription>
              </ItemContent>
              <ChevronRightIcon className="size-4 text-muted-foreground" aria-hidden />
            </Item>
          ))}
        </ItemGroup>
      )}

      {canCreate && (
        <section className="flex flex-col gap-4">
          <SubHeading>{m.org_add_team()}</SubHeading>
          {created && (
            <Alert role="status" data-testid="org-team-created">
              <AlertDescription>{m.org_team_created()}</AlertDescription>
            </Alert>
          )}
          {err.form && (
            <Alert variant="destructive" data-testid="org-team-error">
              <AlertDescription>{err.form}</AlertDescription>
            </Alert>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const f = new FormData(form);
              add.mutate(
                {
                  name: String(f.get("name")),
                  ageGroupCode: String(f.get("ageGroupCode")),
                  genderCode: String(f.get("genderCode")),
                },
                // Cleared only on success, so a rejected name stays to be
                // corrected rather than retyped.
                { onSuccess: () => form.reset() },
              );
            }}
          >
            <FieldGroup className="max-w-[420px]">
              <Field data-invalid={!!err.field("names[en]") || undefined}>
                <FieldLabel htmlFor="new-team-name">{m.team_name_label()}</FieldLabel>
                <Input
                  id="new-team-name"
                  name="name"
                  data-testid="new-team-name"
                  required
                  autoComplete="off"
                />
                {err.field("names[en]") && (
                  <FieldError data-testid="new-team-name-issue">
                    {err.field("names[en]")}
                  </FieldError>
                )}
              </Field>

              <Field>
                <FieldLabel htmlFor="new-team-age">{m.team_age_label()}</FieldLabel>
                <NativeSelect id="new-team-age" name="ageGroupCode" data-testid="new-team-age">
                  {terms("ageGroups").map((a) => (
                    <NativeSelectOption key={a.code} value={a.code}>{name(a.names, a.code)}</NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>

              <Field>
                <FieldLabel htmlFor="new-team-gender">{m.team_gender_label()}</FieldLabel>
                <NativeSelect id="new-team-gender" name="genderCode" data-testid="new-team-gender">
                  {terms("genders").map((g) => (
                    <NativeSelectOption key={g.code} value={g.code}>{name(g.names, g.code)}</NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>

              <Button type="submit" data-testid="create-team" disabled={add.isPending} className="w-fit">
                {add.isPending ? m.event_saving() : m.org_add_team()}
              </Button>
            </FieldGroup>
          </form>
        </section>
      )}
      </CardContent>
    </Card>
  );
}

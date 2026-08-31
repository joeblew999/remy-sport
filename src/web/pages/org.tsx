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
 *
 * Deliberately NOT oRPC's `RequestValidationPlugin`, which would validate the
 * same rules *before* the request: it takes a runtime contract router, and this
 * repo removed its contract on purpose (see src/api/domain.ts). Reinstating one
 * would put the schemas in the browser bundle, which is exactly what
 * lib/orpc.ts's `import type` avoids.
 */

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, orpc } from "../lib/orpc";
import { useOrg, useOrgMembers, useOrgs, useTeams } from "../lib/data";
import { useSession } from "../lib/session";
import { ORG_ROLE_CODES } from "../../domain/vocabularies";
import type { Route } from "../lib/router";
import { formErrors } from "../lib/form-errors";
import { m } from "../lib/i18n";
import { useLocale } from "../lib/locale";

export function OrgsPage({ goto }: { goto: (r: Route) => void }) {
  const orgs = useOrgs();

  return (
    <div className="page-inner" data-testid="orgs-page">
      <div className="page-header">
        <div className="crumbs">{m.nav_orgs()}</div>
        <h1>{m.orgs_heading()}</h1>
        <div className="sub">{m.orgs_sub()}</div>
      </div>

      {orgs.isPending ? (
        <div className="empty">{m.loading_orgs()}</div>
      ) : orgs.data?.length ? (
        <div className="dash-card" data-testid="orgs-list">
          {orgs.data.map((o) => (
            <div key={o.id} className="device-row" data-testid={`org-${o.id}`}>
              <div>
                <div className="device-label">{o.name}</div>
                <div className="device-meta">{[o.city, o.slug].filter(Boolean).join(" · ")}</div>
              </div>
              <button className="btn" onClick={() => goto({ page: "org", id: o.id })}>
                {m.org_open()}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty">{m.orgs_empty()}</div>
      )}
    </div>
  );
}

export function OrgPage({ id, goto }: { id?: string; goto: (r: Route) => void }) {
  const org = useOrg(id);
  const { user } = useSession();

  if (org.isPending) return <div className="empty">{m.loading_org()}</div>;
  if (!org.data) return <div className="empty">{m.not_found_org()}</div>;

  return (
    <div className="page-inner" data-testid="org-page">
      <div className="page-header">
        <div className="crumbs">{m.nav_orgs()}</div>
        <h1>{org.data.name}</h1>
        <div className="sub">{[org.data.city, org.data.slug].filter(Boolean).join(" · ")}</div>
      </div>

      <OrgProfile id={org.data.id} names={org.data.names} canEdit={org.data.canEdit} />
      {/* Signed-out visitors are not offered a members section at all: the
          query would 403 for a reason that has nothing to do with this org. */}
      {user && <OrgMembers id={org.data.id} />}
      {/* A school's own teams, and — for a coach — the only way to make one.
          `teams.create` was enforced and unreachable, so a team could not be
          created from the app at all. */}
      <OrgTeams
        orgId={org.data.id}
        canCreate={org.data.canCreateTeam}
        goto={goto}
      />

      <div className="event-actions" style={{ marginTop: 16 }}>
        <button className="btn" onClick={() => goto({ page: "orgs" })}>
          ← {m.orgs_heading()}
        </button>
      </div>
    </div>
  );
}

/**
 * The profile, editable only by someone the server says may edit it.
 *
 * `canEdit` comes off the org itself — see src/api/orgs.ts. It is not derived
 * here from the viewer's role, which would be the copy of the access matrix
 * this file opens by refusing to keep. Before it existed, every viewer got a
 * Save button and a coach from another school got a 403 for pressing it.
 *
 * Only `names.en` is offered. The column is a locale map and the API takes the
 * whole thing, but a two-field form here would quietly imply that English and
 * Thai are the languages this product has — `ALL_LOCALES` decides that, and it
 * has three. Editing the rest is a localisation surface, not a profile form.
 */
function OrgProfile({
  id,
  names,
  canEdit,
}: {
  id: string;
  names: Record<string, string>;
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const [saved, setSaved] = useState(false);

  if (!canEdit) {
    return (
      <section className="admin-card" data-testid="org-profile">
        <h2>{m.org_profile()}</h2>
        <p className="muted" data-testid="org-name-readonly">{names.en ?? ""}</p>
      </section>
    );
  }

  // No `useState` for the error: the mutation already holds it, and a copy in
  // state has to be cleared by hand on every success — which is a second place
  // for "is there an error right now" to be wrong.
  const save = useMutation({
    mutationFn: (en: string) => api.orgs.update({ id, names: { ...names, en } }),
    onSuccess: () => {
      setSaved(true);
      qc.invalidateQueries({ queryKey: orpc.orgs.key() });
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const saveErr = formErrors(save.error, ["names[en]"]);

  return (
    <section className="admin-card" data-testid="org-profile">
      <h2>{m.org_profile()}</h2>
      {saved && <div className="admin-ok">{m.org_profile_saved()}</div>}
      {saveErr.form && (
        <div className="admin-error" data-testid="org-profile-error">{saveErr.form}</div>
      )}
      <form
        className="admin-form"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          save.mutate(String(f.get("name")));
        }}
      >
        <input
          name="name"
          data-testid="org-name-input"
          defaultValue={names.en ?? ""}
          required
          autoComplete="off"
        />
        {/* Bracket notation for the path into the input object: the schema takes
            `names` as a locale map, so the issue arrives at `names.en`. If that
            path ever stops matching, the message moves to `saveErr.form` above
            rather than disappearing. */}
        {saveErr.field("names[en]") && (
          <p className="admin-error small" data-testid="org-name-issue">
            {saveErr.field("names[en]")}
          </p>
        )}
        <button type="submit" data-testid="org-save" disabled={save.isPending}>
          {save.isPending ? m.org_saving() : m.org_save()}
        </button>
      </form>
    </section>
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
      <section className="admin-card dim" data-testid="org-members-denied">
        <h2>{m.org_members()}</h2>
        <p className="muted">{m.org_members_denied()}</p>
      </section>
    );
  }

  return (
    <>
      <section className="admin-card" data-testid="org-members">
        <h2>{m.org_members()}</h2>
        {sectionError && (
          <div className="admin-error" data-testid="org-members-error">{sectionError}</div>
        )}

        <table className="admin-table" data-testid="members-table">
          <thead>
            <tr>
              <th>{m.org_add_member_email()}</th>
              <th>{m.org_role()}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {members.data?.length ? (
              members.data.map((mem) => (
                <tr key={mem.userId} data-testid={`member-row-${mem.email}`}>
                  <td>
                    {mem.name || mem.email}
                    <div className="muted small">{mem.email}</div>
                  </td>
                  <td>
                    {/* The model's name for the role, in the reader's
                        language. This printed the raw code — "ORG_ADMIN" — so
                        a Thai reader got a SCREAMING_SNAKE identifier, and the
                        `orgRoles` vocabulary that exists to name it was
                        fetched on every page load and read by nothing. */}
                    <span className="badge badge-outline">{label("orgRoles", mem.orgRoleCode)}</span>
                  </td>
                  <td>
                    <button
                      className="danger"
                      data-testid={`remove-${mem.email}`}
                      disabled={remove.isPending}
                      onClick={() => remove.mutate(mem.userId)}
                    >
                      {m.org_remove_member()}
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={3} className="muted">
                  {members.isPending ? m.loading() : m.org_members_empty()}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {/* Its own card, like admin.tsx gives "Create event" one. Inside the
          members card the heading butted straight onto the last table row and
          read as another column header. */}
      <section className="admin-card" data-testid="add-member">
        <h2>{m.org_add_member()}</h2>
        <form
          className="admin-form"
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
          {/* No `type="email"`: the browser would refuse to submit and the
              server's own rule — the one that actually decides — would never
              run. The schema is the single source of what a valid address is,
              and its message is what the reader sees. */}
          <input
            name="email"
            data-testid="add-member-email"
            placeholder={m.org_add_member_email()}
            required
            autoComplete="off"
          />
          {addErr.field("email") && (
            <p className="admin-error small" data-testid="add-member-email-issue">
              {addErr.field("email")}
            </p>
          )}
          {/* From the PO's vocabulary, not a list written out here. */}
          <select name="role" defaultValue="MEMBER">
            {ORG_ROLE_CODES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <button type="submit" data-testid="add-member-submit" disabled={add.isPending}>
            {m.org_add_member_submit()}
          </button>
        </form>
      </section>
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
  goto,
}: {
  orgId: string;
  canCreate: boolean;
  goto: (r: Route) => void;
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
    <section className="admin-card" style={{ marginTop: 24 }} data-testid="org-teams">
      <h2>{m.org_teams()}</h2>
      {isPending && <div className="empty">{m.loading()}</div>}
      {!isPending && mine.length === 0 && (
        <div className="empty" data-testid="org-no-teams">{m.org_no_teams()}</div>
      )}
      {mine.map((t) => (
        <button
          key={t.id}
          className="row-button"
          data-testid={`org-team-${t.id}`}
          onClick={() => goto({ page: "team", id: t.id })}
        >
          <div className="row-title">{t.name}</div>
          <div className="row-meta">{t.ageGroupCode} · {t.genderLabel}</div>
        </button>
      ))}

      {canCreate && (
        <>
          <h2 style={{ marginTop: 24 }}>{m.org_add_team()}</h2>
          {created && <div className="admin-ok" data-testid="org-team-created">{m.org_team_created()}</div>}
          {err.form && <div className="admin-error" data-testid="org-team-error">{err.form}</div>}
          <form
            className="admin-form"
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
            <label htmlFor="new-team-name">{m.team_name_label()}</label>
            <input
              id="new-team-name"
              name="name"
              data-testid="new-team-name"
              required
              autoComplete="off"
            />
            {err.field("names[en]") && (
              <p className="admin-error small" data-testid="new-team-name-issue">
                {err.field("names[en]")}
              </p>
            )}

            <label htmlFor="new-team-age">{m.team_age_label()}</label>
            <select id="new-team-age" name="ageGroupCode" data-testid="new-team-age">
              {terms("ageGroups").map((a) => (
                <option key={a.code} value={a.code}>{name(a.names, a.code)}</option>
              ))}
            </select>

            <label htmlFor="new-team-gender">{m.team_gender_label()}</label>
            <select id="new-team-gender" name="genderCode" data-testid="new-team-gender">
              {terms("genders").map((g) => (
                <option key={g.code} value={g.code}>{name(g.names, g.code)}</option>
              ))}
            </select>

            <button type="submit" data-testid="create-team" disabled={add.isPending}>
              {add.isPending ? m.event_saving() : m.org_add_team()}
            </button>
          </form>
        </>
      )}
    </section>
  );
}

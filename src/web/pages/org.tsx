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
 */

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, orpc } from "../lib/orpc";
import { useOrg, useOrgMembers, useOrgs } from "../lib/data";
import { useSession } from "../lib/session";
import { ORG_ROLE_CODES } from "../../domain/vocabularies";
import type { Route } from "../lib/router";
import { m } from "../lib/i18n";

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

      <OrgProfile id={org.data.id} names={org.data.names} />
      {/* Signed-out visitors are not offered a members section at all: the
          query would 403 for a reason that has nothing to do with this org. */}
      {user && <OrgMembers id={org.data.id} />}

      <div className="event-actions" style={{ marginTop: 16 }}>
        <button className="btn" onClick={() => goto({ page: "orgs" })}>
          ← {m.orgs_heading()}
        </button>
      </div>
    </div>
  );
}

/**
 * The profile edit.
 *
 * Only `names.en` is offered. The column is a locale map and the API takes the
 * whole thing, but a two-field form here would quietly imply that English and
 * Thai are the languages this product has — `ALL_LOCALES` decides that, and it
 * has three. Editing the rest is a localisation surface, not a profile form.
 */
function OrgProfile({ id, names }: { id: string; names: Record<string, string> }) {
  const qc = useQueryClient();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (en: string) => api.orgs.update({ id, names: { ...names, en } }),
    onSuccess: () => {
      setError(null);
      setSaved(true);
      qc.invalidateQueries({ queryKey: orpc.orgs.key() });
      setTimeout(() => setSaved(false), 2000);
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <section className="admin-card" data-testid="org-profile">
      <h2>{m.org_profile()}</h2>
      {saved && <div className="admin-ok">{m.org_profile_saved()}</div>}
      {error && <div className="admin-error" data-testid="org-profile-error">{error}</div>}
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
        <button type="submit" data-testid="org-save" disabled={save.isPending}>
          {save.isPending ? m.org_saving() : m.org_save()}
        </button>
      </form>
    </section>
  );
}

function OrgMembers({ id }: { id: string }) {
  const qc = useQueryClient();
  const members = useOrgMembers(id);
  const [error, setError] = useState<string | null>(null);

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: orpc.orgs.members.key({ input: { id } }) });

  const add = useMutation({
    mutationFn: (v: { email: string; orgRoleCode: string }) =>
      api.orgs.addMember({ id, email: v.email, orgRoleCode: v.orgRoleCode as never }),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError: (e: Error) => setError(e.message),
  });

  const remove = useMutation({
    mutationFn: (userId: string) => api.orgs.removeMember({ id, userId }),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError: (e: Error) => setError(e.message),
  });

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
        {error && <div className="admin-error" data-testid="org-members-error">{error}</div>}

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
                    <span className="badge badge-outline">{mem.orgRoleCode}</span>
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
            const f = new FormData(e.currentTarget);
            add.mutate({ email: String(f.get("email")), orgRoleCode: String(f.get("role")) });
            e.currentTarget.reset();
          }}
        >
          <input
            name="email"
            type="email"
            data-testid="add-member-email"
            placeholder={m.org_add_member_email()}
            required
            autoComplete="off"
          />
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

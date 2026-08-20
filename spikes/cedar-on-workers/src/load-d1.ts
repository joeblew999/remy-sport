// Loader A: fresh D1 batch per check. No cache. Pessimistic baseline.
import type { D1Database } from "@cloudflare/workers-types";

type EntityJson = { uid: { type: string; id: string }; attrs: any; parents: { type: string; id: string }[] };

async function loadUser(db: D1Database, userId: string): Promise<EntityJson> {
  const row = await db.prepare(`SELECT role_code FROM users WHERE id = ?`).bind(userId).first<{ role_code: string }>();
  const parents: EntityJson["parents"] = [];
  if (row?.role_code) parents.push({ type: "PlatformRole", id: roleSlug(row.role_code) });
  return { uid: { type: "User", id: userId }, attrs: {}, parents };
}

async function loadEvent(db: D1Database, eventId: string): Promise<EntityJson | null> {
  const [evRes, coRes] = await db.batch([
    db.prepare(`SELECT id, type_code, organizer_user_id FROM events WHERE id = ?`).bind(eventId),
    db.prepare(`SELECT user_id FROM event_co_organizers WHERE event_id = ?`).bind(eventId),
  ]);
  const ev = evRes.results[0] as any;
  if (!ev) return null;
  const cos = (coRes.results as any[]).map((r) => ({ __entity: { type: "User", id: r.user_id } }));
  return {
    uid: { type: "Event", id: ev.id },
    attrs: {
      type: ev.type_code,
      owners: [{ __entity: { type: "User", id: ev.organizer_user_id } }],
      co_organizers: cos,
    },
    parents: [],
  };
}

async function loadTeam(db: D1Database, teamId: string): Promise<EntityJson | null> {
  const row = await db.prepare(
    `SELECT user_id, coach_role_code FROM team_coaches WHERE team_id = ?`
  ).bind(teamId).all<{ user_id: string; coach_role_code: string }>();
  if (!row.results.length) {
    const t = await db.prepare(`SELECT id FROM teams WHERE id = ?`).bind(teamId).first<{ id: string }>();
    if (!t) return null;
  }
  const heads = row.results.filter((r) => r.coach_role_code === "HEAD")
    .map((r) => ({ __entity: { type: "User", id: r.user_id } }));
  const assistants = row.results.filter((r) => r.coach_role_code === "ASSISTANT")
    .map((r) => ({ __entity: { type: "User", id: r.user_id } }));
  const managers = row.results.filter((r) => r.coach_role_code === "MANAGER")
    .map((r) => ({ __entity: { type: "User", id: r.user_id } }));
  return {
    uid: { type: "Team", id: teamId },
    attrs: { head_coachs: heads, assistant_coachs: assistants, team_managers: managers },
    parents: [],
  };
}

const roleSlug = (code: string) =>
  code === "ADMIN" ? "admin" : code === "ORGANIZER" ? "organizer" :
  code === "COACH" ? "coach" : code === "PLAYER"    ? "player" :
  code === "REFEREE" ? "referee" : "spectator";

const PLATFORM_ROLES: EntityJson[] = ["admin","organizer","coach","player","referee","spectator"].map(
  (id) => ({ uid: { type: "PlatformRole", id }, attrs: {}, parents: [] }),
);

export async function loadEntitiesD1(
  db: D1Database,
  principal: { type: "User"; id: string },
  resource: { type: "Event" | "Team" | "Platform"; id: string },
): Promise<EntityJson[]> {
  const user = await loadUser(db, principal.id);
  const entities: EntityJson[] = [user, ...PLATFORM_ROLES];
  if (resource.type === "Event") {
    const ev = await loadEvent(db, resource.id);
    if (ev) entities.push(ev);
  } else if (resource.type === "Team") {
    const team = await loadTeam(db, resource.id);
    if (team) entities.push(team);
  }
  return entities;
}

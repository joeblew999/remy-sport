import { Icon } from "../components/icon";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, orpc } from "../lib/orpc";
import { useRoster, useTeam, useTeams } from "../lib/data";
import type { Route } from "../lib/router";
import { m } from "../lib/i18n";
import { formErrors } from "../lib/form-errors";

interface ScheduleRow {
  date: string;
  vs: string;
  sa: number | string | null;
  sb: number | string | null;
  w?: boolean | null;
  live?: boolean;
  type: string;
}

export function TeamPage({ id, goto }: { id?: string; goto: (r: Route) => void }) {
  // The sidebar's "My team" links to #/team with no id. Until the SPA knows who
  // is signed in (ADR 008 step 4) there is no "my", so it falls back to the
  // first team — the same fallback #/event uses.
  const { data: team, isPending: teamLoading } = useTeam(id);
  const { data: allTeams, isPending: listLoading } = useTeams();
  const { data: roster } = useRoster(id);

  const t = id ? team : allTeams?.[0];

  if (id ? teamLoading : listLoading) {
    return <div className="empty">{m.loading_team()}</div>;
  }
  if (!t) {
    return (
      <div className="empty">
        <p>{m.not_found_team()}</p>
        <button onClick={() => goto({ page: "discover" })}>{m.back_to_discover()}</button>
      </div>
    );
  }
  const schedule: ScheduleRow[] = [
    { date: "May 4", vs: "Triam Udom", sa: 71, sb: 64, w: true, type: "BSL" },
    { date: "May 7", vs: "Mater Dei", sa: 82, sb: 51, w: true, type: "BSL" },
    { date: "May 9", vs: "ISB", sa: 64, sb: 70, w: false, type: "BSL" },
    { date: "May 12", vs: "Suankularb", sa: 71, sb: 54, w: true, type: "CUP · R16" },
    { date: "May 13", vs: "Assumption", sa: "54", sb: "49", w: null, live: true, type: "CUP · QF" },
    { date: "May 14", vs: "TBA", sa: null, sb: null, type: "CUP · SF" },
    { date: "May 18", vs: "Bangkok Christian", sa: null, sb: null, type: "BSL" },
  ];
  return (
    <>
      <div className="team-hero">
        <div className={`crest ${t.crest}`}></div>
        <div>
          <h1 data-testid="team-name">{t.name}</h1>
          <div className="meta thai" style={{ fontFamily: "Noto Sans Thai, sans-serif", fontSize: 16, color: "var(--ink-2)", marginTop: 4 }}>
            {[t.orgName, t.city].filter(x => x && x !== "—").join(" · ")}
          </div>
          <div className="meta">{t.ageGroupCode} {t.genderLabel} · {t.short}</div>
          <div className="event-actions" style={{ marginTop: 16 }}>
            <button className="btn primary"><Icon name="follow"/>{m.follow()}</button>
            <button className="btn">{m.roster()}</button>
            <button className="btn">{m.stats()}</button>
            <button className="btn">{m.schedule()}</button>
          </div>
        </div>
        {/* RECORD and RANK need played games and a standings table. Both are
            roadmap Phase 3 (ADR 008) — showing "4–0 · #2" against a real team
            would read as fact rather than as the placeholder it is. */}
        <div style={{ display: "flex", gap: 32, alignItems: "baseline" }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.14em", textTransform: "uppercase" }}>{m.record()}</div>
            <div style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: 32, letterSpacing: "-0.02em", color: "var(--ink-3)" }}>{t.record ?? "—"}</div>
          </div>
        </div>
      </div>

      <div className="page-inner">
        {/* Real players now — `player` and `playerTeam`, current spells only.
            No per-game averages: the fixture this replaced showed points,
            assists and rebounds per person and there is no stats table, so they
            are absent rather than invented a second time. */}
        <div className="section-h"><h2>{m.roster()}</h2></div>
        {roster?.players.length ? (
          <div className="roster-grid" data-testid="roster">
            {roster.players.map(p => (
              <div key={p.playerId} className="player-card" data-testid={`player-${p.playerId}`}>
                <div className="ava">{p.name.split(" ").map(x => x[0]).join("")}</div>
                <div>
                  <div className="name">{p.name}</div>
                  <div className="pos">{p.position}</div>
                </div>
                <div className="num">{p.jerseyNumber}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty" data-testid="roster-empty">{m.roster_empty()}</div>
        )}

        {/* Only for someone the server says may manage this squad — a head or
            assistant coach, or the team's manager. MANAGE_ROSTER, asked per
            team, not worked out from the viewer's role. */}
        {roster?.canManage && id && <ManageRoster teamId={id} roster={roster}/>}

        <div className="section-h" style={{ marginTop: 48 }}><h2>{m.schedule()}</h2><a className="more">{m.sample_data()}</a></div>
        <div className="dash-card">
          {schedule.map((g, i) => (
            <div key={i} className={`fixture-row${g.live ? " live" : ""}`}>
              <span className="date">{g.date}</span>
              <span className="opponent">{m.versus()} <b>{g.vs}</b></span>
              <span className="kind">{g.type}</span>
              <span className="result">
                {g.sa !== null ? `${g.sa}–${g.sb}` : <span className="muted">—</span>}
              </span>
              <span
                className="outcome"
                style={{
                  color: g.live ? "var(--live)" : g.w === true ? "var(--good)" : "var(--ink-3)",
                  fontWeight: g.live || g.w === true ? 500 : 400,
                }}
              >
                {g.live ? m.status_live() : g.w === true ? m.col_won() : g.w === false ? m.col_lost() : m.status_upcoming()}
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}


type Roster = NonNullable<ReturnType<typeof useRoster>["data"]>;

/**
 * Adding and removing players.
 *
 * Whole-form errors only: the form is a select and a button, so a validation
 * issue has no field to sit under. "Unknown player" and a 403 are the failures
 * this can produce, and both belong at the top.
 *
 * Removing *ends the spell* rather than deleting it — `playerTeam` carries from
 * and to dates, and the TEAM_PLAYER relation reads `to_date`, so a departure
 * stops granting access without making last season's team sheet wrong. The
 * button therefore says "remove from squad", not "delete".
 */
function ManageRoster({ teamId, roster }: { teamId: string; roster: Roster }) {
  const qc = useQueryClient();
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: orpc.teams.roster.key({ input: { teamId } }) });

  const add = useMutation({
    mutationFn: (playerId: string) => api.teams.addPlayer({ teamId, playerId }),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (playerId: string) => api.teams.removePlayer({ teamId, playerId }),
    onSuccess: invalidate,
  });
  const error = add.error ?? remove.error;

  return (
    <section className="admin-card" style={{ marginTop: 24 }} data-testid="manage-roster">
      <h2>{m.manage_roster()}</h2>
      {/* formErrors, not `error.message`: the raw message is the Worker's own
          English ("Not found"), which reached a Thai reader verbatim. */}
      {formErrors(error).form && (
        <div className="admin-error" data-testid="roster-error">{formErrors(error).form}</div>
      )}

      {roster.players.length > 0 && (
        <table className="admin-table" data-testid="roster-table">
          <tbody>
            {roster.players.map((p) => (
              <tr key={p.playerId}>
                <td>{p.name}</td>
                <td className="muted">{p.position}</td>
                <td>
                  <button
                    className="danger"
                    data-testid={`remove-player-${p.playerId}`}
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(p.playerId)}
                  >
                    {m.remove_from_squad()}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {roster.available.length ? (
        <form
          className="admin-form"
          data-testid="add-player-form"
          onSubmit={(e) => {
            e.preventDefault();
            add.mutate(String(new FormData(e.currentTarget).get("player")));
          }}
        >
          <select name="player" data-testid="add-player-select">
            {roster.available.map((p) => (
              <option key={p.playerId} value={p.playerId}>
                {p.jerseyNumber} · {p.name}
              </option>
            ))}
          </select>
          <button type="submit" data-testid="add-player-submit" disabled={add.isPending}>
            {m.add_to_squad()}
          </button>
        </form>
      ) : (
        <p className="muted" data-testid="no-available-players">{m.everyone_on_squad()}</p>
      )}
    </section>
  );
}

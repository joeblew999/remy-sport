import { NewPlayer } from "../components/new-player";
import { NameTranslations, namesFrom } from "../components/name-translations";
import { Can, PlatformCan } from "../components/can";
import { useState } from "react";
import { FollowButton } from "../components/follow";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, orpc } from "../lib/orpc";
import { useRoster, useTeam, useTeamGames } from "../lib/data";
import type { Route } from "../lib/router";
import { m } from "../lib/i18n";
import { useLocale } from "../lib/locale";
import { useSession } from "../lib/session";
import { formatDayShort } from "../lib/dates";
import { formErrors } from "../lib/form-errors";
import type { Team } from "../data";

/**
 * @answers VIEW_TEAM, EDIT_TEAM_PROFILE, MANAGE_ROSTER, CREATE_PLAYER
 *
 * A team as its coach and its followers see it. The roster is where a player
 * is created, because that is the moment somebody needs one.
 */
/**
 * One team, by id. Which teams are *yours* is Home's question, answered from
 * `me.mine`; `#/team` with no id renders the directory. This page used to
 * guess at "your team" from a list when it had no id, and guessed wrong.
 */
export function TeamPage({ id, goto }: { id: string; goto: (r: Route) => void }) {
  const { data: t, isPending: teamLoading } = useTeam(id);
  const { data: roster } = useRoster(id);
  const { locale, label } = useLocale();
  const { user } = useSession();
  const { data: teamGames, isPending: gamesLoading } = useTeamGames(id);
  const games = teamGames?.games ?? [];
  const wins = games.filter((g) => g.won === true).length;
  const losses = games.filter((g) => g.won === false).length;

  if (teamLoading) {
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
  return (
    <>
      <div className="team-hero">
        <div className={`crest ${t.crest}`}></div>
        <div>
          <h1 data-testid="team-name">{t.name}</h1>
          <div className="meta thai" style={{ fontFamily: "Noto Sans Thai, sans-serif", fontSize: 16, color: "var(--ink-2)", marginTop: 4 }}>
            {[t.orgName, t.city].filter(x => x && x !== "—").join(" · ")}
          </div>
          <div className="meta">{t.ageGroupLabel} {t.genderLabel} · {t.short}</div>
          <div className="event-actions" style={{ marginTop: 16 }}>
            {t.id && <FollowButton objectTypeCode="TEAM" objectId={t.id} />}
            {/* These three were `<button className="btn">` with no onClick —
                dead controls beside a working Follow, which is worse than no
                control at all: pressing one and getting nothing reads as the
                app being broken.

                Roster and Schedule are real sections further down this page, so
                they scroll to them. Stats is gone: there is no per-player
                statistics table anywhere in the model, which is the same reason
                this page shows no averages. */}
            <a className="btn" href="#roster">{m.roster()}</a>
            <a className="btn" href="#team-schedule">{m.schedule()}</a>
          </div>
        </div>
        {/* The record is the schedule below, counted: wins and losses among
            the games that have a score, from this team's end. It was a dash
            while the games table did not exist and "4–0" would have been an
            invention; the same page now lists five results with W and L
            beside them, and a dash above those read as broken. A dash stays
            for a team that has not played. There is still no RANK: that is a
            standings question, and it is answered on the event page. */}
        <div style={{ display: "flex", gap: 32, alignItems: "baseline" }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.14em", textTransform: "uppercase" }}>{m.record()}</div>
            <div
              data-testid="team-record"
              style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: 32, letterSpacing: "-0.02em", color: wins + losses ? "var(--ink)" : "var(--ink-3)" }}
            >
              {wins + losses ? `${wins}–${losses}` : "—"}
            </div>
          </div>
        </div>
      </div>

      <div className="page-inner">
        {/* Real players now — `player` and `playerTeam`, current spells only.
            No per-game averages: the fixture this replaced showed points,
            assists and rebounds per person and there is no stats table, so they
            are absent rather than invented a second time. */}
        <div className="section-h" id="roster"><h2>{m.roster()}</h2></div>
        {roster?.players.length ? (
          <div className="roster-grid" data-testid="roster">
            {roster.players.map(p => (
              <div key={p.playerId} className="player-card" data-testid={`player-${p.playerId}`}>
                <div className="ava">{p.name.split(" ").map(x => x[0]).join("")}</div>
                <div>
                  {/* The way in to the player page. The roster was the only place
                      a player appeared and there was nowhere to go from it —
                      which is why FOLLOW_PLAYER had a button nothing rendered. */}
                  <button
                    className="link-button name"
                    data-testid={`open-player-${p.playerId}`}
                    onClick={() => goto({ page: "player", id: p.playerId })}
                  >
                    {p.name}
                  </button>
                  <div className="pos">
                    {p.position}
                    {p.since && <span className="since">{m.roster_since({ date: p.since })}</span>}
                  </div>
                </div>
                <div className="num">{p.jerseyNumber}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty" data-testid="roster-empty">{m.roster_empty()}</div>
        )}

        {/* Who runs the team. `team_coaches` carried this from the day the
            fixtures were written and the page never said — a squad with no
            staff reads as a team nobody coaches. */}
        <div className="section-h" style={{ marginTop: 32 }}><h2>{m.coaching_staff()}</h2></div>
        <div className="dash-card" data-testid="coaching-staff">
          {!user && (
            <div className="empty" data-testid="coaches-signin">{m.coaching_staff_signin()}</div>
          )}
          {user && (roster?.coaches.length ?? 0) === 0 && (
            <div className="empty" data-testid="coaches-empty">{m.coaching_staff_none()}</div>
          )}
          {(roster?.coaches ?? []).map((c) => (
            <div key={c.userId} className="coach-row" data-testid={`coach-${c.userId}`}>
              <div className="ava">{c.name.split(" ").map((x) => x[0]).join("")}</div>
              <div className="row-title">{c.name}</div>
              {/* From the reference vocabulary, in the reader's language — not
                  a map of role codes written out here. */}
              <div className="row-meta">{label("coachRoles", c.coachRoleCode)}</div>
            </div>
          ))}
        </div>

        {/* `teams.update` was enforced by EDIT_TEAM_PROFILE and unreachable, so
            a team named wrong when it was created stayed named wrong. */}
        <Can of={t} action="EDIT_TEAM_PROFILE"><TeamSettings team={t}/></Can>

        {/* Only for someone the server says may manage this squad — a head or
            assistant coach, or the team's manager. MANAGE_ROSTER, asked per
            team, not worked out from the viewer's role. */}
        {id && roster && <Can of={t} action="MANAGE_ROSTER"><ManageRoster teamId={id} roster={roster}/></Can>}

        <div className="section-h" id="team-schedule" style={{ marginTop: 48 }}><h2>{m.schedule()}</h2></div>
        <div className="dash-card">
          {gamesLoading && <div className="empty">{m.loading()}</div>}
          {!gamesLoading && games.length === 0 && <div className="empty">{m.no_games_yet()}</div>}
          {games.map((g) => (
            <div key={g.id} className={`fixture-row${g.live ? " live" : ""}`}>
              <span className="date">{formatDayShort(locale, new Date(g.startsAt))}</span>
              <span className="opponent">{m.versus()} <b>{g.opponent}</b></span>
              <span className="kind">{g.venue ?? ""}</span>
              <span className="result">
                {/* Both or neither. A played game has two scores; anything else
                    is a fixture, and "61–" is not a result. */}
                {g.us !== null && g.them !== null
                  ? `${g.us}–${g.them}`
                  : <span className="muted">—</span>}
              </span>
              <span
                className="outcome"
                style={{
                  color: g.live ? "var(--live)" : g.won === true ? "var(--good)" : "var(--ink-3)",
                  fontWeight: g.live || g.won === true ? 500 : 400,
                }}
              >
                {/* The status the server stored, except where the result says
                    more than "finished" does. */}
                {g.live
                  ? m.status_live()
                  : g.won === true
                    ? m.col_won()
                    : g.won === false
                      ? m.col_lost()
                      : g.statusLabel}
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

  // `data-action`: the model action this control performs, read by
  // tests/render/who-sees-what.spec.ts to check the screen against the
  // model's grants for every relation a reader can hold on a team.
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

      <PlatformCan action="CREATE_PLAYER"><NewPlayer teamId={teamId} onCreated={invalidate} /></PlatformCan>
    </section>
  );
}

/**
 * Editing the team you coach.
 *
 * `teams.update` has been enforced by `EDIT_TEAM_PROFILE` since teams existed
 * and nothing could call it, so a team named wrong when it was created stayed
 * named wrong — and the age group and category, which decide which events it
 * can enter, could never be corrected either.
 *
 * Shown only where `can.EDIT_TEAM_PROFILE` is true, which is the model's answer for this
 * reader on this team. `orgId` is deliberately not offered: moving a team
 * between schools is a transfer, needs membership of both, and the API omits
 * it from `UpdateTeamInput` for exactly that reason. A form that offered it
 * would be a form promising something the contract refuses.
 *
 * The vocabularies come from `/api/reference`, so an age group added to the
 * model appears here without an edit — the same rule the game-status select
 * follows.
 */
function TeamSettings({ team }: { team: Team }) {
  const qc = useQueryClient();
  const { terms, name } = useLocale();
  const [saved, setSaved] = useState(false);

  const save = useMutation({
    mutationFn: (v: { names: Record<string, string>; ageGroupCode: string; genderCode: string }) =>
      api.teams.update({
        id: team.id,
        // The rest of the locale map survives — sending `{ en }` alone would
        // delete the Thai and Japanese names on the first save.
        names: v.names,
        ageGroupCode: v.ageGroupCode as never,
        genderCode: v.genderCode as never,
      }),
    onSuccess: () => {
      setSaved(true);
      qc.invalidateQueries({ queryKey: orpc.teams.key() });
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const err = formErrors(save.error, ["names[en]"]);

  return (
    <section className="admin-card" style={{ marginTop: 24 }} data-testid="team-settings">
      <h2>{m.team_settings()}</h2>
      {saved && <div className="admin-ok" data-testid="team-saved">{m.event_saved()}</div>}
      {err.form && <div className="admin-error" data-testid="team-settings-error">{err.form}</div>}

      <form
        className="admin-form"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          save.mutate({
            names: namesFrom(f, team.names),
            ageGroupCode: String(f.get("ageGroupCode")),
            genderCode: String(f.get("genderCode")),
          });
        }}
      >
        <label htmlFor="team-name">{m.team_name_label()}</label>
        <input
          id="team-name"
          name="name"
          data-testid="team-name-input"
          defaultValue={team.names.en ?? team.name}
          required
          autoComplete="off"
        />
        {err.field("names[en]") && (
          <p className="admin-error small" data-testid="team-name-issue">
            {err.field("names[en]")}
          </p>
        )}

        <NameTranslations names={team.names} id="team-name" />

        <label htmlFor="team-age">{m.team_age_label()}</label>
        <select id="team-age" name="ageGroupCode" data-testid="team-age-input" defaultValue={team.ageGroupCode}>
          {terms("ageGroups").map((a) => (
            <option key={a.code} value={a.code}>{name(a.names, a.code)}</option>
          ))}
        </select>

        <label htmlFor="team-gender">{m.team_gender_label()}</label>
        <select id="team-gender" name="genderCode" data-testid="team-gender-input" defaultValue={team.genderCode}>
          {terms("genders").map((g) => (
            <option key={g.code} value={g.code}>{name(g.names, g.code)}</option>
          ))}
        </select>

        <button type="submit" data-testid="team-save" disabled={save.isPending}>
          {save.isPending ? m.event_saving() : m.event_save()}
        </button>
      </form>
    </section>
  );
}

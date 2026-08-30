/**
 * An event's games: the schedule, the scores, and score entry for whoever may.
 *
 * Whether the score inputs appear is `game.canEnterScore`, which the server
 * computes per game from the Product Owner's grants. There is no role check
 * here and there must not be one: a referee is assigned to *this* game and not
 * the next one, so a rule in the client could only be right by accident.
 *
 * Spoiler mode hides results without hiding the fixture. Someone following a
 * tournament they have not watched yet still needs to know who is playing and
 * when — that is the difference between hiding a score and hiding a game.
 */

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, orpc } from "../lib/orpc";
import { useEntries, useGames } from "../lib/data";
import { useLocale } from "../lib/locale";
import { formErrors } from "../lib/form-errors";
import { m } from "../lib/i18n";
import type { Route } from "../lib/router";
import { formatTimeOn, fromLocalInput, toLocalInput } from "../lib/dates";

type Game = NonNullable<ReturnType<typeof useGames>["data"]>["games"][number];

/**
 * When a game starts, on a named clock, in the reader's language.
 *
 * `startsAt` is an instant in UTC. That is unambiguous and useless on its own:
 * "10:00" means nothing until it says whose ten o'clock. So this takes the zone
 * explicitly and never falls back to the machine's — a page that guesses is how
 * a coach turns up an hour late.
 *
 * The locale is the app's, not the browser's — `undefined` here meant a Thai
 * page rendered "Aug 27" because the browser was set to English.
 *
 * The calendar is not chosen here. `CALENDAR` in lib/dates.ts is, once, for
 * every date on the site — which is what makes "offer Buddhist dates" a
 * decision somebody can actually take rather than a hunt through call sites.
 *
 * Formatting goes through `Intl`, not through the date library this repo does
 * now depend on. That is not an inconsistency, it is the split described in
 * lib/dates.ts: `temporal-polyfill/fns` does arithmetic `Date` cannot do
 * correctly, and `Intl` does formatting no library should be re-shipping —
 * `date-fns-tz`'s `formatInTimeZone` is a wrapper over exactly this call.
 */
function timeOf(startsAt: string, locale: string, timeZone: string | null): string {
  const d = new Date(startsAt);
  if (Number.isNaN(d.getTime())) return "—";
  try {
    return formatTimeOn(locale, d, timeZone);
  } catch {
    // An IANA name the runtime does not know throws rather than degrading.
    // A time on the wrong clock is worse than a time with no clock named, so
    // fall back to the instant rather than to the machine's own zone.
    return d.toISOString().replace("T", " ").slice(0, 16) + " UTC";
  }
}

/** "Asia/Bangkok" reads as "Bangkok" in a line already dense with detail. */
const shortZone = (tz: string) => tz.split("/").pop()!.replace(/_/g, " ");

export function Schedule({
  eventId,
  spoiler,
  goto,
}: {
  eventId: string;
  spoiler: boolean;
  /** Optional: a schedule rendered without navigation simply offers no video. */
  goto?: (r: Route) => void;
}) {
  const games = useGames(eventId);
  // Asked once for the event, not once per game. `MANAGE_FIXTURES` is
  // EVENT-scoped, so the per-row answer was the same value twenty-eight times.
  const { data: entries } = useEntries(eventId);
  const canManage = Boolean(entries?.canManageFixtures);

  if (games.isPending) return <div className="empty">{m.loading()}</div>;
  if (!games.data?.games.length) {
    // Not an empty table: an event with no fixtures yet has none, and a header
    // over nothing reads as a loading state that never finishes.
    return (
      <div className="empty" data-testid="schedule-empty">
        {m.schedule_empty()}
      </div>
    );
  }

  return (
    <div className="dash-card" data-testid="schedule">
      {games.data.games.map((g) => (
        <GameRow
          key={g.id}
          game={g}
          spoiler={spoiler}
          viewerZone={games.data.viewerTimezone}
          canManage={canManage}
          goto={goto}
        />
      ))}
    </div>
  );
}

function GameRow({
  game,
  spoiler,
  viewerZone,
  canManage,
  goto,
}: {
  game: Game;
  spoiler: boolean;
  viewerZone: string | null;
  /** The event's answer to MANAGE_FIXTURES, resolved once by the parent. */
  canManage: boolean;
  goto?: (r: Route) => void;
}) {
  const { locale } = useLocale();
  const [editing, setEditing] = useState(false);
  const played = game.homeScore !== null && game.awayScore !== null;

  return (
    <div className="device-row" data-testid={`game-${game.id}`}>
      <div>
        <div className="device-label">
          {game.homeTeam} <span className="muted">{m.versus()}</span> {game.awayTeam}
        </div>
        <div className="device-meta">
          {/* The venue's clock is the primary one: it is the time printed on a
              schedule and the time somebody turns up. The viewer's own is shown
              beside it only when it differs, so a local reader — which is most
              of them — sees one time rather than the same time twice. */}
          {[
            game.timezone
              ? `${timeOf(game.startsAt, locale, game.timezone)} ${shortZone(game.timezone)}`
              : timeOf(game.startsAt, locale, viewerZone),
            game.venue ?? m.venue_tbc(),
          ].join(" · ")}
          {game.timezone && viewerZone && viewerZone !== game.timezone && (
            <span data-testid={`local-time-${game.id}`}>
              {" · "}
              {m.your_time({ time: timeOf(game.startsAt, locale, viewerZone) })}
            </span>
          )}
          {" · "}
          {game.referees.length > 0 && (
            <>
              {" · "}
              <span data-testid={`referees-${game.id}`}>
                {game.referees.map((r) => r.name).join(", ")}
              </span>
            </>
          )}
          {" · "}
          {game.canSetStatus ? (
            <GameStatus game={game} />
          ) : (
            <span
              data-testid={`game-status-${game.id}`}
              style={game.statusCode === "LIVE" ? { color: "var(--live)" } : undefined}
            >
              {game.statusLabel}
            </span>
          )}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {editing ? (
          <ScoreForm game={game} onDone={() => setEditing(false)} />
        ) : (
          <>
            <span className="score-cell" data-testid={`score-${game.id}`}>
              {/* Spoiler mode hides the result, not the fixture. */}
              {spoiler && played ? m.spoiler_hidden() : played ? `${game.homeScore}–${game.awayScore}` : "—"}
            </span>
            {game.canAssignReferee && <Referees game={game} />}
            {/*
              Where a broadcaster actually starts.
       
              A referee arrives at the gym before tip-off, when their game is
              still SCHEDULED — so offering this only on the Live page, which
              lists games already in play, is offering it after the moment they
              needed it. It sits on the fixture they are standing in front of.
       
              And Watch appears here for everyone once a camera is on it, so
              somebody reading a schedule does not have to know a second page
              exists.
            */}
            {game.isBroadcasting && (
              <button
                className="btn primary"
                data-testid={`watch-fixture-${game.id}`}
                onClick={() => goto?.({ page: "watch", id: game.id })}
              >
                {m.video_watch()}
              </button>
            )}
            {game.canBroadcast && !game.isBroadcasting && (
              <button
                className="btn"
                data-testid={`broadcast-fixture-${game.id}`}
                onClick={() => goto?.({ page: "broadcast", id: game.id })}
              >
                {m.video_broadcast()}
              </button>
            )}
            {game.canEnterScore && (
              <button
                className="btn"
                data-testid={`enter-score-${game.id}`}
                onClick={() => setEditing(true)}
              >
                {played ? m.correct_score() : m.enter_score()}
              </button>
            )}
            {/* Both `games.update` and `games.remove` were enforced and
                unreachable, so a fixture entered at the wrong time stayed at
                the wrong time and a mistake could never be taken back. */}
            {canManage && <ManageFixture game={game} />}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Rescheduling a fixture, or taking it back.
 *
 * `MANAGE_FIXTURES` is the same grant that put the game here in the first
 * place. It is EVENT-scoped, because a game that does not exist yet has no
 * relation to be in — and the right to schedule one is the right to fix one.
 *
 * ## The time is edited on the venue's clock
 *
 * `startsAt` is a UTC instant and `<input type="datetime-local">` holds a naive
 * wall-clock string, so something has to say *whose* clock. It is the venue's,
 * never the machine's: an organiser in Bangkok editing a Bangkok fixture from a
 * laptop still set to UTC would otherwise be shown a time seven hours off the
 * one printed on the schedule, change nothing, press Save, and move the game.
 * Nothing would error and nobody would notice until people turned up.
 *
 * ## Removing asks first
 *
 * It cascades: the referee rows point at the game and are deleted with it, so
 * an accidental press loses assignments as well as the fixture. `confirm` is
 * blunt and it is honest about a thing that cannot be undone — there is no
 * restore, because a deleted fixture is not a state the model keeps.
 */
function ManageFixture({ game }: { game: Game }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const invalidate = () => qc.invalidateQueries({ queryKey: orpc.games.key() });

  const move = useMutation({
    mutationFn: (startsAt: string) =>
      api.games.update({ id: game.id, eventId: game.eventId, startsAt }),
    onSuccess: () => {
      invalidate();
      setOpen(false);
    },
  });

  const drop = useMutation({
    mutationFn: () => api.games.delete({ id: game.id, eventId: game.eventId }),
    onSuccess: invalidate,
  });

  const err = formErrors(move.error, ["startsAt"]);

  if (!open) {
    return (
      <>
        <button
          className="btn"
          data-testid={`edit-fixture-${game.id}`}
          onClick={() => setOpen(true)}
        >
          {m.fixture_edit()}
        </button>
        <button
          className="btn"
          data-testid={`remove-fixture-${game.id}`}
          disabled={drop.isPending}
          onClick={() => {
            if (window.confirm(m.fixture_confirm_remove())) drop.mutate();
          }}
        >
          {drop.isPending ? m.fixture_removing() : m.fixture_remove()}
        </button>
      </>
    );
  }

  return (
    <form
      className="fixture-edit"
      data-testid={`fixture-form-${game.id}`}
      onSubmit={(e) => {
        e.preventDefault();
        const local = String(new FormData(e.currentTarget).get("startsAt") ?? "");
        if (local) move.mutate(fromLocalInput(local, game.timezone));
      }}
    >
      <label className="sr-only" htmlFor={`starts-${game.id}`}>{m.fixture_when()}</label>
      <input
        id={`starts-${game.id}`}
        name="startsAt"
        type="datetime-local"
        data-testid={`fixture-when-${game.id}`}
        defaultValue={toLocalInput(game.startsAt, game.timezone)}
        required
      />
      <button type="submit" data-testid={`save-fixture-${game.id}`} disabled={move.isPending}>
        {move.isPending ? m.event_saving() : m.event_save()}
      </button>
      <button type="button" className="btn" onClick={() => setOpen(false)}>
        {m.fixture_cancel()}
      </button>
      {(err.form || err.field("startsAt")) && (
        <p className="admin-error small" data-testid={`fixture-error-${game.id}`}>
          {err.form ?? err.field("startsAt")}
        </p>
      )}
    </form>
  );
}

/**
 * Moving a game between upcoming, live, half-time and finished.
 *
 * A select rather than a button, because the states are not a sequence you step
 * through: a game called live by mistake has to go back, and half-time is not
 * "half of finished". The options come from the reference vocabulary, so a state
 * added to the model appears here without an edit.
 *
 * Gated on `canSetStatus`, which is its own grant — `CONFIRM_MATCH_STATUS`, not
 * `ENTER_SCORES`. The same people hold both today and that is not this
 * component's business.
 */
function GameStatus({ game }: { game: Game }) {
  const qc = useQueryClient();
  const { terms, name } = useLocale();

  const set = useMutation({
    mutationFn: (statusCode: string) =>
      api.games.setStatus({ id: game.id, statusCode: statusCode as never }),
    onSuccess: () => qc.invalidateQueries({ queryKey: orpc.games.key() }),
  });

  return (
    <select
      className="status-select"
      data-testid={`game-status-${game.id}`}
      value={game.statusCode}
      disabled={set.isPending}
      onChange={(e) => set.mutate(e.target.value)}
      style={game.statusCode === "LIVE" ? { color: "var(--live)" } : undefined}
    >
      {terms("gameStatuses").map((s) => (
        <option key={s.code} value={s.code}>
          {name(s.names, s.code)}
        </option>
      ))}
    </select>
  );
}

/**
 * Who officiates this game.
 *
 * `ASSIGN_REFEREE` is granted to whoever runs the event and deliberately not to
 * referees — one who could assign themselves would undo the reason score entry
 * is safe. So this control appears for an organiser and never for the official
 * standing on the court.
 */
function Referees({ game }: { game: Game }) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: orpc.games.key() });

  const assign = useMutation({
    mutationFn: (userId: string) => api.games.assignReferee({ id: game.id, userId }),
    onSuccess: invalidate,
  });
  const unassign = useMutation({
    mutationFn: (userId: string) => api.games.unassignReferee({ id: game.id, userId }),
    onSuccess: invalidate,
  });

  const free = game.availableReferees;

  return (
    <span className="referee-picker" data-testid={`assign-referee-${game.id}`}>
      {game.referees.map((r) => (
        <button
          key={r.userId}
          className="badge badge-outline"
          title={m.remove_from_squad()}
          data-testid={`unassign-${game.id}-${r.userId}`}
          onClick={() => unassign.mutate(r.userId)}
        >
          {r.name} ×
        </button>
      ))}
      {free.length > 0 && (
        <select
          value=""
          data-testid={`referee-select-${game.id}`}
          onChange={(e) => e.target.value && assign.mutate(e.target.value)}
        >
          <option value="">{m.assign_referee()}</option>
          {free.map((c) => (
            <option key={c.userId} value={c.userId}>
              {c.name}
            </option>
          ))}
        </select>
      )}
    </span>
  );
}

function ScoreForm({ game, onDone }: { game: Game; onDone: () => void }) {
  const qc = useQueryClient();

  const save = useMutation({
    mutationFn: (v: { homeScore: number; awayScore: number }) =>
      api.games.enterScore({ id: game.id, ...v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: orpc.games.key() });
      onDone();
    },
  });

  const scoreErr = formErrors(save.error, ["homeScore"]);

  return (
    <form
      className="score-form"
      data-testid={`score-form-${game.id}`}
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        save.mutate({ homeScore: Number(f.get("home")), awayScore: Number(f.get("away")) });
      }}
    >
      <input
        name="home"
        type="number"
        min="0"
        required
        defaultValue={game.homeScore ?? ""}
        aria-label={game.homeTeam}
        data-testid={`home-score-${game.id}`}
      />
      <span className="muted">–</span>
      <input
        name="away"
        type="number"
        min="0"
        required
        defaultValue={game.awayScore ?? ""}
        aria-label={game.awayTeam}
        data-testid={`away-score-${game.id}`}
      />
      <button type="submit" disabled={save.isPending} data-testid={`save-score-${game.id}`}>
        {save.isPending ? m.org_saving() : m.org_save()}
      </button>
      <button type="button" className="btn" onClick={onDone}>
        {m.cancel()}
      </button>
      {/* "Give both scores or neither" is a refinement across two fields, so it
          has no single home — it arrives at form level and is said once. */}
      {(scoreErr.field("homeScore") ?? scoreErr.form) && (
        <p className="admin-error small" data-testid={`score-error-${game.id}`}>
          {scoreErr.field("homeScore") ?? scoreErr.form}
        </p>
      )}
    </form>
  );
}

/**
 * Adding a fixture.
 *
 * Only for whoever runs the event — `MANAGE_FIXTURES`, which the schedule asks
 * about the event rather than about any game, because a game that does not
 * exist yet has no relation to be in.
 *
 * Teams come from the event's entries, so a fixture can only be made between
 * teams that actually entered. The API refuses anything else; offering it here
 * would be a form that teaches people to expect errors.
 */
export function AddFixture({ eventId }: { eventId: string }) {
  const qc = useQueryClient();
  const { data: entries } = useEntries(eventId);

  const add = useMutation({
    mutationFn: (v: { homeTeamId: string; awayTeamId: string; startsAt: string }) =>
      api.games.create({ eventId, ...v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: orpc.games.key() }),
  });

  const addErr = formErrors(add.error, ["startsAt"]);
  const teams = entries?.registered ?? [];
  // The server's answer, per event. Two teams alone is not permission.
  if (!entries?.canManageFixtures || teams.length < 2) return null;

  return (
    <section className="admin-card" style={{ marginTop: 16 }} data-testid="add-fixture">
      <h2>{m.add_fixture()}</h2>
      <form
        className="admin-form"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          add.mutate({
            homeTeamId: String(f.get("home")),
            awayTeamId: String(f.get("away")),
            // `datetime-local` has no zone; the fixtures store UTC.
            startsAt: new Date(String(f.get("startsAt"))).toISOString(),
          });
        }}
      >
        <select name="home" data-testid="fixture-home">
          {teams.map((t) => (
            <option key={t.teamId} value={t.teamId}>{t.team}</option>
          ))}
        </select>
        <select name="away" data-testid="fixture-away" defaultValue={teams[1]!.teamId}>
          {teams.map((t) => (
            <option key={t.teamId} value={t.teamId}>{t.team}</option>
          ))}
        </select>
        <input name="startsAt" type="datetime-local" required data-testid="fixture-starts" />
        {addErr.field("startsAt") && (
          <p className="admin-error small" data-testid="fixture-starts-issue">
            {addErr.field("startsAt")}
          </p>
        )}
        <button type="submit" data-testid="add-fixture-submit" disabled={add.isPending}>
          {add.isPending ? m.org_saving() : m.add_fixture()}
        </button>
        {/* A refusal with no field to sit under — "that team is not registered
            for this event", "a team cannot play itself". Those belong at the
            bottom of the form, not beneath an input that is not the problem. */}
        {/* A refusal with no field to sit under — "that team is not registered
            for this event", "a team cannot play itself" — plus any issue the
            fields above did not claim. */}
        {addErr.form && (
          <p className="admin-error small" data-testid="add-fixture-error">
            {addErr.form}
          </p>
        )}
      </form>
    </section>
  );
}

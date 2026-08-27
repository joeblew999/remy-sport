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
import { getIssueMessage } from "@orpc/openapi-client/helpers";
import { api, orpc } from "../lib/orpc";
import { useGames } from "../lib/data";
import { useLocale } from "../lib/locale";
import { m } from "../lib/i18n";

type Game = NonNullable<ReturnType<typeof useGames>["data"]>[number];

/**
 * When a game starts, in the reader's language.
 *
 * The locale is the app's, not the browser's — `undefined` here meant a Thai
 * page rendered "Aug 27" because the browser was set to English.
 *
 * `-u-ca-gregory` is deliberate. Thai defaults to the Buddhist era, so `th`
 * alone renders 2569 for 2026, and every other date on the page comes from
 * `formatRange` in Gregorian. One page showing both would be worse than either.
 * Offering Buddhist dates is a real thing to consider — but as a decision, and
 * everywhere at once.
 */
function timeOf(startsAt: string, locale: string): string {
  const d = new Date(startsAt);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString(`${locale}-u-ca-gregory`, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function Schedule({ eventId, spoiler }: { eventId: string; spoiler: boolean }) {
  const games = useGames(eventId);

  if (games.isPending) return <div className="empty">{m.loading()}</div>;
  if (!games.data?.length) {
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
      {games.data.map((g) => (
        <GameRow key={g.id} game={g} spoiler={spoiler} />
      ))}
    </div>
  );
}

function GameRow({ game, spoiler }: { game: Game; spoiler: boolean }) {
  const { locale } = useLocale();
  const [editing, setEditing] = useState(false);
  const played = game.homeScore !== null && game.awayScore !== null;

  return (
    <div className="device-row" data-testid={`game-${game.id}`}>
      <div>
        <div className="device-label">
          {game.homeTeam} <span className="muted">v</span> {game.awayTeam}
        </div>
        <div className="device-meta">
          {[timeOf(game.startsAt, locale), game.venue ?? m.venue_tbc()].join(" · ")}
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
            {game.canEnterScore && (
              <button
                className="btn"
                data-testid={`enter-score-${game.id}`}
                onClick={() => setEditing(true)}
              >
                {played ? m.correct_score() : m.enter_score()}
              </button>
            )}
          </>
        )}
      </div>
    </div>
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
  const { reference, name } = useLocale();

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
      {(reference?.gameStatuses ?? []).map((s) => (
        <option key={s.code} value={s.code}>
          {name(s.names, s.code)}
        </option>
      ))}
    </select>
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
      {/* The schema's own message, under the field it belongs to. */}
      {(getIssueMessage(save.error, "homeScore") ?? save.error) && (
        <p className="admin-error small" data-testid={`score-error-${game.id}`}>
          {getIssueMessage(save.error, "homeScore") ?? (save.error as Error | null)?.message}
        </p>
      )}
    </form>
  );
}

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
import { m } from "../lib/i18n";

type Game = NonNullable<ReturnType<typeof useGames>["data"]>[number];

/** The time of day a game starts, in the reader's locale. */
function timeOf(startsAt: string): string {
  const d = new Date(startsAt);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString(undefined, {
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
  const [editing, setEditing] = useState(false);
  const played = game.homeScore !== null && game.awayScore !== null;

  return (
    <div className="device-row" data-testid={`game-${game.id}`}>
      <div>
        <div className="device-label">
          {game.homeTeam} <span className="muted">v</span> {game.awayTeam}
        </div>
        <div className="device-meta">
          {[timeOf(game.startsAt), game.venue ?? m.venue_tbc()].join(" · ")}
          {" · "}
          <span
            data-testid={`game-status-${game.id}`}
            style={game.statusCode === "LIVE" ? { color: "var(--live)" } : undefined}
          >
            {game.statusLabel}
          </span>
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

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, orpc } from "../lib/orpc";
import { formErrors } from "../lib/form-errors";
import { useLocale } from "../lib/locale";
import { m } from "../lib/i18n";

/** @answers ENTER_SCORES
 * Mounted inside the game's action gate, including while a line is being edited.
 */
export function GameStats({ gameId }: { gameId: string }) {
  const [open, setOpen] = useState(false);
  return <>
    <button className="btn" data-testid={`box-score-${gameId}`} onClick={() => setOpen(!open)} aria-expanded={open}>
      {m.game_box_score()}
    </button>
    {open && <Lines gameId={gameId} />}
  </>;
}

type Line = Awaited<ReturnType<typeof api.games.stats>>["players"][number];
function Lines({ gameId }: { gameId: string }) {
  const q = useQuery(orpc.games.stats.queryOptions({ input: { id: gameId } }));
  const err = formErrors(q.error);
  if (q.isPending) return <p>{m.loading()}</p>;
  if (err.form) return <div role="alert">{err.form}<button className="btn" onClick={() => q.refetch()}>{m.push_retry()}</button></div>;
  return <section className="game-box-score" data-testid={`box-score-lines-${gameId}`}>
    <p className="muted small">{m.game_box_score_hint()}</p>
    {!q.data?.players.length && <p>{m.game_box_score_empty()}</p>}
    {q.data?.players.map((line) => <PlayerLine key={line.playerId} line={line} />)}
  </section>;
}

function PlayerLine({ line }: { line: Line }) {
  const { name } = useLocale();
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: (input: Parameters<typeof api.games.setPlayerStats>[0]) => api.games.setPlayerStats(input),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: orpc.games.key() }),
        qc.invalidateQueries({ queryKey: orpc.players.key() }),
      ]);
    },
  });
  const err = formErrors(save.error);
  const fields = [
    ["points", m.stat_points()], ["rebounds", m.stat_rebounds()],
    ["assists", m.stat_assists()], ["fouls", m.stat_fouls()],
  ] as const;
  return <form className="admin-form" data-testid={`stat-line-${line.playerId}`} onSubmit={(e) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const value = (field: string) => form.get(field) === "" ? null : Number(form.get(field));
    save.mutate({ id: line.gameId, playerId: line.playerId,
      points: value("points"), rebounds: value("rebounds"), assists: value("assists"), fouls: value("fouls") });
  }}>
    <h3>{name(line.names)}</h3>
    {fields.map(([field, label]) => <label key={field}>
      {label}
      <input name={field} type="number" min="0" step="1" defaultValue={line[field] ?? ""} disabled={save.isPending} />
    </label>)}
    <button type="submit" disabled={save.isPending}>{save.isPending ? m.org_saving() : m.org_save()}</button>
    {save.isSuccess && <p role="status">{m.game_box_score_saved()}</p>}
    {err.form && <p role="alert" className="admin-error small">{err.form}</p>}
  </form>;
}

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, orpc } from "../lib/orpc";
import { formErrors } from "../lib/form-errors";
import { useLocale } from "../lib/locale";
import { m } from "../lib/i18n";
import { Alert, AlertAction, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

/** @answers ENTER_SCORES
 * Mounted inside the game's action gate, including while a line is being edited.
 */
export function GameStats({ gameId }: { gameId: string }) {
  const [open, setOpen] = useState(false);
  return <>
    <Button variant="outline" data-testid={`box-score-${gameId}`} onClick={() => setOpen(!open)} aria-expanded={open}>
      {m.game_box_score()}
    </Button>
    {open && <Lines gameId={gameId} />}
  </>;
}

type Line = Awaited<ReturnType<typeof api.games.stats>>["players"][number];
function Lines({ gameId }: { gameId: string }) {
  const q = useQuery(orpc.games.stats.queryOptions({ input: { id: gameId } }));
  const err = formErrors(q.error);
  if (q.isPending) return <p className="basis-full">{m.loading()}</p>;
  if (err.form) return (
    <Alert variant="destructive" className="basis-full">
      <AlertDescription>{err.form}</AlertDescription>
      <AlertAction><Button variant="outline" size="sm" onClick={() => q.refetch()}>{m.push_retry()}</Button></AlertAction>
    </Alert>
  );
  return <section className="flex min-w-0 basis-full flex-col gap-4" data-testid={`box-score-lines-${gameId}`}>
    <p className="text-sm text-muted-foreground">{m.game_box_score_hint()}</p>
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
  return <form data-testid={`stat-line-${line.playerId}`} onSubmit={(e) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const value = (field: string) => form.get(field) === "" ? null : Number(form.get(field));
    save.mutate({ id: line.gameId, playerId: line.playerId,
      points: value("points"), rebounds: value("rebounds"), assists: value("assists"), fouls: value("fouls") });
  }}>
    <FieldGroup className="max-w-[420px]">
      <h3 className="text-base font-semibold">{name(line.names)}</h3>
      {fields.map(([field, label]) => (
        <Field key={field}>
          {/* The id carries the player: several lines can be open at once, and
              a duplicated id would associate every label with the first. */}
          <FieldLabel htmlFor={`${line.playerId}-${field}`}>{label}</FieldLabel>
          <Input id={`${line.playerId}-${field}`} name={field} type="number" min="0" step="1" defaultValue={line[field] ?? ""} disabled={save.isPending} />
        </Field>
      ))}
      <Button type="submit" disabled={save.isPending} className="w-fit">{save.isPending ? m.org_saving() : m.org_save()}</Button>
      {save.isSuccess && <p role="status">{m.game_box_score_saved()}</p>}
      {err.form && (
        <Alert variant="destructive">
          <AlertDescription>{err.form}</AlertDescription>
        </Alert>
      )}
    </FieldGroup>
  </form>;
}

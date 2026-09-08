import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, orpc } from "../lib/orpc";
import { useLocale } from "../lib/locale";
import { formErrors } from "../lib/form-errors";
import { m } from "../lib/i18n";
import { NameTranslations, namesFrom } from "./name-translations";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

/** @answers CREATE_PLAYER
 * Creation and roster membership are separate writes. Retain a successful
 * creation when joining fails, so Retry cannot create a duplicate player.
 */
export function NewPlayer({ teamId, onCreated }: { teamId?: string; onCreated: (id: string) => void }) {
  const { terms, label } = useLocale();
  const [open, setOpen] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const qc = useQueryClient();

  const create = useMutation({
    mutationFn: async (v: {
      names: Record<string, string>;
      dob: string;
      jerseyNumber: number;
      positionCode: string;
    }) => {
      const playerId = createdId ?? (await api.players.create(v as never)).playerId;
      setCreatedId(playerId);
      if (teamId) await api.teams.addPlayer({ teamId, playerId });
      return playerId;
    },
    onSuccess: (id) => {
      onCreated(id);
      setCreatedId(null);
      setOpen(false);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: orpc.players.key() });
      void qc.invalidateQueries({ queryKey: orpc.teams.key() });
    },
  });

  const err = formErrors(create.error);

  if (!open) {
    return (
      <Button variant="outline" data-testid="new-player-open" onClick={() => setOpen(true)}>
        {m.player_new()}
      </Button>
    );
  }

  if (createdId && teamId) return <div role="alert" data-testid="new-player-join-error">
    <p>{create.isPending ? m.org_saving() : m.player_created_join_failed()}</p>
    {err.form && (
      <Alert variant="destructive" role="alert">
        <AlertDescription>{err.form}</AlertDescription>
      </Alert>
    )}
    <Button disabled={create.isPending} onClick={() => create.mutate(create.variables!)}>{m.add_to_squad()}</Button>
  </div>;

  return (
    <form
      data-testid="new-player-form"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        create.mutate({
          names: namesFrom(f, {}),
          dob: String(f.get("dob")),
          jerseyNumber: Number(f.get("jerseyNumber")),
          positionCode: String(f.get("positionCode")),
        });
      }}
    >
      <FieldGroup className="max-w-[420px]">
        <Field>
          <FieldLabel htmlFor="new-player-name">{m.player_name()}</FieldLabel>
          <Input id="new-player-name" name="name" required data-testid="new-player-name" />
        </Field>
        <NameTranslations names={{}} id="new-player-name" />

        <Field>
          <FieldLabel htmlFor="new-player-dob">{m.player_dob()}</FieldLabel>
          {/* A real date control, for the same reason the guardian form uses one:
              the API wants YYYY-MM-DD, and a text box is how "18/04/2012" reaches
              it and comes back a 400 nobody can read. */}
          <Input id="new-player-dob" name="dob" type="date" required data-testid="new-player-dob" />
        </Field>

        <Field>
          <FieldLabel htmlFor="new-player-number">{m.player_number()}</FieldLabel>
          <Input
            id="new-player-number"
            name="jerseyNumber"
            type="number"
            min={0}
            max={99}
            required
            defaultValue={0}
            data-testid="new-player-number"
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="new-player-position">{m.player_position()}</FieldLabel>
          <NativeSelect id="new-player-position" name="positionCode" data-testid="new-player-position">
            {terms("positions").map((t) => (
              <NativeSelectOption key={t.code} value={t.code}>{label("positions", t.code)}</NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>

        <Button type="submit" data-testid="new-player-save" disabled={create.isPending} className="w-fit">
          {create.isPending ? m.event_saving() : m.player_add()}
        </Button>
        <Button type="button" variant="outline" className="w-fit" onClick={() => setOpen(false)}>
          {m.fixture_cancel()}
        </Button>
        {err.form && (
          <Alert variant="destructive" data-testid="new-player-error" role="alert">
            <AlertDescription>{err.form}</AlertDescription>
          </Alert>
        )}
      </FieldGroup>
    </form>
  );
}

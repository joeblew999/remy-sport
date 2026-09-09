/**
 * The teams entered into an event, and entering one.
 *
 * The form appears only if the server says this person may enter something —
 * `registrable` is empty for everyone else, so a spectator sees the list and no
 * form, rather than a form that would be refused. Same rule as everywhere else
 * in this app: the client asks, it does not decide.
 *
 * Divisions are filtered to the ones the chosen team can actually enter. The API
 * refuses a mismatch — a U18 girls' team cannot be filed under U16 boys — and a
 * form that offers an impossible choice teaches people to expect errors.
 */

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, orpc } from "../lib/orpc";
import { useEntries } from "../lib/data";
import { formErrors } from "../lib/form-errors";
import { routeHref } from "../lib/router";
import { m } from "../lib/i18n";
import { Loading } from "./states";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Muted } from "./page"

/**
 * @answers REGISTER_TEAM_FOR_EVENT
 *
 * Teams into events, and out again.
 */
export function Entries({ eventId, divisionId }: { eventId: string; divisionId?: string }) {
  const qc = useQueryClient();
  const { data, isPending } = useEntries(eventId);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: orpc.events.entries.key({ input: { eventId } }) });
    // The table and the schedule both read the registration.
    qc.invalidateQueries({ queryKey: orpc.standings.key() });
  };

  const withdraw = useMutation({
    mutationFn: (teamId: string) => api.events.withdrawTeam({ eventId, teamId }),
    onSuccess: invalidate,
  });

  if (isPending) return <Loading />;

  return (
    <>
      <Card data-testid="entries">
        <CardHeader><CardTitle>{m.tab_teams()}</CardTitle></CardHeader>
        <CardContent>
        {data?.registered.length ? (
          <Table data-testid="entries-table">
            <TableHeader>
              <TableRow>
                <TableHead>{m.team()}</TableHead>
                <TableHead>{m.division()}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.registered.filter(r => !divisionId || r.divisionId === divisionId).map((r) => (
                <TableRow key={r.teamId} data-testid={`entry-${r.teamId}`}>
                  <TableCell className="whitespace-normal">
                    <a className="font-medium hover:underline" href={routeHref({ page: "team", id: r.teamId })}>{r.team}</a>
                    {/* When they entered, which nothing showed. An organiser
                        looking at a full event could not tell who was first —
                        the question behind every waiting list. */}
                    {r.entered && (
                      <Muted as="div" data-testid={`entered-${r.teamId}`}>
                        {m.registered_on({ date: r.entered })}
                      </Muted>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" render={<a href={routeHref({ page: "event", id: eventId, query: { tab: "standings", division: r.divisionId ?? "" } })} />}>{r.division}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {r.can.REGISTER_TEAM_FOR_EVENT && (
                      <Button
                        variant="destructive"
                        data-testid={`withdraw-${r.teamId}`}
                        disabled={withdraw.isPending}
                        onClick={() => withdraw.mutate(r.teamId)}
                      >
                        {m.withdraw()}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-muted-foreground" data-testid="entries-empty">{m.entries_empty()}</p>
        )}
        </CardContent>
      </Card>

      {/* Only for someone with a team to enter. */}
      {data?.registrable.length ? (
        <EnterTeam eventId={eventId} data={data} onDone={invalidate} />
      ) : null}
    </>
  );
}

type Data = NonNullable<ReturnType<typeof useEntries>["data"]>;

function EnterTeam({
  eventId,
  data,
  onDone,
}: {
  eventId: string;
  data: Data;
  onDone: () => void;
}) {
  const [teamId, setTeamId] = useState(data.registrable[0]!.teamId);
  const team = data.registrable.find((t) => t.teamId === teamId);

  // Only the divisions this team matches. The server enforces it; this stops
  // the form offering a choice that cannot work.
  const options = data.divisions.filter(
    (d) => d.ageGroupCode === team?.ageGroupCode && d.genderCode === team?.genderCode,
  );

  const enterErr = () => formErrors(enter.error, ["divisionId"]);

  const enter = useMutation({
    mutationFn: (v: { teamId: string; divisionId: string }) =>
      api.events.registerTeam({ eventId, ...v }),
    onSuccess: onDone,
  });

  return (
    <Card data-testid="enter-team">
      <CardHeader><CardTitle>{m.enter_a_team()}</CardTitle></CardHeader>
      <CardContent>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          enter.mutate({ teamId, divisionId: String(f.get("division")) });
        }}
      >
        <FieldGroup className="max-w-[420px]">
          <Field>
            <FieldLabel htmlFor="enter-team-select">{m.teams()}</FieldLabel>
            <NativeSelect
              id="enter-team-select"
              name="team"
              data-testid="enter-team-select"
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
            >
              {data.registrable.map((t) => (
                <NativeSelectOption key={t.teamId} value={t.teamId}>
                  {t.team}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>

          {options.length ? (
            <Field>
              <FieldLabel htmlFor="enter-division-select">{m.division()}</FieldLabel>
              <NativeSelect id="enter-division-select" name="division" data-testid="enter-division-select">
                {options.map((d) => (
                  <NativeSelectOption key={d.id} value={d.id}>
                    {d.division}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
          ) : (
            // Nothing this team could be entered into. Said plainly rather than
            // rendering an empty select that submits nothing.
            <p className="text-muted-foreground" data-testid="no-division">{m.no_matching_division()}</p>
          )}

          <Button type="submit" data-testid="enter-team-submit" disabled={!options.length || enter.isPending} className="w-fit">
            {enter.isPending ? m.org_saving() : m.enter_a_team()}
          </Button>

          {/* Either the division issue on its own field, or anything else — a
              team that never entered, a division that does not match — at form
              level. Neither can be dropped. */}
          {(enterErr().field("divisionId") ?? enterErr().form) && (
            <Alert variant="destructive" data-testid="enter-error">
              <AlertDescription>{enterErr().field("divisionId") ?? enterErr().form}</AlertDescription>
            </Alert>
          )}
        </FieldGroup>
      </form>
      </CardContent>
    </Card>
  );
}

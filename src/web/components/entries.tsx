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
import { m } from "../lib/i18n";

export function Entries({ eventId }: { eventId: string }) {
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

  if (isPending) return <div className="empty">{m.loading()}</div>;

  return (
    <>
      <section className="admin-card" data-testid="entries">
        <h2>{m.tab_teams()}</h2>
        {data?.registered.length ? (
          <table className="admin-table" data-testid="entries-table">
            <thead>
              <tr>
                <th>{m.team()}</th>
                <th>{m.division()}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.registered.map((r) => (
                <tr key={r.teamId} data-testid={`entry-${r.teamId}`}>
                  <td>
                    {r.team}
                    {/* When they entered, which nothing showed. An organiser
                        looking at a full event could not tell who was first —
                        the question behind every waiting list. */}
                    {r.entered && (
                      <div className="muted small" data-testid={`entered-${r.teamId}`}>
                        {m.registered_on({ date: r.entered })}
                      </div>
                    )}
                  </td>
                  <td>
                    <span className="badge badge-outline">{r.division}</span>
                  </td>
                  <td>
                    {r.canWithdraw && (
                      <button
                        className="danger"
                        data-testid={`withdraw-${r.teamId}`}
                        disabled={withdraw.isPending}
                        onClick={() => withdraw.mutate(r.teamId)}
                      >
                        {m.withdraw()}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted" data-testid="entries-empty">{m.entries_empty()}</p>
        )}
      </section>

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
    <section className="admin-card" data-testid="enter-team">
      <h2>{m.enter_a_team()}</h2>
      <form
        className="admin-form"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          enter.mutate({ teamId, divisionId: String(f.get("division")) });
        }}
      >
        <select
          name="team"
          data-testid="enter-team-select"
          value={teamId}
          onChange={(e) => setTeamId(e.target.value)}
        >
          {data.registrable.map((t) => (
            <option key={t.teamId} value={t.teamId}>
              {t.team}
            </option>
          ))}
        </select>

        {options.length ? (
          <select name="division" data-testid="enter-division-select">
            {options.map((d) => (
              <option key={d.id} value={d.id}>
                {d.division}
              </option>
            ))}
          </select>
        ) : (
          // Nothing this team could be entered into. Said plainly rather than
          // rendering an empty select that submits nothing.
          <p className="muted" data-testid="no-division">{m.no_matching_division()}</p>
        )}

        <button type="submit" data-testid="enter-team-submit" disabled={!options.length || enter.isPending}>
          {enter.isPending ? m.org_saving() : m.enter_a_team()}
        </button>

        {/* Either the division issue on its own field, or anything else — a
            team that never entered, a division that does not match — at form
            level. Neither can be dropped. */}
        {(enterErr().field("divisionId") ?? enterErr().form) && (
          <p className="admin-error small" data-testid="enter-error">
            {enterErr().field("divisionId") ?? enterErr().form}
          </p>
        )}
      </form>
    </section>
  );
}

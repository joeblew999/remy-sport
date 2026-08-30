/**
 * The children you are guardian to, on your own profile.
 *
 * The `guardians` table has been seeded since the fixtures were written and no
 * screen has ever read it. For a youth sports platform that is close to the
 * whole point: a parent in Bangkok signs in and wants to know which team their
 * child is on and where to be on Saturday.
 *
 * Renders nothing when the list is empty. Most people signing in are not
 * guardians, and a permanent "you are not a guardian to anyone" panel on every
 * profile is noise that teaches people to stop reading the page. That is the
 * same rule the invitations card follows and for the same reason.
 *
 * The relationship is shown — Parent, Grandparent, Legal Guardian — because the
 * model distinguishes them and flattening them to "guardian" would throw away
 * what the table actually says. From the reference vocabulary, so a Thai reader
 * sees ผู้ปกครอง rather than a code.
 */

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api, orpc } from "../lib/orpc"
import { formErrors } from "../lib/form-errors"
import { useLocale } from "../lib/locale"
import { m } from "../lib/i18n"
import type { Route } from "../lib/router"

export function YourPlayers({ goto }: { goto: (r: Route) => void }) {
  const { name, label } = useLocale()
  const { data } = useQuery(orpc.players.mine.queryOptions())
  // One at a time. Two open forms on one card is a way to save the wrong child's
  // number, and a guardian is editing one thing.
  const [editing, setEditing] = useState<string | null>(null)

  const players = data?.players ?? []
  if (players.length === 0) return null

  return (
    <>
      <div className="section-h">
        <h2>{m.your_players()}</h2>
      </div>
      <div className="dash-card" data-testid="your-players">
        {players.map((p) =>
          editing === p.playerId ? (
            <EditPlayer key={p.playerId} player={p} onDone={() => setEditing(null)} />
          ) : (
          /**
           * A row, then two controls beside each other — not one inside the
           * other.
           *
           * The first version put the Edit affordance inside the navigating
           * `<button>` as a `<span role="button">`. That is invalid markup —
           * interactive content cannot nest — and it breaks for exactly the
           * people who most need it to work: a keyboard user reaches the outer
           * button and the inner one is unreachable, while a screen reader is
           * told about a button that contains a button. `stopPropagation` made
           * it behave with a mouse, which is what made it look finished.
           */
          <div key={p.playerId} className="player-row" data-testid={`your-player-${p.playerId}`}>
            <button
              className="row-main"
              // Their team, because that is what a guardian is looking for —
              // the squad, the fixtures, who coaches it. There is no player
              // page to send them to, and inventing one to hold a jersey
              // number would be a screen with nothing on it.
              disabled={!p.teamId}
              data-testid={`goto-team-${p.playerId}`}
              onClick={() => p.teamId && goto({ page: "team", id: p.teamId })}
            >
              <div className="row-title">
                {name(p.names)}
                <span className="player-jersey">{m.player_jersey({ n: p.jerseyNumber })}</span>
              </div>
              <div className="row-meta">
                {[
                  // Null where the player *is* you — being yourself is not a
                  // guardianship, and "Self · Parent" would be nonsense.
                  p.guardianTypeCode ? label("guardianTypes", p.guardianTypeCode) : null,
                  label("positions", p.positionCode),
                  p.teamNames ? name(p.teamNames) : m.player_no_team(),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </button>
            {/* The model's answer for this reader on this player, not assumed
                from the row being on their own profile — a guardian holds
                EDIT_PLAYER_PROFILE, and so does a coach who is not here. */}
            {p.canEdit && (
              <button
                className="row-edit"
                data-testid={`edit-player-${p.playerId}`}
                onClick={() => setEditing(p.playerId)}
              >
                {m.player_edit()}
              </button>
            )}
          </div>
          ),
        )}
      </div>
    </>
  )
}

/**
 * Correcting a squad number or a position.
 *
 * `EDIT_PLAYER_PROFILE` has been granted to SELF, GUARDIAN and the coaches
 * since the fixtures were written, with no procedure and no form. A parent
 * whose child was given the wrong number could do nothing about it.
 *
 * The name is not offered here. It is a locale map and the row is a line on a
 * card — editing it properly is the same three-language question the team and
 * event forms answer with a single English box, and doing that in a list row
 * would be cramped. A squad number and a position are what actually change.
 *
 * `dob` is absent because the model has no action for it: it decides age-group
 * eligibility, and a birth date corrected from a profile form makes the
 * eligibility rules advisory.
 */
function EditPlayer({
  player,
  onDone,
}: {
  player: { playerId: string; names: Record<string, string>; jerseyNumber: number; positionCode: string }
  onDone: () => void
}) {
  const { name, terms, label } = useLocale()
  const qc = useQueryClient()

  const save = useMutation({
    mutationFn: (v: { jerseyNumber: number; positionCode: string }) =>
      api.players.update({ id: player.playerId, ...v, positionCode: v.positionCode as never }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: orpc.players.key() })
      onDone()
    },
  })

  const err = formErrors(save.error, ["jerseyNumber", "positionCode"])

  return (
    <form
      className="player-edit"
      data-testid={`player-form-${player.playerId}`}
      onSubmit={(e) => {
        e.preventDefault()
        const f = new FormData(e.currentTarget)
        save.mutate({
          jerseyNumber: Number(f.get("jerseyNumber")),
          positionCode: String(f.get("positionCode")),
        })
      }}
    >
      <div className="row-title">{name(player.names)}</div>

      <label className="sr-only" htmlFor={`n-${player.playerId}`}>{m.player_number()}</label>
      <input
        id={`n-${player.playerId}`}
        name="jerseyNumber"
        type="number"
        min={0}
        max={99}
        required
        data-testid={`player-number-${player.playerId}`}
        defaultValue={player.jerseyNumber}
      />

      <label className="sr-only" htmlFor={`p-${player.playerId}`}>{m.player_position()}</label>
      <select
        id={`p-${player.playerId}`}
        name="positionCode"
        data-testid={`player-position-${player.playerId}`}
        defaultValue={player.positionCode}
      >
        {/* From the reference vocabulary, with the compiled fallback, so the
            control is never an empty box before a fetch lands. */}
        {terms("positions").map((t) => (
          <option key={t.code} value={t.code}>{label("positions", t.code)}</option>
        ))}
      </select>

      <button type="submit" data-testid={`player-save-${player.playerId}`} disabled={save.isPending}>
        {save.isPending ? m.event_saving() : m.event_save()}
      </button>
      <button type="button" className="btn" onClick={onDone}>{m.fixture_cancel()}</button>

      {(err.form || err.field("jerseyNumber")) && (
        <p className="admin-error small" data-testid={`player-error-${player.playerId}`}>
          {err.form ?? err.field("jerseyNumber")}
        </p>
      )}
    </form>
  )
}

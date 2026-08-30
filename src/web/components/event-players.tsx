/**
 * Entering your child in a camp.
 *
 * `eventPlayer` was the only table in the model with neither an API nor a
 * screen, and `REGISTER_PLAYER_FOR_EVENT` — one of the three things the Product
 * Owner grants a guardian — had nothing behind it at all.
 *
 * ## Only for camps and showcases, and not because this file says so
 *
 * The grant reads `{ relation: "GUARDIAN", eventTypes: ["CAMP", "SHOWCASE"] }`.
 * A tournament or a league is entered by a *team*: a parent cannot put their
 * child into the Bangkok Schools League, because the league plays teams and the
 * team's coach enters it. The tab is therefore offered only where the model
 * would allow the action — showing it on a league would be a form that answers
 * 403, which is this codebase's most-repeated mistake.
 *
 * ## It lists your children and nobody else's
 *
 * Not the full entry list. Every row here names a minor, and a public roster of
 * children who have signed up for a camp is a different product decision from
 * "a team sheet is what a gym wall shows" — one nobody has taken. `players.mine`
 * returns only those the reader holds GUARDIAN or SELF on, so the question this
 * screen answers is "are mine in, and can I change that".
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api, orpc } from "../lib/orpc"
import { useLocale } from "../lib/locale"
import { useSession } from "../lib/session"
import { m } from "../lib/i18n"

export function EventPlayers({ eventId }: { eventId: string }) {
  const { name } = useLocale()
  const { user } = useSession()
  const qc = useQueryClient()

  const { data: mine } = useQuery(orpc.players.mine.queryOptions({ enabled: Boolean(user) }))
  // Reference-shaped and unfiltered, like the venue lists — small, cached, and
  // filtered here rather than growing an endpoint to answer one page.
  const { data: entries } = useQuery(
    orpc.eventPlayers.list.queryOptions({ enabled: Boolean(user) }),
  )

  const enteredHere = new Set(
    (entries?.items ?? []).filter((e) => e.eventId === eventId).map((e) => e.playerId),
  )

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: orpc.eventPlayers.list.key() })

  const enter = useMutation({
    mutationFn: (playerId: string) => api.players.registerForEvent({ eventId, playerId }),
    onSuccess: invalidate,
  })
  const withdraw = useMutation({
    mutationFn: (playerId: string) => api.players.withdrawFromEvent({ eventId, playerId }),
    onSuccess: invalidate,
  })

  const players = mine?.players ?? []
  const busy = enter.isPending || withdraw.isPending

  return (
    <div className="page-inner">
      <p className="muted small" style={{ padding: "0 0 12px" }}>{m.event_players_hint()}</p>
      <div className="dash-card" data-testid="event-players">
        {!user && <div className="empty" data-testid="event-players-signin">{m.sign_in()}</div>}
        {user && players.length === 0 && (
          <div className="empty" data-testid="event-players-none">
            {m.event_players_none_of_yours()}
          </div>
        )}
        {players.map((p) => {
          const entered = enteredHere.has(p.playerId)
          return (
            <div key={p.playerId} className="invite-row" data-testid={`entry-${p.playerId}`}>
              <div>
                <div className="row-title">{name(p.names)}</div>
                <div className="row-meta">
                  {entered ? m.event_entered() : (p.teamNames ? name(p.teamNames) : m.player_no_team())}
                </div>
              </div>
              {entered ? (
                <button
                  className="btn"
                  data-testid={`withdraw-${p.playerId}`}
                  disabled={busy}
                  onClick={() => withdraw.mutate(p.playerId)}
                >
                  {m.event_withdraw()}
                </button>
              ) : (
                <button
                  className="btn primary"
                  data-testid={`enter-${p.playerId}`}
                  disabled={busy}
                  onClick={() => enter.mutate(p.playerId)}
                >
                  {m.event_enter()}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

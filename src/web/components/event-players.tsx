import { formErrors } from "../lib/form-errors"
import { Button } from "@/components/ui/button"
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
import { EmptyState } from "./states"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item"
import { Muted, Row, RowGroup } from "./page"

/**
 * @answers REGISTER_PLAYER_FOR_EVENT
 *
 * Players into events, and out again.
 */
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

  const err = formErrors(enter.error ?? withdraw.error)

  const players = mine?.players ?? []
  const busy = enter.isPending || withdraw.isPending

  return (
    <div className="flex flex-col gap-3">
      <Muted>{m.event_players_hint()}</Muted>
      <RowGroup data-testid="event-players">
        {!user && <EmptyState className="border-0" data-testid="event-players-signin">{m.sign_in()}</EmptyState>}
        {user && players.length === 0 && (
          <EmptyState className="border-0" data-testid="event-players-none">
            {m.event_players_none_of_yours()}
          </EmptyState>
        )}
        {players.map((p) => {
          const entered = enteredHere.has(p.playerId)
          return (
            <Row key={p.playerId} data-testid={`entry-${p.playerId}`}>
              <ItemContent>
                <ItemTitle>{name(p.names)}</ItemTitle>
                <ItemDescription>
                  {entered ? m.event_entered() : (p.teamNames ? name(p.teamNames) : m.player_no_team())}
                </ItemDescription>
              </ItemContent>
              <ItemActions>
              {entered ? (
                <Button
                  variant="outline"
                  data-testid={`withdraw-${p.playerId}`}
                  disabled={busy}
                  onClick={() => withdraw.mutate(p.playerId)}
                >
                  {m.event_withdraw()}
                </Button>
              ) : (
                <Button
                  data-testid={`enter-${p.playerId}`}
                  disabled={busy}
                  onClick={() => enter.mutate(p.playerId)}
                >
                  {m.event_enter()}
                </Button>
              )}
              </ItemActions>
            </Row>
          )
        })}
      </RowGroup>
      {err.form && (
        <Alert variant="destructive">
          <AlertDescription>{err.form}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}

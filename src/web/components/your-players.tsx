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

import { useQuery } from "@tanstack/react-query"
import { orpc } from "../lib/orpc"
import { useLocale } from "../lib/locale"
import { m } from "../lib/i18n"
import type { Route } from "../lib/router"

export function YourPlayers({ goto }: { goto: (r: Route) => void }) {
  const { name, label } = useLocale()
  const { data } = useQuery(orpc.players.mine.queryOptions())

  const players = data?.players ?? []
  if (players.length === 0) return null

  return (
    <>
      <div className="section-h">
        <h2>{m.your_players()}</h2>
      </div>
      <div className="dash-card" data-testid="your-players">
        {players.map((p) => (
          <button
            key={p.playerId}
            className="row-button"
            data-testid={`your-player-${p.playerId}`}
            // Their team, because that is what a guardian is looking for — the
            // squad, the fixtures, who coaches it. There is no player page to
            // send them to, and inventing one to hold a jersey number would be
            // a screen with nothing on it.
            disabled={!p.teamId}
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
        ))}
      </div>
    </>
  )
}

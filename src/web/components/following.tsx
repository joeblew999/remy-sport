/**
 * What this reader follows — teams, events, players.
 *
 * On the profile page, not in notification settings, and the distinction is the
 * point. Following is *content*: it is the answer to "whose games do I care
 * about", and it would be worth showing on a platform that sent no
 * notifications at all. It happens to be what notifications are derived from,
 * which is why it ended up filed under them — but the same reasoning would put
 * a reader's teams inside their email preferences.
 *
 * It read particularly badly at the bottom of a device list: "Kanya Thongdee ·
 * Player" under two browsers and a row of checkboxes, in a section about where
 * push is delivered.
 *
 * Shares `notifications.following` with the settings section, which also reads
 * `muted` from it. One endpoint, two readers, and react-query dedupes the
 * request — so this costs nothing beyond the component.
 */
import { useQuery } from "@tanstack/react-query"
import { orpc } from "../lib/orpc"
import { m } from "../../paraglide/messages.js"
import { useLocale } from "../lib/locale"

export function Following() {
  const { label, name } = useLocale()
  const { data } = useQuery(orpc.notifications.following.queryOptions())

  return (
    <>
      <div className="section-h">
        <h2>{m.following_label()}</h2>
      </div>
      <div className="dash-card" data-testid="following-card">
        {data?.following.length ? (
          <ul className="pref-list" data-testid="following-list">
            {data.following.map((f) => (
              <li key={`${f.objectTypeCode}:${f.objectId}`}>
                {/* The thing's own name, in the reader's language — "Assumption
                    College U16 Boys", not "Team". A list of type labels reads as
                    "Team, Team, Team" and is not one anybody can act on. */}
                {name(f.names, f.name) || label("objectTypes", f.objectTypeCode)}
                <span className="meta"> · {label("objectTypes", f.objectTypeCode)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="push-note">{m.nothing_followed_yet()}</div>
        )}
      </div>
    </>
  )
}

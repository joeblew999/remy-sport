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
 * Shares `notifications.following` with the settings section, which also reads
 * `muted` from it. One endpoint, two readers, and react-query dedupes the
 * request — so this costs nothing beyond the component.
 */
import { useQuery } from "@tanstack/react-query"
import { orpc } from "../lib/orpc"
import { m } from "../../paraglide/messages.js"
import { useLocale } from "../lib/locale"
import { SectionHeading } from "./page"
import { EmptyState } from "./states"
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item"

export function Following() {
  const { label, name } = useLocale()
  const { data } = useQuery(orpc.notifications.following.queryOptions())

  return (
    <section data-testid="following-card">
      <SectionHeading title={m.following_label()} className="mt-0" />
      <ItemGroup data-testid="following-list">
        {data?.following.length ? (
          data.following.map((f) => (
            <Item variant="outline" size="sm" key={`${f.objectTypeCode}:${f.objectId}`} data-testid="following-entry">
              <ItemContent>
                {/* The thing's own name, in the reader's language — "Assumption
                    College U16 Boys", not "Team". A list of type labels reads as
                    "Team, Team, Team" and is not one anybody can act on. */}
                <ItemTitle>{name(f.names, f.name) || label("objectTypes", f.objectTypeCode)}</ItemTitle>
                <ItemDescription>{label("objectTypes", f.objectTypeCode)}</ItemDescription>
              </ItemContent>
            </Item>
          ))
        ) : (
          <EmptyState className="border-0">{m.nothing_followed_yet()}</EmptyState>
        )}
      </ItemGroup>
    </section>
  )
}

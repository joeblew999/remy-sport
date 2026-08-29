/**
 * Where an event is played.
 *
 * The tab rendered "not built yet" while `event_venues` and `venues` had both
 * been seeded since the fixtures were written — the address, the city, and
 * which court is the main one. Nothing needed building; the page simply never
 * asked.
 *
 * ## Two reference lists, joined here
 *
 * `venues.list` and `eventVenues.list` are the PO's generic domain reads: every
 * row, no filter, deliberately. They are reference-shaped — a venue list is
 * what is printed on a draw sheet — small, and cached with the rest of the
 * reference data, so filtering them in the browser costs one pass over a few
 * dozen rows and saves an endpoint that would exist to answer one page.
 *
 * That trade stops holding the day this platform has thousands of venues. The
 * fix then is a filter on the endpoint, not a bigger fetch here.
 */

import { useQuery } from "@tanstack/react-query"
import { orpc } from "../lib/orpc"
import { useLocale } from "../lib/locale"
import { m } from "../lib/i18n"

export function EventVenues({ eventId }: { eventId: string }) {
  const { name, label } = useLocale()

  // `staleTime: Infinity` for the same reason the reference payload uses it:
  // these are the PO's fixtures, and a re-seed is the only thing that changes
  // them. At the 30s default this refetched every venue on every remount.
  const { data: links, isPending: linksLoading } = useQuery(
    orpc.eventVenues.list.queryOptions({ staleTime: Infinity }),
  )
  const { data: venues, isPending: venuesLoading } = useQuery(
    orpc.venues.list.queryOptions({ staleTime: Infinity }),
  )

  const isPending = linksLoading || venuesLoading
  const here = (links?.items ?? []).filter((l) => l.eventId === eventId)
  const byId = new Map((venues?.items ?? []).map((v) => [v.id, v]))

  const rows = here
    .map((link) => ({ link, venue: byId.get(link.venueId) }))
    .filter((r): r is { link: (typeof here)[number]; venue: NonNullable<typeof r.venue> } =>
      Boolean(r.venue),
    )
    // The main court first — it is the one printed on a fixture list and the
    // one somebody asks for directions to.
    .sort((a, b) => Number(b.link.isPrimary) - Number(a.link.isPrimary))

  return (
    <div className="page-inner">
      <div className="dash-card" data-testid="event-venues">
        {isPending && <div className="empty">{m.loading()}</div>}
        {!isPending && rows.length === 0 && (
          <div className="empty" data-testid="event-venues-empty">{m.event_venues_none()}</div>
        )}
        {rows.map(({ link, venue }) => (
          <div key={venue.id} className="venue-row" data-testid={`venue-${venue.id}`}>
            <div>
              <div className="row-title">
                {name(venue.names as Record<string, string>, venue.id)}
                {link.isPrimary && (
                  <span className="venue-primary" data-testid={`venue-primary-${venue.id}`}>
                    {m.venue_primary()}
                  </span>
                )}
              </div>
              {/* The address as written, then the city from the vocabulary —
                  so a Thai reader gets "กรุงเทพมหานคร" rather than "BANGKOK",
                  the same as everywhere else a code is shown. */}
              <div className="row-meta">
                {[venue.address, label("cities", venue.cityCode)].filter(Boolean).join(" · ")}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

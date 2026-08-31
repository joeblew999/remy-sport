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

import { useLocale } from "../lib/locale"
import { useEventVenues } from "../lib/data"
import { m } from "../lib/i18n"

export function EventVenues({ eventId }: { eventId: string }) {
  const { name, label } = useLocale()
  // The join lives in `useEventVenues` — the fixture venue picker needs the
  // same "which courts does this event play at" answer, and two copies of it
  // is how one of them ends up offering a venue the event does not use.
  const { rows, isPending } = useEventVenues(eventId)

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
                {[venue.address, label("cities", venue.cityCode), label("provinces", venue.provinceCode)]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

import { Icon } from "../components/icon";
import { useMyEvents } from "../lib/data";
import { useSession } from "../lib/session";
import type { Route } from "../lib/router";
import { m } from "../lib/i18n";
import { useLocale } from "../lib/locale";

/**
 * The events you organise or follow.
 *
 * There was a "My Events" entry in the sidebar for months. It routed to
 * `#/events`, and `#/events` rendered the Discover page — the same component,
 * the same props, the same four events everybody sees. Two destinations, one
 * screen, and one of them named for something that did not exist. It was
 * deleted on 2026-08-29 rather than pointed somewhere plausible, because a
 * filtered list of what you organise or follow is a screen to build.
 *
 * This is that screen.
 *
 * ## The grouping is the server's answer
 *
 * `events.mine` returns each row with the strongest relation the reader holds
 * on it — OWNER, CO_ORGANIZER or FOLLOWER_EVENT — and the two sections are that
 * field, not an `organizerUserId === user.id` test done here. The admin console
 * used to make exactly that comparison in the browser, which is the OWNER
 * relation reimplemented in a component, and it was removed for the same
 * reason.
 *
 * A co-organiser is under Organising rather than in a third section: they run
 * the event, and the model's difference between them and an owner is about
 * *deleting* it, which is a control on the event page and not a heading here.
 */
/** One row as `useMyEvents` produces it — inferred, so it cannot drift. */
type MyEventRow = NonNullable<ReturnType<typeof useMyEvents>["data"]>["organising"][number];

export function MyEventsPage({ goto }: { goto: (r: Route) => void }) {
  const { locale, reference, name } = useLocale();
  const { user, loading } = useSession();
  const { data, isPending, error } = useMyEvents();

  const typeLabel = (code: string) =>
    name(reference?.eventTypes.find((t) => t.code === code)?.names, code);

  /**
   * The same row as Discover, because it is the same thing being listed.
   *
   * Duplicated markup rather than a shared component only because Discover's
   * row is inline there too; if a third page needs it, that is when it becomes
   * one. Two copies is not yet a pattern.
   */
  const row = (e: MyEventRow) => (
    <button
      key={e.id}
      className="event-row"
      data-testid={`my-event-${e.id}`}
      onClick={() => goto({ page: "event", id: e.id })}
    >
      <div className="date">
        <span className="day">{e.day ? String(e.day).padStart(2, "0") : "--"}</span>
        <span className="mo">{e.mo}</span>
      </div>
      <div className="title">
        <div className="name">{e.title}</div>
        <div className="meta">{e.organizer.toUpperCase()}</div>
      </div>
      <div><span className={`type ${e.type.toLowerCase()}`}>{typeLabel(e.type)}</span></div>
      <div className="loc">
        <div>{e.loc}</div>
        <span className="city">{e.city}</span>
      </div>
      <div className="div">{e.div}</div>
      <div><span className={`status ${e.status}`}>{e.statusLabel}</span></div>
      <div className="arrow"><Icon name="arrow" /></div>
    </button>
  );

  return (
    <>
      <div className="page-header">
        <div className="crumbs">
          <span>{m.nav_home()}</span>
          <span className="sep">/</span>
          <span>{m.nav_my_events()}</span>
        </div>
        <h1>{m.nav_my_events()}</h1>
        <div className={`sub ${locale === "th" ? "thai" : ""}`}>{m.my_events_sub()}</div>
      </div>

      {/* Signed out is the ordinary case for this page, not an error: the list
          is defined by relations to you, and a stranger holds none. */}
      {!loading && !user && (
        <div className="empty" data-testid="my-events-signin">{m.sign_in()}</div>
      )}

      {user && (
        <>
          <div className="section-h">
            <h2>{m.my_events_organising()}</h2>
          </div>
          <div className="event-list" data-testid="my-events-organising">
            {data?.organising.length
              ? data.organising.map(row)
              : !isPending && (
                  <div className="empty" data-testid="organising-none">
                    {m.my_events_organising_none()}
                  </div>
                )}
          </div>

          <div className="section-h">
            <h2>{m.my_events_following()}</h2>
          </div>
          <div className="event-list" data-testid="my-events-following">
            {data?.following.length
              ? data.following.map(row)
              : !isPending && (
                  <div className="empty" data-testid="following-none">
                    {m.my_events_following_none()}
                  </div>
                )}
          </div>

          {isPending && <div className="empty">{m.loading_events()}</div>}
          {error && <div className="empty">{m.events_load_failed()}</div>}
        </>
      )}
    </>
  );
}

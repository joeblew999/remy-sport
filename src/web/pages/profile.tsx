import { useEvents, useLiveGames } from "../lib/data";
import { useSession } from "../lib/session";
import { NotificationSettings } from "../components/notification-settings";
import type { Route } from "../lib/router";
import { m } from "../lib/i18n";

/**
 * You, and the things that are actually yours.
 *
 * Most of this page used to be invented. A live game that did not exist, with a
 * quarter, a clock and a scoreline. An activity feed of fixture strings. Four
 * "quick actions" — Create event, Add to roster · 12 players · 3 spots open,
 * Ask AI assistant, Export season report · PDF · spring 2026 — hardcoded in
 * English in a three-language app, for features that do not exist and buttons
 * that did nothing when pressed. And "Your events", which listed every event on
 * the platform under a possessive heading.
 *
 * All of it is gone rather than relabelled. A SAMPLE DATA banner is the right
 * answer for a fixture sitting beside real data; it is the wrong answer for a
 * dashboard made mostly of fixtures, where it reads as an apology for the page
 * rather than a warning about one section.
 *
 * What is left is true. Your events are the ones the model says you may edit —
 * `canEdit`, resolved per event and per viewer, so a co-organiser sees theirs
 * and a spectator sees none. The live section is the real broadcast list, the
 * same source the Live page reads.
 */
export function ProfilePage({ goto }: { goto: (r: Route) => void }) {
  const { user } = useSession();
  const { data: events = [], isPending: eventsLoading } = useEvents();
  const { data: live, isPending: liveLoading } = useLiveGames();

  // Yours, by the model's answer rather than by a heading. `canEdit` is
  // EDIT_EVENT resolved for this reader, so this is empty for a spectator —
  // which is correct, and is what the old version hid by showing everybody's.
  const mine = events.filter((e) => e.canEdit);
  // Only what can actually be watched. A "watch" link on a game nobody is
  // filming is a link to a black rectangle.
  const watchable = (live?.games ?? []).filter((g) => g.isBroadcasting);

  return (
    <>
      <div className="page-header">
        {/* The signed-in person, not a fixture. This greeted everybody as
            "Welcome back, Sukasem." — a hardcoded identity on the page whose
            entire job is to show you yourself, with no SAMPLE DATA label
            because it did not look like sample data. */}
        <div className="crumbs">{m.profile_crumb()}</div>
        <h1>{m.welcome_back({ name: user?.name || user?.email || "" })}</h1>
        <div className="sub">{user?.email ?? ""}</div>
      </div>

      <div className="page-inner">
        <div className="dash-grid">
          <div>
            <div className="section-h">
              <h2>{m.profile_watch_now()}</h2>
              <a className="more" onClick={() => goto({ page: "live" })} style={{ cursor: "pointer" }}>
                {m.open_court_view()}
              </a>
            </div>
            <div className="dash-card" data-testid="profile-live">
              {liveLoading && <div className="empty">{m.loading()}</div>}
              {!liveLoading && watchable.length === 0 && (
                <div className="empty" data-testid="profile-nothing-live">
                  {m.profile_nothing_live()}
                </div>
              )}
              {watchable.map((g) => (
                <button
                  key={g.id}
                  className="row-button"
                  data-testid={`profile-watch-${g.id}`}
                  onClick={() => goto({ page: "watch", id: g.id })}
                >
                  <div className="row-title">
                    {g.homeTeam} {m.versus()} {g.awayTeam}
                  </div>
                  <div className="row-meta">
                    {g.statusLabel}
                    {g.venue ? ` · ${g.venue}` : ""}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="section-h">
              <h2>{m.your_events()}</h2>
            </div>
            <div className="dash-card" data-testid="profile-events">
              {eventsLoading && <div className="empty">{m.loading()}</div>}
              {!eventsLoading && mine.length === 0 && (
                <div className="empty" data-testid="profile-no-events">
                  {m.profile_no_events()}
                </div>
              )}
              {mine.map((e) => (
                <button
                  key={e.id}
                  className="row-button"
                  data-testid={`profile-event-${e.id}`}
                  onClick={() => goto({ page: "event", id: e.id })}
                >
                  <div className="row-title">{e.title}</div>
                  <div className="row-meta">
                    {e.statusLabel} · {e.div}
                  </div>
                </button>
              ))}
            </div>

            <NotificationSettings />
          </div>
        </div>
      </div>
    </>
  );
}

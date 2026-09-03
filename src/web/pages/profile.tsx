import { useLiveGames, useMyEvents } from "../lib/data";
import { useSession } from "../lib/session";
import { Invitations } from "../components/invitations";
import { YourPlayers } from "../components/your-players";
import { Following } from "../components/following";
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
 * What is left is true. Your events come from `events.mine` — the ones you own,
 * co-organise, or follow — so a parent following their child sees theirs and
 * not an empty list. The live section is the real broadcast list, the same
 * source the Live page reads.
 */
export function ProfilePage({ goto }: { goto: (r: Route) => void }) {
  const { user } = useSession();
  const { data: myEvents, isPending: eventsLoading } = useMyEvents();
  const { data: live, isPending: liveLoading } = useLiveGames();

  /**
   * Yours, as the server resolves it — not "everything, filtered by canEdit".
   *
   * This page used to fetch `events.list` and keep the rows where `canEdit`
   * was true. Two things wrong with that. It downloads every event on the
   * platform to show you a handful, on the phone-in-a-school-gym network this
   * product is for. And it defines "yours" as "editable by you", so a player, a
   * referee, or a parent following their child saw an empty list — the people
   * this page exists for most.
   *
   * `events.mine` is the model's own answer: OWNER, CO_ORGANIZER or
   * FOLLOWER_EVENT, found by asking the resolver which events you hold a
   * relation on, so the authorisation is the query. Its own note in
   * src/api/events.ts says this replaced "a nav item that pointed at Discover
   * and showed everybody the same four events" — that fix landed on the nav
   * item and this page kept the old behaviour.
   */
  const mine = [...(myEvents?.organising ?? []), ...(myEvents?.following ?? [])];
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
            {/* Above "Your events" because it is the thing to act on, and
                because accepting one moves an event into the list below it. */}
            <Invitations />

            {/* The `guardians` table, which no screen had ever read. A parent
                signing in wants to know which team their child is on — this is
                the first thing on this page that answers it. */}
            <YourPlayers goto={goto} />

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

            {/* Content, not a device setting. It sat at the bottom of the push
                device list — a section about where notifications are delivered —
                so "Kanya Thongdee · Player" appeared under two browsers and a
                row of checkboxes. What a reader follows belongs with the rest of
                what is theirs. */}
            <Following />
          </div>
        </div>
      </div>
    </>
  );
}

import { useLocale } from "../lib/locale";
import { useSession } from "../lib/session";
import { useHoldings, useMyEvents, useOrgs, useTeamGames, useTeams } from "../lib/data";
import { Invitations } from "../components/invitations";
import { WhoAreYou } from "../components/who-are-you";
import { YourPlayers } from "../components/your-players";
import { YourGames } from "../components/your-games";
import { Following } from "../components/following";
import { LinkRow, PageHeader, PageInner, SectionHeading } from "../components/page";
import { Loading } from "../components/states";
import { formatDayShort } from "../lib/dates";
import { nextOf } from "../lib/api";
import { routeHref, type Route } from "../lib/router";
import type { Team } from "../data";
import { m } from "../lib/i18n";
import { ItemDescription, ItemGroup } from "@/components/ui/item";

const LIST = "gap-0 divide-y overflow-hidden rounded-xl border";

/**
 * Home: what you are connected to, and what is next.
 *
 * Built from `me.mine` — the relations this person holds and the platform
 * actions the model grants them — and from nothing else. One section per kind
 * of relation held, each row labelled with the model's own name for the
 * relation ("Head Coach", "Guardian", "Organisation Admin"), and a way to start
 * something only where the model grants the action and the relation is not yet
 * held: a coach with no team is offered one, an organiser with no event is
 * offered one, a referee is offered neither. Nobody is shown another kind of
 * person's empty state.
 *
 * This replaces a Profile page that was the union of every role's sections.
 * Walked on 2026-09-04 as all six seeded roles: every one of them saw at least
 * one other role's empty state — a coach was told "No children yet" and "You
 * are not organising any events yet" and nothing about his own teams; a parent
 * of four was asked what brought her here. Two more screens went with it:
 * `#/events` (organise + follow, which is two of the sections here) and `#/team`
 * with no id, which guessed at "your team" from a list.
 *
 * Signing in lands here. A visitor at the root gets Discover instead — there is
 * nothing to derive a home from until somebody holds something.
 */
export function HomePage({ goto }: { goto: (r: Route) => void }) {
  const { user } = useSession();
  const { holdings, can, isPending } = useHoldings();
  const { label } = useLocale();
  const { data: myEvents } = useMyEvents();
  const { data: teams } = useTeams();
  const { data: orgs } = useOrgs();

  // Held, as opposed to followed: following is its own section below.
  const on = (type: string) =>
    holdings.filter((h) => h.type === type && !h.relation.startsWith("FOLLOWER_"));
  const teamHeld = on("TEAM");
  const orgHeld = on("ORG");
  const eventHeld = on("EVENT");
  const gameHeld = on("GAME");
  const playerHeld = on("PLAYER");
  const holdsNothing = holdings.length === 0;

  /** How you hold one thing, in the model's words: "Head Coach · Team Follower". */
  const relationsOn = (type: string, id: string) =>
    holdings
      .filter((h) => h.type === type && h.id === id)
      .map((h) => label("relations", h.relation))
      .join(" · ");

  const teamRows = (teams ?? []).filter((t) => teamHeld.some((h) => h.id === t.id));
  const orgRows = (orgs ?? []).filter((o) => orgHeld.some((h) => h.id === o.id));
  const organising = myEvents?.organising ?? [];

  return (
    <>
      <PageHeader
        crumbs={[{ label: m.home_crumb() }]}
        title={m.welcome_back({ name: user?.name || user?.email || "" })}
        sub={m.home_sub()}
      />

      <PageInner className="flex flex-col gap-6" data-testid="home">
        {isPending && <Loading />}
        {!isPending && (
          <>
            {/* Things to act on first: an invitation moves an event into the
                list below it once accepted. */}
            <Invitations />

            {/* Only somebody holding nothing at all is asked what they are.
                Pim holds four children and follows two teams; asking her what
                brings her here was the page not looking. */}
            {holdsNothing && <WhoAreYou />}

            {gameHeld.length > 0 && <YourGames />}

            {(teamHeld.length > 0 || can?.CREATE_TEAM) && (
              <section>
                <SectionHeading title={m.your_teams()} className="mt-0" />
                <ItemGroup className={LIST} data-testid="home-teams">
                  {teamRows.map((t) => (
                    <TeamRow key={t.id} team={t} relations={relationsOn("TEAM", t.id)} />
                  ))}
                  {/* No "you are not coaching yet" sentence: the row below says
                      what can be done, and the sentence was a coach's on the
                      admin's page. CREATE_TEAM is a platform grant; the form is
                      on the school, the one thing a new team needs chosen. */}
                  {can?.CREATE_TEAM && (
                    <LinkRow data-testid="home-create-team" href={routeHref({ page: "orgs" })} title={m.home_create_team()} />
                  )}
                </ItemGroup>
              </section>
            )}

            {/* Children you are guardian to, or yourself as a player. Shown to
                somebody holding nothing else too: that is who a first-time
                parent is, and "Add a child" is their way in. */}
            {(playerHeld.length > 0 || holdsNothing) && <YourPlayers goto={goto} />}

            {(eventHeld.length > 0 || can?.CREATE_EVENT) && (
              <section>
                <SectionHeading title={m.your_events()} className="mt-0" />
                <ItemGroup className={LIST} data-testid="home-events">
                  {organising.map((e) => (
                    <LinkRow key={e.id} data-testid={`home-event-${e.id}`} href={routeHref({ page: "event", id: e.id })} title={e.title}>
                      <ItemDescription>{[e.statusLabel, e.division, label("relations", e.relation)].join(" · ")}</ItemDescription>
                    </LinkRow>
                  ))}
                  {/* The event form lives on the console page, which nothing
                      linked an organiser to until this row. */}
                  {can?.CREATE_EVENT && (
                    <LinkRow data-testid="home-create-event" href={routeHref({ page: "admin" })} title={m.home_create_event()} />
                  )}
                </ItemGroup>
              </section>
            )}

            {orgHeld.length > 0 && (
              <section>
                <SectionHeading title={m.your_orgs()} className="mt-0" />
                <ItemGroup className={LIST} data-testid="home-orgs">
                  {orgRows.map((o) => (
                    <LinkRow key={o.id} data-testid={`home-org-${o.id}`} href={routeHref({ page: "org", id: o.id })} title={o.name}>
                      <ItemDescription>{[o.city, relationsOn("ORG", o.id)].filter(Boolean).join(" · ")}</ItemDescription>
                    </LinkRow>
                  ))}
                </ItemGroup>
              </section>
            )}

            {/* Always, once signed in: FOLLOW_* is granted to anyone with an
                account, so this is a section everybody can fill — the same rule
                as the others, where the relation is not yet held but the action
                is granted. Its empty state is its own, not another role's. */}
            <Following />

            {/* The platform admin's real home. MANAGE_ALL_USERS is the model's
                answer, not a role string; the account menu offers the same door. */}
            {can?.MANAGE_ALL_USERS && (
              <section>
                <SectionHeading title={m.nav_admin()} className="mt-0" />
                <ItemGroup className={LIST} data-testid="home-admin">
                  <LinkRow data-testid="home-admin-console" href={routeHref({ page: "admin" })} title={m.home_admin()} />
                </ItemGroup>
              </section>
            )}
          </>
        )}
      </PageInner>
    </>
  );
}

/**
 * One team you hold, and its next fixture — the one fact a coach opens the
 * app for. Its own component so each row can ask `games.list` for its team;
 * a person holds two or three, not thirty.
 */
function TeamRow({
  team,
  relations,
}: {
  team: Team;
  relations: string;
}) {
  const { locale } = useLocale();
  const { data } = useTeamGames(team.id);
  const next = nextOf(data?.games ?? []);
  return (
    <LinkRow data-testid={`home-team-${team.id}`} href={routeHref({ page: "team", id: team.id })} title={team.name}>
      <ItemDescription>{[team.orgName, relations].filter(Boolean).join(" · ")}</ItemDescription>
      <ItemDescription data-testid={`home-team-next-${team.id}`}>
        {next
          ? m.home_next_game({
              opponent: next.opponent,
              when: next.live ? next.statusLabel : formatDayShort(locale, new Date(next.startsAt)),
            })
          : m.home_no_next_game()}
      </ItemDescription>
    </LinkRow>
  );
}

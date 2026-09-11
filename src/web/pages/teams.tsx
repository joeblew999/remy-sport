import { QueryError } from "../components/query-error";
import { useMine, useTeams } from "../lib/data";
import { useLocale } from "../lib/locale";
import { m } from "../lib/i18n";
import { routeHref } from "../lib/router";
import { ButtonLink } from "../components/button-link";
import { PageHeader, PageInner, SectionHeading } from "../components/page";
import { EmptyState, Loading } from "../components/states";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";

/**
 * @answers BROWSE_TEAMS
 *
 * Every team on the platform, and yours at the top.
 *
 * `teams.list` declared `BROWSE_TEAMS` since it was written and was read by
 * nothing but the admin console's delete list, so a parent looking for their
 * child's opponents had no way to see who else plays.
 *
 * Modelled on `OrgsPage` deliberately, down to the "yours first" section: two
 * directories over the same kind of data that looked different would be two
 * things to learn.
 *
 * A row goes to the team page that already exists. Nothing here is a second
 * home for a team — it is the way in.
 */
export function TeamsPage() {
  const teams = useTeams();
  const { label } = useLocale();

  /**
   * Which of them are yours, from the model rather than from a role.
   *
   * `useMine("TEAM")` is ListObjects — coach, manager, the player themselves, a
   * follower. The relation comes back with it, so a row can say *why* it is
   * yours rather than just that it is.
   *
   * **Both answers, or neither**, the same rule as the organisations list and
   * for the same reason: a section inserted above rows already on screen moves
   * them, and a `click` whose target moves between `mousedown` and `mouseup`
   * fires on the common ancestor, following no link.
   *
   * Fixed here without a failing test, because this is the same component shape
   * as the page whose test did fail. Waiting for a second spec to catch the
   * second copy is how a known defect ships twice.
   * docs/done/2026-09-09-18-browser-tier-flakiness.md.
   */
  const holdings = useMine("TEAM");
  const mine = holdings.data;
  const held = new Map(mine.map((h) => [h.id, h.relation]));
  const yours = (teams.data ?? []).filter((t) => held.has(t.id));
  // `isLoading`, not `isPending` — see the note on the organisations list: the
  // holdings query is disabled without a session, and a disabled query is
  // pending for ever.
  const pending = teams.isPending || holdings.isLoading;

  return (
    <div data-testid="teams-page">
      <PageHeader title={m.teams_heading()} sub={m.teams_sub()} />
      <PageInner className="flex flex-col gap-6">
        {!pending && yours.length > 0 && (
          <section>
            <SectionHeading title={m.your_teams()} className="mt-0" />
            <ItemGroup data-testid="your-teams">
              {yours.map((t) => (
                <Item variant="outline" size="sm" key={t.id} data-testid={`your-team-${t.id}`}>
                  <ItemContent>
                    <ItemTitle>{t.name}</ItemTitle>
                    {/* Why this row is above the fold, in the model's own word for
                        it — "Head Coach", "Team Follower" — in the reader's
                        language. This printed the code, HEAD_COACH, until the
                        2026-09-04 walk. */}
                    <ItemDescription>
                      {[t.orgName, label("relations", held.get(t.id)!)].filter(Boolean).join(" · ")}
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <ButtonLink variant="outline" href={routeHref({ page: "team", id: t.id })}>
                      {m.team_open()}
                    </ButtonLink>
                  </ItemActions>
                </Item>
              ))}
            </ItemGroup>
          </section>
        )}

        {teams.error && <QueryError error={teams.error} retry={teams.refetch} pending={teams.isFetching} />}
        {pending ? (
          <Loading>{m.loading_teams()}</Loading>
        ) : teams.data?.length ? (
          <ItemGroup data-testid="teams-list">
            {teams.data.map((t) => (
              <Item variant="outline" size="sm" key={t.id} data-testid={`team-row-${t.id}`}>
                <ItemContent>
                  <ItemTitle>{t.name}</ItemTitle>
                  {/* Age group and gender in the reader's language — `toTeam` has
                      already resolved them from the reference vocabulary. */}
                  <ItemDescription>
                    {[t.orgName, t.ageGroupLabel, t.genderLabel].filter(Boolean).join(" · ")}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <ButtonLink variant="outline" href={routeHref({ page: "team", id: t.id })}>
                    {m.team_open()}
                  </ButtonLink>
                </ItemActions>
              </Item>
            ))}
          </ItemGroup>
        ) : teams.error ? null : (
          <EmptyState data-testid="teams-empty">{m.teams_empty()}</EmptyState>
        )}
      </PageInner>
    </div>
  );
}

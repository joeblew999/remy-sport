import { useMine, useTeams } from "../lib/data";
import { m } from "../lib/i18n";
import type { Route } from "../lib/router";

/**
 * @answers BROWSE_TEAMS
 *
 * Every team on the platform, and yours at the top.
 *
 * `BROWSE_TEAMS` is granted to PUBLIC and `teams.list` has declared exactly
 * that action since it was written — `openTo("BROWSE_TEAMS")`, one line above
 * the route. The endpoint was built, enforced, and read by nothing except the
 * admin console's delete list and two screens that filter it down to one team.
 * So a parent looking for their child's opponents next Saturday had no way to
 * see who else plays.
 *
 * Modelled on `OrgsPage` deliberately, down to the "yours first" section. Two
 * directories over the same kind of data that looked different would be two
 * things to learn, and the reasoning recorded there holds here unchanged: this
 * page's job is browsing, and yours is a shortcut on top of it rather than a
 * filter, marked so a person can see why a row is above the fold.
 *
 * A row goes to the team page that already exists. Nothing here is a second
 * home for a team — it is the way in.
 */
export function TeamsPage({ goto }: { goto: (r: Route) => void }) {
  const teams = useTeams();

  /**
   * Which of them are yours, from the model rather than from a role.
   *
   * `useMine("TEAM")` is ListObjects — head coach, assistant, manager, the
   * player themselves, a follower. The relation comes back with it, so the row
   * can say *why* it is yours instead of just that it is.
   */
  const { data: mine } = useMine("TEAM");
  const held = new Map(mine.map((h) => [h.id, h.relation]));
  const yours = (teams.data ?? []).filter((t) => held.has(t.id));

  return (
    <div className="page-inner" data-testid="teams-page">
      <div className="page-header">
        <div className="crumbs">{m.nav_teams()}</div>
        <h1>{m.teams_heading()}</h1>
        <div className="sub">{m.teams_sub()}</div>
      </div>

      {yours.length > 0 && (
        <>
          <div className="section-h">
            <h2>{m.your_teams()}</h2>
          </div>
          <div className="dash-card" data-testid="your-teams">
            {yours.map((t) => (
              <div key={t.id} className="device-row" data-testid={`your-team-${t.id}`}>
                <div>
                  <div className="device-label">{t.name}</div>
                  {/* Why this row is above the fold, in the model's own word for
                      it — head coach, assistant, follower. "Yours" alone would
                      be the page deciding. */}
                  <div className="device-meta">
                    {[t.orgName, held.get(t.id)].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <button className="btn" onClick={() => goto({ page: "team", id: t.id })}>
                  {m.team_open()}
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {teams.isPending ? (
        <div className="empty">{m.loading_teams()}</div>
      ) : teams.data?.length ? (
        <div className="dash-card" data-testid="teams-list">
          {teams.data.map((t) => (
            <div key={t.id} className="device-row" data-testid={`team-row-${t.id}`}>
              <div>
                <div className="device-label">{t.name}</div>
                {/* Age group and gender in the reader's language — `toTeam` has
                    already resolved them from the reference vocabulary. */}
                <div className="device-meta">
                  {[t.orgName, t.ageGroupLabel, t.genderLabel].filter(Boolean).join(" · ")}
                </div>
              </div>
              <button className="btn" onClick={() => goto({ page: "team", id: t.id })}>
                {m.team_open()}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty" data-testid="teams-empty">
          {m.teams_empty()}
        </div>
      )}
    </div>
  );
}

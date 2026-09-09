# Plan — one navigation trail, on every screen

Status: implemented 2026-09-09, `18494d2`.

The Product Owner: an organisation can be drilled into and backed out of, and
the other entry points cannot — decide it and make it consistent.

## What was there

Fifteen `PageHeader`s, three habits.

| Habit | Screens |
| --- | --- |
| Passed its **own** name as a crumb — a label, not a path | home, discover, live, teams, orgs, admin, devices, notifications, login, profile |
| Passed the **ancestors**, linked — the right thing | event, org, player, game, video |
| Passed **nothing** | team |

Two consequences the Product Owner saw:

- **A team was a one-way trip.** It is reached from the directory, from a
  schedule and from a player, and none of those had a way back.
- **Discover was shaped unlike every other landing page**: two crumbs, the first
  an unlinked "Home".

An unlinked crumb is the worst of the three. It looks like a way out and is not.

## The rule

**`crumbs` are the ancestors, each one linked. The page itself is the `h1` at
the end of the trail. A top-level screen has no ancestors and passes nothing.**

The trail lives in the site header, which is where `sidebar-07` puts it and
where the page title already moved on the same day. One element says both where
you are and how to get back, instead of a title in the bar and a separate row of
ancestors in the content band. Ancestors fold away below `sm`, as the block
folds them: on a phone the row belongs to the page you are on, and the sidebar
is the way back.

## The trails

| Screen | Trail |
| --- | --- |
| home, discover, live, teams, orgs, admin, devices, notifications, login, profile | *(top level)* |
| team | Teams › **team** |
| player | Teams › **player** |
| org | Organisations › **org** |
| event | Discover › **event** |
| game | Discover › event › division › **game** |
| watch / broadcast | Games › **game** |

## Held by a check

`tests/repo/navigation.test.ts` reads every crumb literal on every page,
including the ones built through a variable, and fails on any without an
`href`. That catches both mistakes at once: a page naming itself in its own
trail, and a step back that cannot be taken.

## Verified

935 unit/repository/Worker, 346 rendering, typecheck, lint, and the browser
tier. The trail was walked by hand on a team page — in Thai, in dark — where it
reads `ทีม › ทีมบาสเกตบอลอัสสัมชัญ U16 ชาย` with the first step linked.

## Not done

- **Where a crumb goes back to is fixed, not remembered.** A team reached from a
  schedule goes back to Teams, not to that schedule. That is the ordinary
  breadcrumb contract — a place in a hierarchy, not history — and the browser's
  Back button is what returns you to where you came from. If the Product Owner
  wants the trail to follow the route taken, that is a different feature.
- The sidebar's own highlighted entry is not derived from the trail.

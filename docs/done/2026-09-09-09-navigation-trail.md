# Plan — one navigation trail, on every screen

Archive: completed (2026-09-09). Crumbs are the ancestors and the page is the h1, held by tests/repo/navigation.test.ts; the route taken is carried in the URL and pinned by tests/unit/route-trail.test.ts.

Current work: [project index](../README.md). Original evidence follows.

Status: implemented 2026-09-09, initially `18494d2`, with actual-route history
added in `5d0c57f`. Reconciliation remains open: the “Not done” paragraph below
predates that later commit. Check current behavior before continuing; the
sidebar highlight and installed-app Back acceptance remain separate concerns.

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

## Deepened, 2026-09-09

A player's trail said `Teams › them`, skipping the team they belong to — which
the page has held all along to fetch its fixtures. It is `Teams › their team ›
them` now, both ancestors linked. That is the hierarchy taken from data the page
already had, not from where the reader happened to come from.

## Not done

- **Where a crumb goes back to is a place, not a memory.** A team reached from a
  schedule goes back to Teams, not to that schedule. That is the ordinary
  breadcrumb contract — a position in a hierarchy — and the browser's Back
  button is what returns you to where you came from. Making the trail follow the
  route taken would mean carrying the route in the URL, which is a different
  feature and a larger one: it changes what a shared link means.
- The sidebar's own highlighted entry is not derived from the trail.

## Closed 2026-09-09

Both halves done. The hierarchy is consistent — crumbs are the ancestors, each
linked, the page is the `h1` at the end, a top-level screen passes nothing — and
`tests/repo/navigation.test.ts` fails any crumb without an `href`.

Then the Product Owner asked for the part this file had listed as *not done*: a
crumb that goes back the way you came, everywhere. That is implemented. `from`
is attached in `routeHref` itself, so all 85 call sites and every future link
get it without asking; only drill-in pages carry one; the chain is capped at
four and each step keeps its own tab. `RouteCrumb` names each step from the
route rather than from a label in the URL, so a rename cannot leave a stale
crumb behind. `tests/unit/route-trail.test.ts` pins the six rules.

Two bugs found by walking it rather than by a test, both fixed and recorded in
the commit: a step back recorded a step forward, so the URL grew in a circle;
and the Roster and Schedule buttons on a team scrolled nowhere because this
router's own scroll restoration undid the page's jump.

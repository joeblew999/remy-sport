# Completed work and superseded plans

These are retained for evidence and context. **Superseded** means another active
plan owns the remaining work; it does not mean every original checkbox was done.
Return to [current work](../README.md) before starting anything.

| Record | Disposition | Evidence or remaining owner |
| --- | --- | --- |
| [Plan — modern tools do what `scripts/` does by hand](2026-09-05-01-modern-tooling.md) | Completed | Tooling migration; wider CLI redesign was stopped. |
| [Plan — every dependency at latest, and staying there](2026-09-05-02-latest.md) | Completed | Dependency migration; later upgrades require a fresh task. CI and Dependabot were removed by request. |
| [Plan — fewer dependencies](2026-09-05-03-fewer-dependencies.md) | Completed | Dependency cleanup verified September 6. |
| [GUI walk — what a phone shows, and what was fixed](2026-09-06-01-gui-walk.md) | Superseded | Historical walkthrough. Unconfirmed restart/profile observations are retained in the active index for rechecking. |
| [Plan — who sees what, generated and checked](2026-09-06-02-who-sees-what.md) | Superseded | The team matrix landed; remaining whole-app coverage belongs to GAP-06–08 in [active plan](../2026-09-07-01-react-domain-coverage.md). |
| [Plan — one gate: the GUI declares, the server decides](2026-09-06-03-one-gate.md) | Superseded | Shared gates landed; remaining coverage and reveal-mode proposals belong to [active plan](../2026-09-07-01-react-domain-coverage.md). |
| [Staging broadcasting rollout](2026-09-07-03-staging-broadcast.md) | Completed | The requested staging verification finished. Ongoing isolation limits remain in [active plan](../2026-09-07-04-staging-verification.md). |
| [Connected GUI plan](2026-09-07-05-gui-connections.md) | Completed | Connected GUI foundation verified locally; exhaustive coverage remains in the active domain register. |
| [Plan — convert the GUI to shadcn](2026-09-08-01-typography-and-design-system.md) | Superseded | The initial conversion landed; composition and visual acceptance continue in [active plan](2026-09-09-07-main-content-on-the-registry.md). Archiving does not assert the full port was complete. |
| [Plan — the top of the page on a phone](2026-09-08-02-mobile-top-of-page.md) | Completed | Delivered through the GUI conversion; subsequent shell changes belong to the active main-content plan. |
| [oRPC Blume documentation review](2026-09-09-03-orpc-blume-review.md) | Completed | Runtime review delivered; no adoption claimed. |
| [Fumapress source review for Remy Sport](2026-09-09-05-fumapress-source-review.md) | Superseded | Source review delivered; integration and external discovery continue in [active plan](../2026-09-09-04-blume-public-help.md). |
| [Previous project index](2026-09-09-project-status-checkpoint.md) | Superseded | Historical deployment/test evidence and shared-browser handover. |
| [Notifications off the devices page](2026-09-09-06-notifications-off-the-devices-page.md) | Completed | Sessions and settings split onto their own routes, with `MANAGE_OWN_NOTIFICATION_CHANNELS` moved to the code that answers it. The page it created is rebuilt in [active plan](../2026-09-09-08-notifications-page-two-channels.md), which also carries the unfixed help content. |
| [Main content on the registry](2026-09-09-07-main-content-on-the-registry.md) | Completed | `dashboard-01`'s shell adopted from the registry; lists are `ItemGroup`/`Item` as shipped; `--font-heading` restored and the 44px control height made a `pointer: coarse` rule. Stage 4 was dropped because the survey disproved its premise — the reason is in the closing record. Two unre-read style allowlists are named there. |
| [One navigation trail](2026-09-09-09-navigation-trail.md) | Completed | Crumbs are the ancestors and the page is the `h1`, held by `tests/repo/navigation.test.ts`; the route taken is carried in the URL (`5d0c57f`) and pinned by `tests/unit/route-trail.test.ts`. |

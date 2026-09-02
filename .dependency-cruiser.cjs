/**
 * The dependency rules this repo has always had in its head.
 *
 * Written down because they were enforced by hoping. The Worker importing
 * `src/web` is the one that actually happened: sending the sign-in email from
 * the product's own messages meant importing the SPA, which typechecks only by
 * accident and inverts the layering. I fixed it by moving files, which fixes
 * that instance and prevents nothing.
 *
 * `dependency-cruiser` rather than a fifth bespoke script in `scripts/` — this
 * is a solved problem and the config is the whole implementation.
 */
module.exports = {
  forbidden: [
    {
      name: "worker-must-not-import-spa",
      comment:
        "The Worker is the server; src/web is a browser bundle. An import that way " +
        "round drags React and DOM types into the Worker's compile, and the Worker's " +
        "tsconfig excludes src/web so it typechecks only by accident. Shared code " +
        "belongs outside both — src/domain for the model, src/paraglide for the " +
        "product's copy, which is exactly why the messages compile there now.",
      severity: "error",
      from: { path: "^src/(?!web/)" },
      to: { path: "^src/web/" },
    },
    {
      name: "spa-reaches-only-the-shared-roots",
      comment:
        "The SPA's runtime reach is src/web, src/domain and src/paraglide, and " +
        "nothing else. It may still import TYPES from anywhere — `import type " +
        "{ Router }` is how the client is typed, and types erase. What it must not " +
        "do is import an implementation: that would pull drizzle, Better Auth and " +
        "the D1 bindings into the browser bundle. " +
        "An allowlist, where this was once a denylist of `^src/(api|db|routes|mail)/`. " +
        "A denylist can only forbid the directories that existed when it was " +
        "written, so a NEW top-level directory imported by the SPA passed it in " +
        "silence — and that is not just untidy layering. `sources` in " +
        "scripts/lib/prepare.ts lists the roots the bundle is rebuilt from, and a " +
        "root missing from it means an edit there does not rebuild. Demonstrated " +
        "end to end on 2026-09-02: a new src/newthing/ imported from main.tsx, every " +
        "gate green, and a deploy that would have shipped the previous bundle. This " +
        "rule is what keeps that list honest — a new shared root has to be added " +
        "here, deliberately, and prepare.ts is the next thing to edit.",
      severity: "error",
      from: { path: "^src/web/" },
      to: {
        path: "^src/(?!web/|domain/|paraglide/)",
        // A type-only import compiles to nothing, and lib/orpc.ts depends on
        // exactly that to type the client against the real router.
        dependencyTypesNot: ["type-only"],
      },
    },
    {
      name: "no-circular",
      comment:
        "A cycle means neither module can be understood without the other, and it " +
        "makes module initialisation order load-bearing. It found one the day it " +
        "was added: base.ts imported the relation resolver while relations.ts " +
        "imported `type Db` back out of base. TypeScript allowed it because a type " +
        "import erases, so nothing complained — `Db` lives in src/api/db.ts now.",
      severity: "error",
      // The drizzle schema files reference each other's tables and that is the
      // documented pattern rather than an accident: `references(() => org.id)`
      // takes a thunk *so that* two tables can point at one another. `team.org_id`
      // and `game.event_id` cross the app/fixtures split in opposite directions,
      // and the split is by ownership — ours versus the PO's — which is a more
      // useful boundary than the reference graph. Nothing is read at module load,
      // so the cycle is inert.
      from: { pathNot: "^src/db/(app|fixtures)-schema\\.ts$" },
      to: { circular: true },
    },
    {
      name: "domain-is-the-root",
      comment:
        "src/domain is the Product Owner's model and the schemas derived from it. " +
        "It is the bottom of the stack: if it reaches back up into the API, the " +
        "database or the SPA, the direction of the whole chain is inverted.",
      severity: "error",
      from: { path: "^src/domain/" },
      to: { path: "^src/(api|routes|web|mail)/" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    // Generated: the messages are compiled output, and the SPA's own config is
    // a build file rather than part of either graph.
    exclude: { path: "^src/paraglide/" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "types"],
    },
  },
}

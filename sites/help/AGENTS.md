# Independent help package

This directory is intentionally outside the root package's dependency graph.
Do not turn it into a root workspace, add its dependencies to the app, import
app source, share node_modules, or copy its output into the app's dist directory.

Use `bun run ops docs dev`, `author`, `stop`, `check`, `preview`, `lock` or `clean` from the repository root.
Remote check/deploy/status/rollback/gemini require --env staging or production.
The command owns preparation and verification. Generated deployment settings
come from shared CLI target resolution; never edit deployment.generated.json. Never run a Fumapress build from
the repository root. Keep the root app's Vite and Wrangler configuration intact.

Plans and evidence belong in ../../docs/2026-09-09-04-blume-public-help.md.
This is unpublished public help with 39 pages across English, Thai and Japanese.
MCP and Studio run in sibling packages with their own dependencies; never import
them into this public build. Translation drafts still need human review.

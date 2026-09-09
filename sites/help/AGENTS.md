# Independent help package

This directory is intentionally outside the root package's dependency graph.
Do not turn it into a root workspace, add its dependencies to the app, import
app source, share node_modules, or copy its output into the app's dist directory.

Use `bun run ops docs check`, `preview` or `clean` from the repository root.
The command owns preparation and verification. Never run a Fumapress build from
the repository root. Keep the root app's Vite and Wrangler configuration intact.

Plans and evidence belong in ../../docs/2026-09-09-04-blume-public-help.md.
This is an unpublished proof with three sample pages, not production content.

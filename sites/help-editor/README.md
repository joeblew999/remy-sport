# Local Fuma Studio

Run `bun run ops docs author` from the repository root. This starts Fuma Studio
at http://127.0.0.1:8793 and live help at http://127.0.0.1:8791 automatically.
`bun run ops docs stop` stops them. No app dependencies or configuration change.

The editor has its own installation and uses the upstream `fumadocs-studio` CLI.
Only existing Markdown under `sites/help/content` is writable. Saving changes
local files, never production or Git. Uploads are disabled. The shared check
uses disposable fixtures to verify conflicts, persistence, collaboration and
path restrictions, plus untouched round trips for all actual guides.

For editing, collaboration limitations and publication scope, see
[the help README](../help/README.md).

# Read-only help MCP

Use `bun run ops docs dev` or `bun run ops docs author` from the repository root.
The shared CLI starts this service at http://127.0.0.1:8792/mcp, prepares its frozen
installation and owns cleanup. `bun run ops docs check` runs its protocol tests.

This package uses the official MCP SDK to retrieve public documentation over
loopback HTTP. It imports no app/help source and has no write or model-provider
capabilities. See [the help README](../help/README.md) for connection details.

## Application connection and discovery checks

The local companion now also offers `list_events`, `get_event`, `list_teams`,
`get_team`, `list_games` and `get_game` against the app at 127.0.0.1:8787.
Every call checks the generated application schema and refuses protected reads.
No cookies, bearer tokens or API keys are forwarded. Writes are not exposed.

From the repository root, `bun run ops docs discover` checks six real public
reads against the running local app. Supply an app origin and optional public
help origin to check remote reachability and basic crawl eligibility. This
command does not stop existing servers. Results and Gemini function declarations
are in this package’s ignored .proof directory. Use `declarations()` and
`callApplication()` from application.mjs in an explicitly configured Gemini
function-calling client; declarations alone do not execute a model-selected call.
The MCP protocol offers the same executor. The consumer Gemini app does not
become connected merely by indexing a schema. Public hosting and a real model
invocation remain separate acceptance steps.

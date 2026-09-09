# Read-only help MCP

Use `bun run ops docs dev` or `bun run ops docs author` from the repository root.
The shared CLI starts this service at http://127.0.0.1:8792/mcp, prepares its frozen
installation and owns cleanup. `bun run ops docs check` runs its protocol tests.

This package uses the official MCP SDK to retrieve public documentation over
loopback HTTP. It imports no app/help source and has no write or model-provider
capabilities. See [the help README](../help/README.md) for connection details.

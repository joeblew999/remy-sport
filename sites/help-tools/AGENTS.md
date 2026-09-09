# Read-only help tools

Independent package: never import app source or share dependencies with root/help.
The Worker reads generated documentation through its own static asset binding;
local Vite uses the exact loopback asset origin. Public app reads
use the explicit allowlist and verify the generated OpenAPI contract. No private
app APIs, credentials, filesystem writes or model-provider calls. Keep protocol
checks under the shared `bun run ops docs check` workflow. The plan and upstream
records remain in ../../docs/2026-09-09-04-blume-public-help.md.

# Read-only help tools

Independent package: never import app source or share dependencies with root/help.
Read generated documentation over the loopback help HTTP server only. No private
app APIs, credentials, filesystem writes or model-provider calls. Keep protocol
checks under the shared `bun run ops docs check` workflow. The plan and upstream
records remain in ../../docs/2026-09-09-04-blume-public-help.md.

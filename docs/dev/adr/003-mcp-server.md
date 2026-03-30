# ADR 003: MCP Server via Hono + Zod OpenAPI

**Status:** Proposed (needs more research)

## Context

The app already uses Hono with `@hono/zod-openapi` — every API route has Zod schemas and generates an OpenAPI spec at `/doc`. Since MCP (Model Context Protocol) can be served from OpenAPI-described endpoints, we get an MCP server essentially for free.

This would let AI agents (Claude, etc.) interact with the Remy Sport API natively — reading data, creating users, managing resources — all through the existing typed endpoints.

### Key constraint: MCP proxy/bridge

Claude Code (the agent building this app) needs to connect to the MCP server it creates. This creates a chicken-and-egg problem: restarting Claude to add the MCP config loses context. We need an **MCP proxy/bridge** that:

- Runs locally and proxies MCP requests to the remote Cloudflare Worker
- Can be started/restarted without restarting Claude
- Supports hot-reload when the remote MCP server changes
- Does NOT require reinventing the wheel — use an existing proxy solution

**This is the hardest part of the design and needs more research before implementation.**

## Decision

TBD — needs research on:
- Best MCP adapter for Hono/Cloudflare Workers
- Which endpoints to expose via MCP
- Auth/authorization for MCP clients
- Better Auth MCP plugin integration
- **MCP proxy/bridge approach** — find an existing solution that lets Claude connect to a remote MCP server without self-restart (e.g. `mcp-proxy`, Cloudflare's MCP tools, or similar)

## Taskfile

| Task | Description |
|---|---|
| `task mcp:start` | Start local MCP proxy bridge |
| `task mcp:test` | Test MCP server connectivity and tool listing |

## Consequences

- AI agents get typed access to the full API
- No extra code needed for tools — Zod schemas become MCP tool definitions
- Security model needs careful design (which tools, which auth)
- Proxy/bridge approach avoids Claude restart requirement

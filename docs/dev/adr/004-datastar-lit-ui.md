# ADR 004: Datastar + Lit UI Layer

**Status:** Proposed

## Context

The app currently renders all HTML as inline template literals in view functions (`src/views/*.ts`). This works for Phase 0 (auth, login, versions) but won't scale to the interactive features in the roadmap — live scores (Phase 6), bracket displays (Phase 3), score entry (Phase 4), and real-time court status boards.

We need a UI strategy that:
- Works with server-rendered HTML (our current pattern)
- Adds reactivity without a heavy client framework (no React/Vue/Svelte bundle)
- Supports real-time updates via SSE/WebSocket (roadmap Phase 6)
- Keeps the Cloudflare Workers + Hono stack unchanged
- Enables reusable components for repeated UI patterns (cards, tables, brackets)

## Decision

Adopt **Datastar** for server-driven reactivity and **Lit** for reusable Web Components.

### Why Datastar

- **11KB** total — no build step needed, load from CDN like we do with DaisyUI/Tailwind
- Server-driven via **SSE** (Server-Sent Events) — server pushes HTML fragments and signal patches, no client-side state management
- `data-*` attributes on plain HTML — works with our existing template literal views
- TypeScript SDK available (`@starfederation/datastar`) for SSE response helpers
- Aligns with Hono's server-first philosophy — routes return SSE streams, not JSON

### Why Lit

- Web Components standard — works everywhere, no framework lock-in
- Small runtime (~7KB), Shadow DOM encapsulation
- TypeScript decorators for reactive properties
- Datastar's `data-attr` plugin passes signals to Lit components as JSON attributes — deep reactivity without custom glue code
- Good for complex, self-contained widgets (bracket visualizer, score ticker, court map)

### How they work together

1. **Server** renders HTML with `data-signals` (initial state) and `data-on:click="@get('/api/...')"` (actions)
2. **Datastar** (client) handles reactivity — signal binding, SSE subscriptions, DOM patching
3. **Lit components** receive data via `data-attr:prop="$signal"` — Datastar serializes signals to JSON attributes, Lit's property system deserializes them
4. **Server endpoints** return SSE streams using Datastar SDK — `patchSignals()`, `patchElement()`, `executeScript()`

## Reference implementations

| Repo | Relevance | Notes |
|---|---|---|
| [substrate-system/template-hono-datastar](https://github.com/substrate-system/template-hono-datastar) | **High** | Hono + Datastar on Cloudflare Workers, Vite + `@cloudflare/vite-plugin`, JSX server components |
| [dweldon/datastar-bun-hono-example](https://github.com/dweldon/datastar-bun-hono-example) | Medium | Custom `DatastarStreamingApi` wrapping Hono streams, view transitions, patchElement modes |
| [Yacobolo/datastar-lit-examples](https://github.com/Yacobolo/datastar-lit-examples) | Medium | Shows `data-attr` binding Datastar signals → Lit component properties (charts, 3D, diagrams) |

## Roadmap mapping

Datastar + Lit adoption is incremental — each roadmap phase can add what it needs:

| Phase | What Datastar does | What Lit does |
|---|---|---|
| **Phase 1: Tournaments** | `data-on:click` for filter/search, SSE for tournament list updates | Tournament card component, filter panel component |
| **Phase 2: Teams & Players** | Signal-driven roster editing | Player card, team roster list components |
| **Phase 3: Scheduling & Brackets** | SSE bracket updates as matches complete | `<bracket-view>` component (SVG/canvas bracket visualization) |
| **Phase 4: Scoring & Results** | SSE score entry with live validation | `<score-entry>` component, `<box-score>` component |
| **Phase 5: Rankings** | SSE-driven ranking table refresh | `<ranking-table>` with sort/filter, `<rank-badge>` |
| **Phase 6: Live & Real-time** | Core use case — SSE pushes live scores, court status | `<live-ticker>`, `<court-board>` components |

### Migration path

1. **Add Datastar CDN** to `layout.ts` (like DaisyUI — one `<script>` tag)
2. **Existing views stay as-is** — template literals with `data-*` attributes added incrementally
3. **Lit components added per-feature** — `src/components/*.ts` built with esbuild/Vite, loaded as ES modules
4. **SSE endpoints** added alongside existing JSON API routes — same Hono router, new response format

## Implementation

### Files to create/modify

| File | Change |
|---|---|
| `src/views/layout.ts` | Add Datastar CDN `<script>` tag |
| `src/components/` | NEW directory for Lit components (per phase) |
| `src/lib/datastar.ts` | NEW — SSE response helpers wrapping Hono streams (based on dweldon pattern) |
| `package.json` | Add `lit`, `@starfederation/datastar` dependencies |
| `mise.toml` | Add `components:build` and `components:dev` tasks if Lit needs bundling |

### Mise tasks

| Task | Description |
|---|---|
| `components:build` | Bundle Lit components with esbuild for production |
| `components:dev` | Watch mode for Lit component development |

### SSE endpoint pattern

```typescript
// Example: GET /api/tournaments/live (Phase 6)
app.get("/api/tournaments/live", (c) => {
  return stream(c, async (stream) => {
    // Push score update
    await stream.patchSignals({ homeScore: 42, awayScore: 38 })
    // Update DOM fragment
    await stream.patchElement("#scoreboard", scoreboardHtml)
  })
})
```

### Lit component pattern

```typescript
// src/components/tournament-card.ts (Phase 1)
@customElement('tournament-card')
export class TournamentCard extends LitElement {
  @property({ type: Object }) tournament = {}
  render() {
    return html`<div class="card bg-base-100 shadow">...</div>`
  }
}
```

### HTML integration pattern

```html
<!-- Datastar signals + Lit component -->
<div data-signals='{"tournaments": []}'>
  <button data-on:click="@get('/api/tournaments')">Load</button>
  <tournament-card data-attr:tournament="$tournaments[0]"></tournament-card>
</div>
```

## Consequences

**Positive:**
- No framework migration needed — additive to current HTML views
- SSE is native to Cloudflare Workers (no WebSocket upgrade needed)
- Lit components are standard Web Components — testable, portable, encapsulated
- Total client JS stays small (~18KB: Datastar 11KB + Lit 7KB)
- Real-time features (Phase 6) become natural extensions of the SSE pattern

**Negative:**
- Two client libraries to learn (Datastar conventions + Lit lifecycle)
- Lit components need a build step (esbuild or Vite) — adds complexity to dev workflow
- SSE is unidirectional (server→client) — bidirectional features may still need WebSocket or POST-back patterns
- Smaller community than React/Vue — fewer ready-made components

**Risks:**
- Datastar is pre-1.0 (RC stage) — API may change
- Need to verify Datastar SDK works in Cloudflare Workers runtime (substrate-system template suggests it does)

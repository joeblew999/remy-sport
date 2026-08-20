import { Hono } from "hono";
import init, { isAuthorized, getCedarVersion } from "@cedar-policy/cedar-wasm/web";
// @ts-ignore — wrangler bundles .wasm as WebAssembly.Module
import wasmModule from "@cedar-policy/cedar-wasm/web/cedar_wasm_bg.wasm";

import { POLICIES, POLICY_COUNT } from "./generated/policies";
import { loadEntitiesD1 } from "./load-d1";
import { loadEntitiesCached, cacheStats } from "./load-cached";
import type { D1Database } from "@cloudflare/workers-types";

let cedarReady: Promise<void> | null = null;
function ensureCedar() {
  return (cedarReady ??= init(wasmModule as any).then(() => {}));
}

type Env = { DB: D1Database };
type ResourceKind = "Event" | "Team" | "Platform";

function check(
  principalId: string,
  action: string,
  resourceType: ResourceKind,
  resourceId: string,
  entities: any[],
) {
  return isAuthorized({
    principal: { type: "User",   id: principalId },
    action:    { type: "Action", id: action },
    resource:  { type: resourceType, id: resourceId },
    context: {},
    policies: { staticPolicies: POLICIES },
    entities,
  });
}

const app = new Hono<{ Bindings: Env }>();

app.get("/", (c) =>
  c.text(
    "cedar-on-workers spike — endpoints:\n" +
    "  /version\n" +
    "  /check/d1?p=alice&a=EDIT_EVENT&rt=Event&r=evt_001\n" +
    "  /check/cached?p=alice&a=EDIT_EVENT&rt=Event&r=evt_001\n" +
    "  /cache/stats\n",
  ),
);

app.get("/version", async (c) => {
  try {
    await ensureCedar();
    return c.json({ cedar: getCedarVersion(), policyCount: POLICY_COUNT });
  } catch (e: any) {
    return c.json({ error: String(e), stack: e?.stack }, 500);
  }
});

app.get("/check/d1", async (c) => {
  const p  = c.req.query("p")  ?? "alice";
  const a  = c.req.query("a")  ?? "EDIT_EVENT";
  const rt = (c.req.query("rt") ?? "Event") as ResourceKind;
  const r  = c.req.query("r")  ?? "evt_001";
  try {
    await ensureCedar();
    const t0 = Date.now();
    const entities = await loadEntitiesD1(c.env.DB, { type: "User", id: p }, { type: rt, id: r });
    const tLoad = Date.now() - t0;
    const result = check(p, a, rt, r, entities);
    const tTotal = Date.now() - t0;
    return c.json({ pattern: "d1-per-check", input: { p, a, rt, r }, result, timing: { loadMs: tLoad, totalMs: tTotal } });
  } catch (e: any) {
    return c.json({ error: String(e), stack: e?.stack }, 500);
  }
});

app.get("/check/cached", async (c) => {
  const p  = c.req.query("p")  ?? "alice";
  const a  = c.req.query("a")  ?? "EDIT_EVENT";
  const rt = (c.req.query("rt") ?? "Event") as ResourceKind;
  const r  = c.req.query("r")  ?? "evt_001";
  try {
    await ensureCedar();
    const t0 = Date.now();
    const { entities, cacheHits, cacheMisses } =
      await loadEntitiesCached(c.env.DB, { type: "User", id: p }, { type: rt, id: r });
    const tLoad = Date.now() - t0;
    const result = check(p, a, rt, r, entities);
    const tTotal = Date.now() - t0;
    return c.json({
      pattern: "isolate-cache+d1",
      input: { p, a, rt, r },
      result,
      cache: { hits: cacheHits, misses: cacheMisses },
      timing: { loadMs: tLoad, totalMs: tTotal },
    });
  } catch (e: any) {
    return c.json({ error: String(e), stack: e?.stack }, 500);
  }
});

app.get("/cache/stats", (c) => c.json(cacheStats()));

export default app;

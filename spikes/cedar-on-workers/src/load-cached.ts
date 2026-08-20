// Loader B: isolate-scope cache + D1 backing. tinytodo-style "entities in process"
// adapted for ephemeral Workers isolates. Each entity has a TTL; cache miss falls
// back to D1. Mutations are out of scope for this spike (would invalidate via
// Durable Object pub/sub or short TTL).

import type { D1Database } from "@cloudflare/workers-types";
import { loadEntitiesD1 } from "./load-d1";

type EntityJson = { uid: { type: string; id: string }; attrs: any; parents: { type: string; id: string }[] };

const TTL_MS = 60_000; // 60s per-entity TTL
const cache = new Map<string, { entity: EntityJson; expires: number }>();

const key = (type: string, id: string) => `${type}::${id}`;

function getFresh(type: string, id: string): EntityJson | null {
  const hit = cache.get(key(type, id));
  if (hit && hit.expires > Date.now()) return hit.entity;
  return null;
}

function put(entity: EntityJson) {
  cache.set(key(entity.uid.type, entity.uid.id), { entity, expires: Date.now() + TTL_MS });
}

export async function loadEntitiesCached(
  db: D1Database,
  principal: { type: "User"; id: string },
  resource: { type: "Event" | "Team" | "Platform"; id: string },
): Promise<{ entities: EntityJson[]; cacheHits: number; cacheMisses: number }> {
  let hits = 0, misses = 0;
  const need = [
    { type: principal.type, id: principal.id },
    { type: resource.type,  id: resource.id  },
  ];

  const cached: EntityJson[] = [];
  const missing: typeof need = [];
  for (const n of need) {
    const e = getFresh(n.type, n.id);
    if (e) { cached.push(e); hits++; }
    else   { missing.push(n); misses++; }
  }

  let fetched: EntityJson[] = [];
  if (missing.length > 0) {
    // Always re-fetch the full slice via load-d1 when *any* needed entity is missing.
    // Real impl would do per-entity loaders; spike keeps it simple.
    fetched = await loadEntitiesD1(db, principal, resource);
    for (const e of fetched) put(e);
    return { entities: fetched, cacheHits: hits, cacheMisses: misses };
  }

  // All cache hits — assemble what we have + platform roles (those are cached too after first load).
  return { entities: cached, cacheHits: hits, cacheMisses: misses };
}

export function cacheStats() {
  return { size: cache.size, ttlMs: TTL_MS };
}

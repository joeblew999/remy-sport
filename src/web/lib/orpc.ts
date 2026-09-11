// The API client. There is nothing to maintain here.
//
// Types come from the shared contract by inference — not from a hand-written
// interface, not from generated code, not from a spec parsed at build time.
// Change a procedure in src/api/ and both the handler and this
// file's callers stop compiling, which is the entire point: the previous
// version duplicated every response shape as an interface nothing checked.
//
// The router type is imported directly. src/types.ts imports its Cloudflare
// types explicitly, so no Worker global leaks into the browser typecheck.

import { createORPCClient } from "@orpc/client";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { RPCLink } from "@orpc/client/fetch";
import { SimpleCsrfProtectionLinkPlugin } from "@orpc/client/plugins";
import type { RouterClient } from "@orpc/server";
import type { Router } from "../../api/index";

/**
 * Relative URL, deliberately.
 *
 * The SPA is served by the same Worker as the API (the [assets] binding in
 * wrangler.toml), and biz decision-003 requires relative asset paths so the
 * Tauri build works from file://.
 */
const link = new RPCLink({
  url: () => new URL("rpc", window.location.href).toString(),
  // Cookies carry the Better Auth session; the SPA is same-origin so this is
  // simply "send them", not a CORS credentials dance.
  fetch: (request, init) => globalThis.fetch(request, { ...init, credentials: "include" }),
  // Sends `x-csrf-token: orpc`, which the handler now requires. A cross-site
  // page cannot set that header without a CORS preflight and /rpc grants no
  // CORS, so this is what separates our own calls from a forged one. Its pair
  // is SimpleCsrfProtectionHandlerPlugin in src/index.ts — adding one without
  // the other breaks every call the SPA makes.
  plugins: [new SimpleCsrfProtectionLinkPlugin()],
});

export const api: RouterClient<Router> = createORPCClient(link);

/**
 * Query options and keys, generated per procedure.
 *
 * `orpc.events.list.queryOptions()` supplies the queryKey and the queryFn, so
 * neither is written by hand and neither can go stale against the contract.
 * Invalidation reads the same way: `queryClient.invalidateQueries({ queryKey:
 * orpc.events.key() })`.
 */
export const orpc = createTanstackQueryUtils(api);

/**
 * Stubs for the four Worker globals `src/types.ts` names.
 *
 * The SPA types its oRPC client from the server router (`src/web/lib/orpc.ts`),
 * which reaches `src/types.ts` through the procedures' context type. That file
 * names `D1Database`, `R2Bucket`, `Fetcher` and `SendEmail` — ambient globals
 * declared by `worker-configuration.d.ts`, which is in the Worker's tsconfig
 * and deliberately NOT in this one. Without these four lines the SPA cannot
 * typecheck against the router at all, which is the single fact that used to
 * justify a whole parallel `contract.ts`.
 *
 * `unknown`, not the real types, and that is the point: pulling
 * `worker-configuration.d.ts` in here would put the Workers runtime's `Response`
 * and `Request` over the DOM's and silently break unrelated files — the bug the
 * tsconfig split exists to prevent. The SPA never touches these values; it only
 * needs the names to resolve.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
// `any`, not `unknown`: server code the SPA reaches only for its TYPES still
// calls methods on these (mailer.ts does `env.EMAIL.send(...)`). `unknown`
// makes that a compile error in a file the browser never runs. The values are
// never touched here — only the names have to resolve.
type D1Database = any
type R2Bucket = any
type Fetcher = any
type SendEmail = any

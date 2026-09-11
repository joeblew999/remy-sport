import pkg from "../../package.json" with { type: "json" }

/**
 * What release this is, for the published document's `info.version`.
 *
 * Read from package.json at build time rather than pinned in the spec options,
 * where it sat at "0.1.0" through every release since. A reference that names
 * a version is only useful if the version moves.
 *
 * Not `env.BUILD.app`, though that carries the same number: the spec options
 * are a module constant and have no request to read a binding from. These are
 * the same value from the same file — `stamp()` in scripts/lib/build-stamp.ts
 * reads it too — so they cannot disagree.
 */
export const APP_VERSION: string = pkg.version

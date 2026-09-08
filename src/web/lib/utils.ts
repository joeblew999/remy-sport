/**
 * The class helper every shadcn component imports as `@/lib/utils`.
 *
 * `cn` is shadcn's own package — one dependency in place of clsx and
 * tailwind-merge, and the one `shadcn init` writes here since September 2026.
 * This file exists because the registry's components import it from this
 * path; nothing of ours needs to.
 */
export { cn } from "cn"

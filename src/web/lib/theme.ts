/**
 * Light and dark, the part that has no React in it.
 *
 * shadcn's dark mode is a class on the root element — `.dark` — and the
 * stylesheet's `@custom-variant dark` and `.dark { … }` block key off it. The
 * reader's choice is light, dark, or follow the system, stored beside the
 * locale choice. What is here is the arithmetic: which of the three the
 * reader chose, what that resolves to right now, and what to put on the root.
 * The React provider and the switch that call it arrive with the shell
 * (docs/2026-09-08-01-typography-and-design-system.md, B2 step 8); until
 * then nothing mounts them and the app stays light. Kept free of the DOM so
 * the unit tier can pin it.
 */

export type Theme = "light" | "dark" | "system"
export type ResolvedTheme = "light" | "dark"

/** The same shape as the locale's key (`remy.locale`), for the same reason. */
export const THEME_KEY = "remy.theme"

const THEMES: readonly Theme[] = ["light", "dark", "system"]

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value)
}

/** What was stored, or `system` when nothing was or it is not a theme. */
export function readTheme(storage: { getItem(key: string): string | null }): Theme {
  const stored = storage.getItem(THEME_KEY)
  return isTheme(stored) ? stored : "system"
}

/** The choice, resolved against what the system says right now. */
export function resolveTheme(choice: Theme, systemPrefersDark: boolean): ResolvedTheme {
  if (choice === "system") return systemPrefersDark ? "dark" : "light"
  return choice
}

/** Exactly one of the two classes on the root, never both, never neither. */
export function applyTheme(
  root: { classList: { remove(...names: string[]): void; add(name: string): void } },
  resolved: ResolvedTheme,
): void {
  root.classList.remove("light", "dark")
  root.classList.add(resolved)
}

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { applyTheme, readTheme, resolveTheme, THEME_KEY, type ResolvedTheme, type Theme } from "./theme";

/**
 * The React half of the theme, promised since B1 step 4 and mounted now
 * (B2 step 8) because a provider nothing renders is what knip is for.
 *
 * The arithmetic lives in `./theme`, which is kept free of the DOM and of
 * React so the unit tier can pin it. This file only wires it: hold the
 * reader's choice, follow the system while it is "system", put exactly one
 * class on the root, and store the choice beside the locale's.
 *
 * Starters were shadcn's Vite theme provider (200 lines with a `d` keyboard
 * shortcut and cross-tab sync) — dropped here because nothing in this app
 * wants them; if cross-tab sync is wanted later it is a `storage` event away.
 */

interface ThemeContextValue {
  /** What the reader chose, or "system" when they never have. */
  theme: Theme;
  /** What that means right now, which is what the root class says. */
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const SYSTEM_DARK = "(prefers-color-scheme: dark)";

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Lazy initialisers: both reads run before the first paint, so a dark
  // reader never sees a light frame flash first.
  const [theme, setThemeState] = useState<Theme>(() => readTheme(window.localStorage));
  const [systemDark, setSystemDark] = useState(() => window.matchMedia(SYSTEM_DARK).matches);

  // Followed live only while the choice is "system", but subscribed always:
  // the query fires rarely, and re-resolving on every change keeps this
  // component free of "which mode am I in" branching.
  useEffect(() => {
    const query = window.matchMedia(SYSTEM_DARK);
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const resolvedTheme = resolveTheme(theme, systemDark);

  useEffect(() => {
    applyTheme(document.documentElement, resolvedTheme);
  }, [resolvedTheme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      resolvedTheme,
      setTheme: (next) => {
        window.localStorage.setItem(THEME_KEY, next);
        setThemeState(next);
      },
    }),
    [theme, resolvedTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider.");
  }
  return context;
}

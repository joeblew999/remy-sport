// The SPA's one place for "render this in the reader's language".
//
// Three things used to decide that, each with its own hardcoded pair of
// languages: `Lang = "EN" | "TH"`, a `MESSAGES` dict keyed `en`/`th`, and
// `tLocal(item, base, lang)` which guessed at a `nameTh` field. Shipping a
// third language meant editing a union, a dict, every call-site, the database,
// and the API.
//
// Now there is one source: the locales the fixtures declare, generated into
// `LOCALES` and served by /api/reference. A language is data all the way down.

import { createContext, useContext, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { overwriteGetLocale } from "../paraglide/runtime.js";
import { VOCABULARY } from "../../domain/vocabularies";
import { orpc } from "./orpc";
import type { ReactNode } from "react";
import {
  LOCALES,
  type Locale,
  type Localizer,
  type Names,
  type Reference,
  type Term,
} from "./localizer";

export * from "./localizer";

interface LocaleContextValue extends Localizer {
  setLocale(locale: Locale): void;
  /** The languages the API declares. The switcher renders from this. */
  available: Locale[];
  reference: Reference | undefined;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

const STORAGE_KEY = "remy.locale";
const FALLBACK: Locale = "en";

function isLocale(v: string | null): v is Locale {
  return !!v && (LOCALES as readonly string[]).includes(v);
}

/**
 * The reader's language: their stored choice, else the browser's, else English.
 *
 * `navigator.languages` is consulted in order, so a Thai speaker with English
 * second lands on Thai without touching the switcher.
 */
function initialLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isLocale(stored)) return stored;
  } catch {
    // private mode, or storage disabled — fall through to the browser's list
  }
  for (const tag of navigator?.languages ?? []) {
    const base = tag.toLowerCase().split("-")[0]!;
    if (isLocale(base)) return base;
  }
  return FALLBACK;
}

/**
 * Paraglide reads the locale from here rather than keeping a cookie of its own.
 *
 * Two stores for "which language is the reader in" is the bug this whole day
 * was spent removing; `overwriteGetLocale` is the supported way to have one.
 * Set before first render so the very first message call is already correct.
 */
let currentLocale: Locale = initialLocale();
overwriteGetLocale(() => currentLocale);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(currentLocale);

  // The vocabularies, through the same contract-typed query as everything else
  // — no bespoke fetch, no useEffect, no race guard. Reference data is
  // decoration rather than function: without it `label()` renders codes, which
  // is worse-looking but still navigable, so a failure must not blank the app.
  const { data: reference } = useQuery(orpc.reference.list.queryOptions());

  const value = useMemo<LocaleContextValue>(() => {
    // Seeded from the compiled vocabularies so the first paint is already
    // right. Without this a page renders `CHIANG_MAI` — a database code — for
    // however long the reference fetch takes, which under load is long enough
    // to see. The endpoint still wins once it arrives; this is the same data,
    // generated from the same fixtures, so the two cannot disagree.
    const index = new Map<string, Names>();
    for (const [vocabulary, terms] of Object.entries(VOCABULARY)) {
      for (const term of terms as readonly Term[]) {
        index.set(`${vocabulary}|${term.code}`, term.names);
      }
    }
    if (reference) {
      // Every vocabulary in the payload, whatever they are — the endpoint is
      // generated from the fixtures, so listing them here would fall behind.
      for (const [vocabulary, terms] of Object.entries(reference)) {
        for (const term of terms as Term[]) index.set(`${vocabulary}|${term.code}`, term.names);
      }
    }

    const name = (names: Names | undefined, fallback = "") =>
      names?.[locale] || names?.[FALLBACK] || fallback;

    return {
      locale,
      setLocale(next: Locale) {
        currentLocale = next;
        setLocaleState(next);
        document.documentElement.lang = next;
        try {
          localStorage.setItem(STORAGE_KEY, next);
        } catch {
          // not worth failing a language switch over
        }
      },
      name,
      label: (vocabulary, code) => (code ? name(index.get(`${vocabulary}|${code}`), code) : ""),
      // Falls back to the generated list so the switcher renders before the
      // vocabularies land, and still renders if they never do.
      // The fixtures define `locales` like any other vocabulary, so the
      // switcher renders from the same payload as every label.
      available: (reference?.locales.map((l) => l.code) ?? LOCALES).filter((l): l is Locale =>
        isLocale(l),
      ),
      reference,
    };
  }, [locale, reference]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const value = useContext(LocaleContext);
  if (!value) throw new Error("useLocale must be used inside <LocaleProvider>");
  return value;
}

/** Just the resolving half, for the API mapping layer. */
export function useLocalizer(): Localizer {
  const { locale, name, label } = useLocale();
  return useMemo(() => ({ locale, name, label }), [locale, name, label]);
}

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

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  LOCALES,
  VOCABULARIES,
  type Locale,
  type Localizer,
  type Names,
  type Reference,
} from "./localizer";

export * from "./localizer";

interface LocaleContextValue extends Localizer {
  setLocale(locale: Locale): void;
  /** The languages the API declares. The switcher renders from this. */
  available: { code: Locale; nameEn: string }[];
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

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const [reference, setReference] = useState<Reference | undefined>();

  useEffect(() => {
    let live = true;
    fetch("api/reference")
      .then((r) => (r.ok ? (r.json() as Promise<Reference>) : Promise.reject(new Error(String(r.status)))))
      .then((data) => {
        if (live) setReference(data);
      })
      .catch(() => {
        // Reference data is decoration, not function: without it `label()`
        // renders codes, which is worse-looking but still navigable. Failing
        // the whole SPA over a vocabulary fetch would be the wrong trade.
      });
    return () => {
      live = false;
    };
  }, []);

  const value = useMemo<LocaleContextValue>(() => {
    const index = new Map<string, Names>();
    if (reference) {
      for (const vocabulary of VOCABULARIES) {
        for (const term of reference[vocabulary]) index.set(`${vocabulary}|${term.code}`, term.names);
      }
    }

    const name = (names: Names | undefined, fallback = "") =>
      names?.[locale] || names?.[FALLBACK] || fallback;

    return {
      locale,
      setLocale(next: Locale) {
        setLocaleState(next);
        try {
          localStorage.setItem(STORAGE_KEY, next);
        } catch {
          // not worth failing a language switch over
        }
      },
      name,
      label: (vocabulary, code) => (code ? name(index.get(`${vocabulary}|${code}`), code) : ""),
      available: reference
        ? reference.locales.filter((l): l is { code: Locale; nameEn: string } => isLocale(l.code))
        : LOCALES.map((code) => ({ code, nameEn: code.toUpperCase() })),
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

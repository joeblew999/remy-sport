// UI copy — buttons, headings, helper text.
//
// Distinct from lib/locale.tsx, which resolves *data* names (an event's title,
// a gender's label). This file owns strings the product writes about itself;
// biz's localization-rules.md draws the same line and keeps UI copy out of the
// seed fixtures deliberately.
//
// Keyed by the locales the fixtures declare, so a language added upstream shows
// up here as a missing-key warning rather than as a type error nobody sees.

import { LOCALES, type Locale } from "./localizer";
import { useLocale } from "./locale";

interface MessageDict {
  [key: string]: MessageDict | string;
}

/** English is the fallback for every key, so only it must be complete. */
const FALLBACK: Locale = "en";

export const MESSAGES: Partial<Record<Locale, MessageDict>> = {
  en: {
    discover: {
      heading: "What's on the court",
      sub: "Find tournaments, leagues, camps, and showcases. Browse by city, format, or status.",
    },
  },
  th: {
    discover: {
      heading: "ค้นหาการแข่งขัน",
      sub: "ค้นหาทัวร์นาเมนต์ ลีก แคมป์ และโชว์เคส กรองตามเมือง รูปแบบ หรือสถานะ",
    },
  },
};

function get(obj: MessageDict | undefined, path: string): string | undefined {
  if (!obj) return undefined;
  const result = path.split(".").reduce<MessageDict | string | undefined>(
    (acc, k) => (acc && typeof acc === "object" ? acc[k] : undefined),
    obj,
  );
  return typeof result === "string" ? result : undefined;
}

export type TFn = (key: string, vars?: Record<string, string | number>) => string;

/** Translate UI copy in the reader's language. */
export function useT(): TFn {
  const { locale } = useLocale();
  return translator(locale);
}

/** The non-hook form, for code outside a component. */
export function translator(locale: Locale): TFn {
  return (key, vars) => {
    let v = get(MESSAGES[locale], key) ?? get(MESSAGES[FALLBACK], key);
    if (v == null) {
      // eslint-disable-next-line no-console
      console.warn(`[i18n] missing key: ${key}`);
      return key;
    }
    if (vars) {
      v = Object.entries(vars).reduce(
        (acc, [k, val]) => acc.replace(new RegExp(`\\{${k}\\}`, "g"), String(val)),
        v,
      );
    }
    return v;
  };
}

/** Every locale the product declares — the switcher and tests read this. */
export { LOCALES, type Locale };

// i18n hook + helpers. Hardcoded MESSAGES dict today; production may swap to
// react-intl or i18next without changing call-sites.

export type Lang = "EN" | "TH";

interface MessageDict {
  [key: string]: MessageDict | string;
}

export const MESSAGES: Record<"en" | "th", MessageDict> = {
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

function get(obj: MessageDict, path: string): string | undefined {
  const result = path.split(".").reduce<MessageDict | string | undefined>(
    (acc, k) => (acc && typeof acc === "object" ? acc[k] : undefined),
    obj,
  );
  return typeof result === "string" ? result : undefined;
}

export type TFn = (key: string, vars?: Record<string, string | number>) => string;

export function useT(lang: Lang | string | undefined): TFn {
  const code = (lang || "EN").toLowerCase() as "en" | "th";
  const dict = MESSAGES[code] ?? MESSAGES.en;
  return (key, vars) => {
    let v = get(dict, key);
    if (v == null) v = get(MESSAGES.en, key);
    if (v == null) {
      // eslint-disable-next-line no-console
      console.warn(`[i18n] missing key: ${key}`);
      return key;
    }
    if (vars) {
      return Object.entries(vars).reduce(
        (s, [k, val]) => s.replace(new RegExp(`\\{${k}\\}`, "g"), String(val)),
        v,
      );
    }
    return v;
  };
}

// Pick the right field on a data item based on current language.
// Falls back to the base field if the Th variant is missing.
export function tLocal<T extends Record<string, unknown>>(
  item: T | undefined | null,
  base: keyof T & string,
  lang: Lang | string | undefined,
): string {
  if (!item) return "";
  const thKey = (base + "Th") as keyof T;
  if (lang === "TH" && item[thKey]) return String(item[thKey]);
  return String(item[base] ?? "");
}

import { useLocale } from "../lib/locale";

/** Additional names follow the model's locales; the form keeps its primary name input. */
export function NameTranslations({ names, id }: { names: Record<string, string | undefined>; id: string }) {
  const { available, label } = useLocale();
  return <>{available.filter((locale) => locale !== "en").map((locale) =>
    <label key={locale} htmlFor={`${id}-${locale}`}>
      {label("locales", locale)}
      <input id={`${id}-${locale}`} name={`names[${locale}]`} defaultValue={names[locale] ?? ""} />
    </label>,
  )}</>;
}

/** Preserve languages the current client does not know, while allowing a translation to be cleared. */
export function namesFrom(form: FormData, existing: Record<string, string | undefined>, primary = "name") {
  const names: Record<string, string> = Object.fromEntries(Object.entries(existing).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  names.en = String(form.get(primary) ?? "").trim();
  for (const [key, value] of form) {
    const match = /^names\[([^\]]+)\]$/.exec(key);
    if (match) names[match[1]!] = String(value).trim();
  }
  return names;
}

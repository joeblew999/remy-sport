import { endonymOf, useLocale } from "../lib/locale";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";

/**
 * Additional names follow the model's locales; the form keeps its primary name
 * input.
 *
 * Each box is headed with the language's own name for itself. It used to be
 * `label("locales", locale)`, which reads the model's N×N `names` matrix — and
 * most of those cells hold the English name, so an Arabic-speaking editor was
 * offered boxes headed `Thai`, `Japanese`, `German`. This was the last thing in
 * the application still reading that matrix; the switcher has always used the
 * endonym, and the model's own note says `names` is "not extended for new
 * languages" while a picker naming languages in their own is "simply correct".
 *
 * A field label naming a language is a picker, not prose.
 * docs/2026-09-09-19-translation-provenance.md.
 */
export function NameTranslations({ names, id }: { names: Record<string, string | undefined>; id: string }) {
  const { available } = useLocale();
  return <>{available.filter((locale) => locale !== "en").map((locale) =>
    <Field key={locale}>
      <FieldLabel htmlFor={`${id}-${locale}`}>{endonymOf(locale)}</FieldLabel>
      <Input id={`${id}-${locale}`} name={`names[${locale}]`} defaultValue={names[locale] ?? ""} />
    </Field>,
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

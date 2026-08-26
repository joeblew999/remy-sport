// UI copy.
//
// Distinct from lib/locale.tsx, which resolves *data* names — an event's title,
// a gender's label. This file owns the strings the product writes about itself;
// biz's localization-rules.md draws the same line and keeps UI copy out of the
// seed fixtures deliberately.
//
// The messages are COMPILED by Paraglide, not looked up in a dictionary at
// runtime. That matters for the reason the old version failed: it was a nested
// object with a `console.warn` for a missing key, so untranslated copy showed
// up as English in production and as nothing in review. A missing key is now a
// build error, and messages nothing imports are tree-shaken out.
//
// Call them directly — `m.discover_heading()` — rather than through a `t("...")`
// indirection. The compiler cannot check a string key, and that indirection is
// exactly what let the old dictionary rot to four entries while the interface
// grew.

export { m } from "../paraglide/messages.js"
export { locales, baseLocale, isLocale } from "../paraglide/runtime.js"
export type { Locale } from "../paraglide/runtime.js"

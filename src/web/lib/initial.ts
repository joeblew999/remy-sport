import { useState } from "react";

/**
 * The value a form opened with, and only that.
 *
 * An uncontrolled input reads `defaultValue` once, at mount, and keeps what
 * the reader types from then on; React ignores a later default, and Base UI
 * logs "changing the default value state of an uncontrolled FieldControl"
 * for it. A settings form that stays mounted after a save, showing "saved",
 * sees the refetched entity arrive as new props — the same values the reader
 * just typed, handed back as a default nobody reads. Freezing what the form
 * opened with says exactly what happens on screen, and keeps the console
 * clean enough for a real error to stand out. Found in the e2e logs on
 * 2026-09-09, one warning per save, in the box score, event, organisation
 * and team forms.
 *
 * Not for anything a reader should see change under them: that is a
 * controlled input. And the form must be keyed by its entity where it is
 * rendered (`key={event.id}`), so a different entity is a different form
 * rather than a stale one.
 */
export function useInitial<T>(value: T): T {
  const [initial] = useState(value);
  return initial;
}

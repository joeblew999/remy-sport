import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, orpc } from "../lib/orpc";
import { useLocale } from "../lib/locale";
import { formErrors } from "../lib/form-errors";
import { m } from "../lib/i18n";
import { NameTranslations, namesFrom } from "./name-translations";

/** @answers CREATE_EVENT
 * Shared by Discover and the admin console. A failed save preserves the draft.
 */
export function CreateEvent({ onError, onCreated }: { onError?: (m: string | null) => void; onCreated?: (id: string) => void }) {
  const qc = useQueryClient();
  const { terms, name, describe } = useLocale();
  const [done, setDone] = useState(false);
  // The model's first type, not a literal: the PO controls the order, and the
  // string this used to hold matched no option at all.
  const types = terms("eventTypes");
  const [chosen, setChosen] = useState<string | null>(null);
  const type = chosen ?? types[0]?.code ?? "";
  const setType = setChosen;

  const create = useMutation({
    mutationFn: (input: Parameters<typeof api.events.create>[0]) => api.events.create(input),
    onSuccess: (created) => {
      onError?.(null);
      onCreated?.(created.id);
      setDone(true);
      qc.invalidateQueries({ queryKey: orpc.events.key() });
      setTimeout(() => setDone(false), 2000);
    },
    onError: () => undefined,
  });

  // Anything these two do not claim — a bad type code, a date range the API
  // refuses — is rendered at form level below rather than vanishing.
  const createErr = formErrors(create.error, ["names[en]", "description"]);

  return (
    <section className="admin-card" data-testid="create-event-form">
      <h2>{m.create_event()}</h2>
      {done && <div className="admin-ok">{m.event_created()}</div>}
      {createErr.form && (
        <div className="admin-error" data-testid="create-event-error">{createErr.form}</div>
      )}
      <form
        className="admin-form"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          create.mutate({
            names: namesFrom(f, {}),
            typeCode: String(f.get("type")) as Parameters<typeof api.events.create>[0]["typeCode"],
            description: String(f.get("description") || "") || undefined,
          });

        }}
      >
        <input name="name" aria-label={m.event_name_label()} placeholder={m.event_name_placeholder()} required autoComplete="off" />
        <NameTranslations names={{}} id="create-event-name" />
        {/* The schema's own message, under the field it belongs to — `names` is
            a locale map, so an issue on the English name arrives at names.en. */}
        {createErr.field("names[en]") && (
          <p className="admin-error small" data-testid="create-event-name-issue">
            {createErr.field("names[en]")}
          </p>
        )}
        {/* From the PO's vocabulary, not four hardcoded English strings. The
            same shape GameStatus uses: an event type added upstream appears
            here, already translated, with nothing edited in this file. The
            hardcoded version was also a second place for the code list to
            drift from the model. */}
        {/* `defaultValue` was "tournament" and the codes are "TOURNAMENT", so
            it matched no option and the browser fell back to whichever sorts
            first. It happened to be the right one. Controlled now, because the
            description below has to follow the selection anyway. */}
        <select
          aria-label={m.event_type()}
          name="type"
          required
          value={type}
          onChange={(e) => setType(e.target.value)}
          data-testid="create-event-type"
        >
          {types.map((t) => (
            <option key={t.code} value={t.code}>
              {name(t.names, t.code)}
            </option>
          ))}
        </select>
        {/* What the choice actually means. It decides which tabs the event
            gets and which actions the model grants on it — a camp has sessions
            and no fixtures — and the four words in the dropdown say none of
            that. The model has explained each one in three languages since the
            fixtures were written. */}
        {describe("eventTypes", type) && (
          <p className="meta" data-testid="create-event-type-note">
            {describe("eventTypes", type)}
          </p>
        )}
        <input name="description" placeholder={m.event_description_placeholder()} autoComplete="off" />
        {createErr.field("description") && (
          <p className="admin-error small" data-testid="create-event-description-issue">
            {createErr.field("description")}
          </p>
        )}
        <button type="submit" disabled={create.isPending}>
          {create.isPending ? m.creating() : m.create_event()}
        </button>
      </form>
    </section>
  );
}

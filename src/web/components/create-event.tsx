import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, orpc } from "../lib/orpc";
import { useLocale } from "../lib/locale";
import { formErrors } from "../lib/form-errors";
import { m } from "../lib/i18n";
import { NameTranslations, namesFrom } from "./name-translations";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

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
    <Card data-testid="create-event-form">
      <CardHeader><CardTitle>{m.create_event()}</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-4">
      {done && (
        <Alert role="status">
          <AlertDescription>{m.event_created()}</AlertDescription>
        </Alert>
      )}
      {createErr.form && (
        <Alert variant="destructive" data-testid="create-event-error">
          <AlertDescription>{createErr.form}</AlertDescription>
        </Alert>
      )}
      <form
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
        <FieldGroup className="max-w-[420px]">
          <Field data-invalid={!!createErr.field("names[en]") || undefined}>
            <FieldLabel htmlFor="create-event-name-en">{m.event_name_label()}</FieldLabel>
            <Input id="create-event-name-en" name="name" aria-invalid={!!createErr.field("names[en]")} aria-describedby={createErr.field("names[en]") ? "create-event-name-issue" : undefined} placeholder={m.event_name_placeholder()} required autoComplete="off" />
            {/* The schema's own message, under the field it belongs to — `names` is
                a locale map, so an issue on the English name arrives at names.en. */}
            {createErr.field("names[en]") && (
              <FieldError id="create-event-name-issue" data-testid="create-event-name-issue">
                {createErr.field("names[en]")}
              </FieldError>
            )}
          </Field>
          <NameTranslations names={{}} id="create-event-name" />
          {/* From the PO's vocabulary, not four hardcoded English strings: an
              event type added upstream appears here, already translated.
              Controlled, because the description below follows the selection. */}
          <Field>
            <FieldLabel htmlFor="create-event-type">{m.event_type()}</FieldLabel>
            <NativeSelect
              id="create-event-type"
              name="type"
              required
              value={type}
              onChange={(e) => setType(e.target.value)}
              data-testid="create-event-type"
            >
              {types.map((t) => (
                <NativeSelectOption key={t.code} value={t.code}>
                  {name(t.names, t.code)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            {/* What the choice actually means: it decides which tabs the event
                gets and which actions the model grants on it — a camp has
                sessions and no fixtures. The model has explained each one in
                three languages since the fixtures were written. */}
            {describe("eventTypes", type) && (
              <FieldDescription data-testid="create-event-type-note">
                {describe("eventTypes", type)}
              </FieldDescription>
            )}
          </Field>
          <Field data-invalid={!!createErr.field("description") || undefined}>
            <FieldLabel htmlFor="create-event-description">{m.description()}</FieldLabel>
            <Input id="create-event-description" aria-invalid={!!createErr.field("description")} aria-describedby={createErr.field("description") ? "create-event-description-issue" : undefined} name="description" placeholder={m.event_description_placeholder()} autoComplete="off" />
            {createErr.field("description") && (
              <FieldError id="create-event-description-issue" data-testid="create-event-description-issue">
                {createErr.field("description")}
              </FieldError>
            )}
          </Field>
          <Button type="submit" disabled={create.isPending} className="w-fit">
            {create.isPending ? m.creating() : m.create_event()}
          </Button>
        </FieldGroup>
      </form>
      </CardContent>
    </Card>
  );
}

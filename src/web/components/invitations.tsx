import { formErrors } from "../lib/form-errors"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item"
import { SectionHeading } from "./page"
/**
 * "Someone asked you to help run this event."
 *
 * The missing half of a feature that already had two working procedures.
 * `addCoOrganizer` wrote a PENDING row and `acceptCoOrganizerInvite` turned it
 * into an ACCEPTED one, and between them there was no screen at all — so a
 * person could be handed an event to co-organise and never learn of it. The
 * fixtures seed exactly that state, which meant a fresh database had an
 * invitation nobody could reach.
 *
 * Renders nothing when there is nothing outstanding, rather than an empty card
 * saying so. An invitation is an interruption; the absence of one is not news,
 * and a permanent "No invitations" panel on a profile is noise that teaches
 * people to stop looking at the section.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { orpc } from "../lib/orpc"
import { useLocale } from "../lib/locale"
import { m } from "../lib/i18n"

/**
 * @answers ACCEPT_CO_ORGANIZER_INVITE
 *
 * Answering an invitation addressed to you.
 */
export function Invitations({ onAccepted }: { onAccepted?: () => void }) {
  const { name, locale } = useLocale()
  const qc = useQueryClient()
  const { data } = useQuery(orpc.events.invitations.queryOptions())

  const accept = useMutation(
    orpc.events.acceptCoOrganizerInvite.mutationOptions({
      onSuccess: () => {
        // Both lists move: the invitation goes, and the event appears under
        // "Your events" because `can.EDIT_EVENT` is now true for this reader. Letting
        // the first refetch without the second would show it vanishing into
        // nowhere.
        void qc.invalidateQueries({ queryKey: orpc.events.invitations.key() })
        void qc.invalidateQueries({ queryKey: orpc.events.key() })
        // And what you are connected to: accepting makes you CO_ORGANIZER of
        // this event, which is a relation `me.mine` reports and every "yours"
        // screen reads. Cached for ten minutes, so without this the event
        // arrives on the profile some time after you accepted it.
        void qc.invalidateQueries({ queryKey: orpc.me.mine.key() })
        onAccepted?.()
      },
    }),
  )

  const err = formErrors(accept.error)

  const invitations = data?.invitations ?? []
  if (invitations.length === 0) return null

  return (
    <section>
      <SectionHeading title={m.invitations()} className="mt-0" />
      <ItemGroup data-testid="invitations">
        {invitations.map((invite) => (
          <Item key={invite.eventId} data-testid={`invite-${invite.eventId}`}>
            <ItemContent>
              <ItemTitle>{name(invite.names, invite.name)}</ItemTitle>
              <ItemDescription>{m.invitation_co_organize()} · <time dateTime={invite.addedAt}>{new Date(invite.addedAt).toLocaleDateString(locale)}</time></ItemDescription>
            </ItemContent>
            <ItemActions>
              <Button
                data-testid={`accept-${invite.eventId}`}
                disabled={accept.isPending}
                onClick={() => accept.mutate({ id: invite.eventId })}
              >
                {m.invitation_accept()}
              </Button>
            </ItemActions>
          </Item>
        ))}
        {err.form && (
          <Alert variant="destructive" className="rounded-none border-0">
            <AlertDescription>{err.form}</AlertDescription>
          </Alert>
        )}
      </ItemGroup>
    </section>
  )
}

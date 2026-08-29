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

export function Invitations({ onAccepted }: { onAccepted?: () => void }) {
  const { name } = useLocale()
  const qc = useQueryClient()
  const { data } = useQuery(orpc.events.invitations.queryOptions())

  const accept = useMutation(
    orpc.events.acceptCoOrganizerInvite.mutationOptions({
      onSuccess: () => {
        // Both lists move: the invitation goes, and the event appears under
        // "Your events" because `canEdit` is now true for this reader. Letting
        // the first refetch without the second would show it vanishing into
        // nowhere.
        void qc.invalidateQueries({ queryKey: orpc.events.invitations.key() })
        void qc.invalidateQueries({ queryKey: orpc.events.key() })
        onAccepted?.()
      },
    }),
  )

  const invitations = data?.invitations ?? []
  if (invitations.length === 0) return null

  return (
    <>
      <div className="section-h">
        <h2>{m.invitations()}</h2>
      </div>
      <div className="dash-card" data-testid="invitations">
        {invitations.map((invite) => (
          <div key={invite.eventId} className="invite-row" data-testid={`invite-${invite.eventId}`}>
            <div>
              <div className="row-title">{name(invite.names, invite.name)}</div>
              <div className="row-meta">{m.invitation_co_organize()}</div>
            </div>
            <button
              className="btn primary"
              data-testid={`accept-${invite.eventId}`}
              disabled={accept.isPending}
              onClick={() => accept.mutate({ id: invite.eventId })}
            >
              {m.invitation_accept()}
            </button>
          </div>
        ))}
      </div>
    </>
  )
}

/**
 * The Follow button — the opt-in that makes a notification mean something.
 *
 * Deliberately separate from turning push on. Following says *what* a reader
 * cares about and survives them switching devices; push permission says *how*
 * they can be reached and belongs to one browser. Collapsing the two would mean
 * a reader who declines the browser prompt also loses the list of teams they
 * were watching, and would have to rebuild it on their next phone.
 *
 * Shown to signed-in readers only. There is nowhere to record a stranger's
 * interest, and a button that asks for a sign-in before doing what it says is
 * worse than one that is not there.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api, orpc } from "../lib/orpc"
import { m } from "../../paraglide/messages.js"
import { useSession } from "../lib/session"
import { Icon } from "./icon"

type ObjectTypeCode = "EVENT" | "TEAM" | "GAME" | "PLAYER" | "ORG"

export function FollowButton({
  objectTypeCode,
  objectId,
}: {
  objectTypeCode: ObjectTypeCode
  objectId: string
}) {
  const qc = useQueryClient()
  const { user } = useSession()
  const signedIn = Boolean(user)

  const { data } = useQuery({
    ...orpc.notifications.following.queryOptions(),
    enabled: signedIn,
  })

  const isFollowing = Boolean(
    data?.following.some((f) => f.objectTypeCode === objectTypeCode && f.objectId === objectId),
  )

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: orpc.notifications.following.key() })

  const toggle = useMutation({
    // Annotated, because the two calls return `{following: false}` and
    // `{following: true}` — literal types that do not unify on their own, and
    // TypeScript takes the first arm as the whole ternary's type.
    mutationFn: (): Promise<{ following: boolean }> =>
      isFollowing
        ? api.notifications.unfollow({ objectTypeCode, objectId })
        : api.notifications.follow({ objectTypeCode, objectId }),
    onSuccess: invalidate,
  })

  if (!signedIn) return null

  return (
    <button
      type="button"
      // Filled while not following, plain once following: the button is an
      // invitation before the fact and a status after it, and a permanently
      // filled primary button would keep drawing the eye to something already
      // done.
      className={isFollowing ? "btn" : "btn primary"}
      // The label says what is true rather than what a press would do —
      // `aria-pressed` is what tells a screen reader it is a toggle, so the
      // visible text does not have to flip to "Unfollow" on hover.
      aria-pressed={isFollowing}
      disabled={toggle.isPending}
      onClick={() => toggle.mutate()}
      data-testid={`follow-${objectTypeCode}-${objectId}`}
    >
      <Icon name="follow" />
      {isFollowing ? m.following_label() : m.follow()}
    </button>
  )
}

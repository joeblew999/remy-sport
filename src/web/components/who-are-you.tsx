import { useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "../lib/orpc"
import { useSession } from "../lib/session"
import { useLocale } from "../lib/locale"
import { m } from "../lib/i18n"

/**
 * Saying what you are, after signing up.
 *
 * Signing up already worked — `disableSignUp` is false, so a first-time address
 * that can receive a code gets an account, and `auth.config.ts` assigns it
 * `spectator`. So `SIGN_UP_AS_SPECTATOR` was built all along. What was missing
 * was the other four: a person could not say they were a coach, a player, an
 * organiser, or ask to referee.
 *
 * Asked here rather than on the login screen, deliberately. The login screen
 * cannot know whether an address is new until the code is verified, so putting
 * the question there asks everybody a question that matters to almost nobody.
 * This appears only to a spectator, which is exactly the set of people who have
 * either just arrived or genuinely are one.
 *
 * The roles offered come from the model's own grants — see `SELF_ASSIGNABLE` in
 * src/api/me.ts. Admin is absent because the PO does not grant it to PUBLIC,
 * not because this file leaves it out.
 *
 * @answers SIGN_UP_AS_PLAYER, SIGN_UP_AS_COACH, SIGN_UP_AS_ORGANIZER, SIGN_UP_AS_REFEREE_REQUEST
 *
 * Derived from the grants rather than listed, so the codes here name what the
 * model already decided is self-assignable.
 */
export function WhoAreYou() {
  const { user } = useSession()
  const { label } = useLocale()
  const qc = useQueryClient()

  const choose = useMutation({
    mutationFn: (roleCode: string) => api.me.chooseRole({ roleCode }),
    onSuccess: () => {
      // The session carries the role, and every screen reads it — so the whole
      // cache is stale, not one query. Same reasoning as signing in.
      void qc.invalidateQueries()
    },
  })

  // Only a spectator sees this. Everybody else already answered, or was given a
  // role by an organiser, and offering it again would read as an invitation to
  // change something they cannot.
  if (!user || user.role !== "spectator") return null

  /**
   * The four worth offering. Spectator is what they already are, so listing it
   * would be a button that does nothing.
   *
   * Referee is last and carries its own note: it is a request in the model, and
   * a person choosing it lands `PENDING_APPROVAL` — which the app already
   * explains at the top of every page, and which an organiser resolves in the
   * admin console. Saying so before they press it beats surprising them after.
   */
  const OFFERED = ["PLAYER", "COACH", "ORGANIZER", "REFEREE"] as const

  return (
    <>
      <div className="section-h">
        <h2>{m.whoareyou()}</h2>
      </div>
      <div className="dash-card" data-testid="who-are-you">
        <div className="push-note">{m.whoareyou_sub()}</div>
        {OFFERED.map((code) => (
          <button
            key={code}
            className="row-button"
            data-testid={`choose-role-${code}`}
            disabled={choose.isPending}
            onClick={() => choose.mutate(code)}
          >
            <div className="row-title">{label("roles", code)}</div>
            {code === "REFEREE" && <div className="row-meta">{m.role_pending_note()}</div>}
          </button>
        ))}
      </div>
    </>
  )
}

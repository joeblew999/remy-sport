import { useEffect, useState } from "react";
import type { Route } from "../lib/router";
import { useSession } from "../lib/session";

/**
 * Landing page for the link in an invitation email (ADR 010, ADR 011).
 *
 * The email points here — `/app#/accept-invitation/:id` — because /app is the
 * product surface (ADR 008). Better Auth deliberately does not build that URL:
 * only the app knows where its accept screen lives, which is precisely why
 * this page has to exist for the email to mean anything.
 *
 * Accepting requires a session, and `get-invitation` distinguishes three
 * failures that all look alike from a distance. Getting these confused is the
 * difference between an invitee joining and being told their invitation is
 * dead:
 *
 *   - **401**, no session. The *normal* case for someone clicking a link in
 *     their inbox, not an error.
 *   - **403**, signed in as somebody other than the invitee.
 *   - anything else — expired, cancelled, already accepted, never existed.
 *     Better Auth does not say which, and neither does this page.
 */

interface Invitation {
  id: string;
  email: string;
  status: string;
  organizationName?: string;
  expiresAt?: string;
}

// "wrong-account" is its own phase rather than something derived by comparing
// emails: get-invitation never returns the invitation to a non-recipient, so
// there is nothing to compare. Better Auth reports the case itself, with a 403
// and code YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION.
type Phase = "loading" | "ready" | "accepted" | "error" | "wrong-account";

export function AcceptInvitationPage({ id, goto }: { id?: string; goto: (r: Route) => void }) {
  const { user, loading: sessionLoading, refresh, signOut } = useSession();
  const signedInAs = user?.email ?? null;
  const [phase, setPhase] = useState<Phase>("loading");
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    if (!id) {
      setPhase("error");
      setMessage("This link is missing its invitation id.");
      return;
    }
    // Wait for the shared session before deciding anything: a 401 means
    // "not signed in", and answering that before the session resolves would
    // show the sign-in prompt to someone who is already signed in.
    if (sessionLoading) return;
    let live = true;
    (async () => {
      try {
        const inviteRes = await fetch(
          `/api/auth/organization/get-invitation?id=${encodeURIComponent(id)}`,
          { credentials: "include" },
        );
        if (!live) return;

        if (inviteRes.status === 401) {
          // `get-invitation` requires a session, and a person clicking a link
          // in their inbox usually has none — this is the common path, not an
          // error. Treating a 401 as "invalid invitation" told every genuine
          // invitee their invitation was dead.
          //
          // Nothing about the invitation can be shown yet, which is correct:
          // its details are not public.
          setInvitation(null);
          setPhase("ready");
          return;
        }
        if (inviteRes.status === 403) {
          // Signed in as somebody other than the invitee. Safe to say so: the
          // caller is authenticated and Better Auth discloses this itself.
          setPhase("wrong-account");
          return;
        }
        if (!inviteRes.ok) {
          // Signed in, but the invitation is expired, cancelled, already used,
          // or never existed. Better Auth does not distinguish and neither
          // should this page — an invitation id is a bearer token, so a precise
          // error message is an oracle.
          setPhase("error");
          setMessage("This invitation is no longer valid. Ask for a new one.");
          return;
        }
        setInvitation(await inviteRes.json());
        setPhase("ready");
      } catch {
        if (!live) return;
        setPhase("error");
        setMessage("Could not load this invitation.");
      }
    })();
    return () => {
      live = false;
    };
  }, [id, sessionLoading]);

  async function accept() {
    setPhase("loading");
    try {
      const res = await fetch("/api/auth/organization/accept-invitation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ invitationId: id }),
      });
      if (!res.ok) {
        setPhase("error");
        const body = await res.json().catch(() => null);
        setMessage(body?.message ?? "Could not accept this invitation.");
        return;
      }
      // Joining sets the active organization on the session, so the rest of the
      // app must not keep rendering the pre-join answer.
      await refresh();
      setPhase("accepted");
    } catch {
      setPhase("error");
      setMessage("Could not accept this invitation.");
    }
  }

  if (phase === "loading") return <div className="empty">Loading invitation…</div>;

  if (phase === "error") {
    return (
      <div className="empty" data-testid="invitation-error">
        <p>{message}</p>
        <button onClick={() => goto({ page: "discover" })}>← Back to discover</button>
      </div>
    );
  }

  if (phase === "wrong-account") {
    return (
      <div className="empty" data-testid="invitation-wrong-account">
        <p>
          This invitation was sent to someone else
          {signedInAs ? `, and you are signed in as ${signedInAs}` : ""}. Sign in with the invited
          address to accept it.
        </p>
        <button className="btn" data-testid="invitation-sign-out" onClick={signOut}>
          Sign out
        </button>
      </div>
    );
  }

  if (phase === "accepted") {
    return (
      <div className="empty" data-testid="invitation-accepted">
        <p>You have joined {invitation?.organizationName ?? "the organisation"}.</p>
        <button onClick={() => goto({ page: "discover" })}>Continue →</button>
      </div>
    );
  }

  return (
    <div className="page-inner" data-testid="invitation-ready">
      <div className="page-header">
        <div className="crumbs">INVITATION</div>
        <h1>Join {invitation?.organizationName ?? "this organisation"}</h1>
        {invitation && <div className="sub">Invited as {invitation.email}</div>}
      </div>

      {/* Stays in the SPA now. This used to send people to /login in the
          server-rendered harness — a visible stack change mid-flow, which
          ADR 011 flagged. `invitation` is null while signed out, because its
          details are not public until the viewer proves they are the invitee. */}
      {signedInAs === null && (
        <div className="empty" data-testid="invitation-needs-signin">
          <p>Sign in with the address this invitation was sent to, then reopen this link.</p>
          <button className="btn primary" onClick={() => goto({ page: "login" })}>
            Sign in
          </button>
        </div>
      )}

      {signedInAs !== null && (
        <div className="event-actions">
          <button className="btn primary" data-testid="invitation-accept" onClick={accept}>
            Accept invitation
          </button>
        </div>
      )}
    </div>
  );
}

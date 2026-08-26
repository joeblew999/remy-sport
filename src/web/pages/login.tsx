import { useEffect, useState } from "react";
import { useSession } from "../lib/session";
import type { Route } from "../lib/router";
import { m } from "../lib/i18n";

/**
 * Passwordless sign-in for the SPA (ADR 012).
 *
 * Deliberately the same two steps, in the same order, against the same two
 * endpoints as the harness screen in src/views/login.ts. They are two stacks —
 * React here, template literals there (ADR 008) — so the markup cannot be
 * shared, but the *flow* is the thing users notice, and it now matches.
 *
 * This is also what removes the jarring hand-off ADR 011 flagged: an invitee
 * landing on the accept page no longer gets bounced into the other GUI to sign
 * in.
 */
export function LoginPage({ goto, next }: { goto: (r: Route) => void; next?: Route }) {
  const { refresh } = useSession();
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/email-otp/send-verification-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, type: "sign-in" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.message ?? "Could not send a code. Please try again.");
        return;
      }
      setStep("code");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/sign-in/email-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, otp }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.message ?? "That code was not right. Check it, or request a new one.");
        return;
      }
      // Refresh before navigating, so the destination renders signed-in on its
      // first paint rather than flashing the signed-out state.
      await refresh();
      goto(next ?? { page: "discover" });
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  // Dev shortcut, mirroring the harness login. Only rendered when the dev
  // outbox exists — i.e. never in production, where MAIL_TRANSPORT=cloudflare
  // and the endpoint 404s. Checked rather than assumed from a build flag, so
  // the two cannot drift apart.
  const [devAccounts, setDevAccounts] = useState<
    { role: string; email: string; name: string }[] | null
  >(null);
  useEffect(() => {
    let live = true;
    // Asked for, not guessed at. This used to build `${role}@remy.dev` from a
    // list typed here; the accounts are the PO's people now, with their own
    // addresses, so a guess would sign nobody in.
    fetch("/api/dev/accounts")
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (live) setDevAccounts(body?.accounts ?? null);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  async function fillDev(address: string) {
    setEmail(address);
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/email-otp/send-verification-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: address, type: "sign-in" }),
      });
      if (!res.ok) {
        setError("Could not send a code.");
        return;
      }
      // Read the code back from the dev outbox and prefill it — the same
      // convenience the dashboard has always had, so the two GUIs match.
      const outbox = await fetch(`/api/dev/outbox?to=${encodeURIComponent(address)}`);
      if (outbox.ok) {
        const { messages } = await outbox.json();
        const m = messages?.[0]?.body?.match(/Your code is (\d{6})/);
        if (m) setOtp(m[1]);
      }
      setStep("code");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-inner" data-testid="spa-login">
      <div className="page-header">
        <div className="crumbs">SIGN IN</div>
        <h1>{m.welcome()}</h1>
        <div className="sub">We'll email you a code — no password needed</div>
      </div>

      {error && (
        <div className="empty" data-testid="login-error">
          <p>{error}</p>
        </div>
      )}

      {step === "email" ? (
        <form onSubmit={requestCode} className="dash-card" style={{ padding: 24, maxWidth: 420 }}>
          <label htmlFor="spa-email" style={{ display: "block", marginBottom: 8 }}>
            Email
          </label>
          <input
            id="spa-email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            data-testid="spa-email-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ width: "100%", padding: "10px 12px", marginBottom: 16 }}
          />
          <button className="btn primary" type="submit" disabled={busy} data-testid="spa-send-code">
            {busy ? "Sending…" : "Email me a code"}
          </button>
        </form>
      ) : (
        <form onSubmit={verify} className="dash-card" style={{ padding: 24, maxWidth: 420 }}>
          <p style={{ marginBottom: 12 }}>
            Code sent to <b>{email}</b>. It expires in 10 minutes.
          </p>
          <label htmlFor="spa-otp" style={{ display: "block", marginBottom: 8 }}>
            6-digit code
          </label>
          <input
            id="spa-otp"
            type="text"
            required
            /* one-time-code lets phones offer the code straight from the
               notification instead of forcing an app switch. */
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            placeholder="000000"
            data-testid="spa-otp-input"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            style={{
              width: "100%",
              padding: "10px 12px",
              marginBottom: 16,
              letterSpacing: "0.4em",
              textAlign: "center",
              fontSize: 18,
            }}
          />
          <button className="btn primary" type="submit" disabled={busy} data-testid="spa-verify-code">
            {busy ? "Signing in…" : "Sign in"}
          </button>
          <button
            type="button"
            className="btn"
            style={{ marginLeft: 8 }}
            data-testid="spa-use-different-email"
            onClick={() => {
              setStep("email");
              setOtp("");
              setError(null);
            }}
          >
            Use a different email
          </button>
        </form>
      )}

      {devAccounts && (
        <div className="dev-accounts" data-testid="spa-dev-accounts">
          <div className="section-h" style={{ marginTop: 32 }}>
            <h2>{m.dev_accounts()}</h2>
            <a className="more">LOCAL ONLY</a>
          </div>
          <div className="dev-account-row">
            {devAccounts.map((account) => (
              <button
                key={account.role}
                className="btn"
                // Keyed by role, not by the address: the address is a person's
                // now, and a test that wants "the referee" means the role.
                data-testid={`spa-dev-${account.role}`}
                title={`${account.name} — ${account.email}`}
                onClick={() => void fillDev(account.email)}
              >
                {account.role}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

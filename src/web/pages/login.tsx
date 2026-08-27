import { useState } from "react";
import { useDevAccounts, useRequestCode, useVerifyCode, codeFromOutbox } from "../lib/auth";
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
 *
 * No `getIssueMessage` here, and that is not an oversight. These two forms post
 * to Better Auth, not to an oRPC procedure, and Better Auth answers with
 * `{ code, message }` — there is no `data.issues` to read a per-field message
 * out of. The whole-form message is the only thing there is.
 */
export function LoginPage({ goto, next }: { goto: (r: Route) => void; next?: Route }) {
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");

  // Two mutations and a query, all defined once in lib/auth.ts. This page used
  // to hold five `fetch` calls, a `busy` useState, an `error` useState, a
  // `useEffect` with a `live` race guard, and three near-identical try/catch
  // blocks — the machine TanStack already is.
  const requestCode = useRequestCode();
  const verifyCode = useVerifyCode();
  const devAccounts = useDevAccounts();

  // `verifyCode` invalidates the session itself, so there is no `refresh()` to
  // remember to call before navigating.
  const busy = requestCode.isPending || verifyCode.isPending;
  const error = requestCode.error?.message ?? verifyCode.error?.message ?? null;

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    await requestCode.mutateAsync(email).then(() => setStep("code")).catch(() => undefined);
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    await verifyCode
      .mutateAsync({ email, otp })
      .then(() => goto(next ?? { page: "discover" }))
      .catch(() => undefined);
  }

  /**
   * Sign in as a seeded person, without an inbox.
   *
   * Two ways in, and which one applies is the server's to say. Locally the code
   * is generated and read back from the dev outbox. On a deployment with
   * TEST_OTP the code is fixed and comes down with the account list, because
   * `.test` addresses have no inbox to read.
   *
   * Either way this completes a *real* sign-in — request a code, redeem it — so
   * what you get is an ordinary session and nothing here bypasses Better Auth.
   */
  async function fillDev(address: string) {
    setEmail(address);
    try {
      await requestCode.mutateAsync(address);
      const code = devAccounts.data?.code ?? (await codeFromOutbox(address));
      if (code) setOtp(code);
      setStep("code");
    } catch {
      /* the mutation already carries the error */
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
        <form onSubmit={submitEmail} className="dash-card" style={{ padding: 24, maxWidth: 420 }}>
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
        <form onSubmit={submitCode} className="dash-card" style={{ padding: 24, maxWidth: 420 }}>
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
              // Clears the failed-code message: the error is the mutation's
              // now, so resetting it is what dismisses it.
              verifyCode.reset();
            }}
          >
            Use a different email
          </button>
        </form>
      )}

      {devAccounts.data?.accounts.length ? (
        <div className="dev-accounts" data-testid="spa-dev-accounts">
          <div className="section-h" style={{ marginTop: 32 }}>
            <h2>{m.dev_accounts()}</h2>
            <a className="more">{devAccounts.data?.code ? m.demo_accounts_note() : "LOCAL ONLY"}</a>
          </div>
          {/* Every seeded person, not one per role. The differences *within* a
              role are the point: two coaches run different schools, two referees
              are on different games, and signing in as the wrong one is why a
              permission looks broken when it is working correctly.

              `holds` is derived from the model server-side, so what is printed
              here is the same answer the API will give when you act as them. */}
          <div className="dev-account-list">
            {devAccounts.data.accounts.map((account) => (
              <button
                key={account.email}
                className="dev-account"
                // Still a per-role testid for the first of each, because specs
                // that want "the referee" mean the role and should not have to
                // know a person's name.
                data-testid={`spa-dev-${account.email}`}
                onClick={() => void fillDev(account.email)}
              >
                <span className="dev-account-who">
                  <strong>{account.name}</strong>
                  <span className="badge badge-outline">{account.role}</span>
                </span>
                <span className="dev-account-holds">
                  {account.holds.length ? account.holds.join(" · ") : m.dev_holds_nothing()}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

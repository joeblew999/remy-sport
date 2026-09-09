import { useState } from "react";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { useDevAccounts, useRequestCode, useVerifyCode, codeFromOutbox } from "../lib/auth";
import type { Route } from "../lib/router";
import { m } from "../lib/i18n";
import { Muted, PageHeader, PageInner, SectionHeading } from "../components/page";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";

/**
 * Passwordless sign-in for the SPA (ADR 012).
 *
 * Two steps, in the same order, against the same two endpoints as the old
 * harness screen: ask for a code, redeem it.
 *
 * No `getIssueMessage` here, and that is not an oversight. These two forms post
 * to Better Auth, not to an oRPC procedure, and Better Auth answers with
 * `{ code, message }` — there is no `data.issues` to read a per-field message
 * out of. The whole-form message is the only thing there is.
 *
 * @answers SIGN_IN_OUT, SIGN_UP_AS_SPECTATOR
 *
 * Signing in is signing up: `disableSignUp` is false, so a first-time address
 * that redeems a code gets an account, and `auth.config.ts` makes it a spectator.
 */
export function LoginPage({ goto, next }: { goto: (r: Route) => void; next?: Route }) {
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");

  // Two mutations and a query, all defined once in lib/auth.ts.
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

  /**
   * Redeem a code. Reached two ways: the sixth digit, and the Sign in button.
   *
   * The sixth digit is the one a phone takes. Mail hands the code to the
   * keyboard, one tap fills all six slots, and `onComplete` redeems it — no
   * second press, which was the whole remaining friction (docs plan
   * 2026-09-09-01). The button stays for a reader who pastes five and types
   * one, and for a wrong code, which leaves six digits in the field. The
   * completed value comes from the field itself: state may not have caught
   * up by the time `onComplete` fires.
   */
  async function verify(code: string) {
    if (verifyCode.isPending) return;
    await verifyCode
      .mutateAsync({ email, otp: code })
      .then(() => goto(next ?? { page: "home" }))
      .catch(() => undefined);
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    await verify(otp);
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
   * One click, as the picker promises: with a code in hand it signs in; without
   * one it stays on the code step so a person can type what they got.
   */
  async function fillDev(address: string) {
    setEmail(address);
    try {
      await requestCode.mutateAsync(address);
      const code = devAccounts.data?.code ?? (await codeFromOutbox(address));
      setStep("code");
      if (!code) return;
      setOtp(code);
      await verifyCode.mutateAsync({ email: address, otp: code });
      goto(next ?? { page: "home" });
    } catch {
      /* the mutation already carries the error */
    }
  }

  return (
    <div data-testid="spa-login">
      <PageHeader title={m.welcome()} sub={m.sign_in_sub()} />
      <PageInner className="flex flex-col gap-6">
      {error && (
        <Alert variant="destructive" id="login-error" data-testid="login-error">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {step === "email" ? (
        <form onSubmit={submitEmail} aria-busy={busy}>
          <FieldGroup className="max-w-[420px]">
            <Field>
              <FieldLabel htmlFor="spa-email">{m.email_label()}</FieldLabel>
              <Input
                id="spa-email"
                type="email"
                required
                autoComplete="email"
                placeholder={m.email_placeholder()}
                data-testid="spa-email-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-describedby={error ? "login-error" : undefined}
              />
            </Field>
            <Button type="submit" disabled={busy} className="w-fit" data-testid="spa-send-code">
              {busy ? m.sending() : m.email_me_a_code()}
            </Button>
          </FieldGroup>
        </form>
      ) : (
        <form onSubmit={submitCode} aria-busy={busy}>
          <FieldGroup className="max-w-[420px]">
            <Muted>
              {m.code_sent_to({ email })}
            </Muted>
            <Field>
              <FieldLabel htmlFor="spa-otp">{m.six_digit_code()}</FieldLabel>
              {/* The registry's one-time-code field: six slots, digits only, and
                  `autocomplete="one-time-code"` from the library so a phone can
                  offer the code straight from Mail or the notification. Focused
                  as the step opens, so the offered code has somewhere to land;
                  the sixth digit submits — see `verify`. */}
              <InputOTP
                id="spa-otp"
                maxLength={6}
                pattern={REGEXP_ONLY_DIGITS}
                required
                autoFocus
                value={otp}
                onChange={setOtp}
                onComplete={(code: string) => void verify(code)}
                data-testid="spa-otp-input"
                aria-describedby={error ? "login-error" : undefined}
              >
                <InputOTPGroup>
                  {[0, 1, 2, 3, 4, 5].map((i) => <InputOTPSlot key={i} index={i} className="size-11 text-base" />)}
                </InputOTPGroup>
              </InputOTP>
              {/* Better Auth answers whole-form, so the message hangs off the
                  code field, the one the reader is on when it arrives. */}
              {error && <FieldError>{error}</FieldError>}
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={busy} data-testid="spa-verify-code">
                {busy ? m.signing_in() : m.sign_in()}
              </Button>
              <Button
                type="button"
                variant="outline"
                data-testid="spa-use-different-email"
                onClick={() => {
                  setStep("email");
                  setOtp("");
                  // Clears the failed-code message: the error is the mutation's
                  // now, so resetting it is what dismisses it.
                  verifyCode.reset();
                }}
              >
                {m.use_different_email()}
              </Button>
            </div>
          </FieldGroup>
        </form>
      )}

      {devAccounts.data?.accounts.length ? (
        <section data-testid="spa-dev-accounts">
          <SectionHeading title={m.dev_accounts()} className="mt-2">
            <Muted as="span">{devAccounts.data?.code ? m.demo_accounts_note() : m.local_only()}</Muted>
          </SectionHeading>
          {/* Every seeded person, not one per role. The differences *within* a
              role are the point: two coaches run different schools, two referees
              are on different games, and signing in as the wrong one is why a
              permission looks broken when it is working correctly.

              `holds` is derived from the model server-side, so what is printed
              here is the same answer the API will give when you act as them. */}
          <ItemGroup>
            {devAccounts.data.accounts.map((account) => (
              <Item variant="outline" size="sm"
                key={account.email}
                className="text-left hover:bg-muted"
                render={<button type="button" />}
                // Still a per-role testid for the first of each, because specs
                // that want "the referee" mean the role and should not have to
                // know a person's name.
                data-testid={`spa-dev-${account.email}`}
                onClick={() => void fillDev(account.email)}
              >
                <ItemContent>
                  <ItemTitle>
                    {account.name}
                    <Badge variant="outline">{account.role}</Badge>
                  </ItemTitle>
                  <ItemDescription className="line-clamp-none">
                    {account.holds.length ? account.holds.join(" · ") : m.dev_holds_nothing()}
                  </ItemDescription>
                </ItemContent>
              </Item>
            ))}
          </ItemGroup>
        </section>
      ) : null}
      </PageInner>
    </div>
  );
}

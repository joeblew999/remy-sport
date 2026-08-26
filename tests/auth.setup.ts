import { test as setup } from "@playwright/test"
import { mkdirSync } from "node:fs"
import { ALL_ACTORS, signIn, stateFor, AUTH_STATE_DIR } from "./helpers/auth"

/**
 * Sign in once per actor and save the cookies to disk.
 *
 * Every spec that needed to *be* somebody used to sign in for itself — 68 call
 * sites, each two requests plus whatever the assertion did. Worse, it is what
 * forced `workers: 1`: sign-in codes are consumed on use, so two parallel tests
 * signing in as the same actor ate each other's code and both failed.
 *
 * Doing it once here removes both problems. Specs declare who they are with
 * `test.use({ storageState: stateFor("ADMIN") })` and start already signed in,
 * and nothing races for a code because nothing signs in during the run.
 *
 * The specs that exercise sign-in *itself* — spa-login.spec.ts, and the
 * "redirects to login" case — deliberately do not use these states. Their
 * subject is the login flow, so bypassing it would test nothing.
 */
setup("sign in as each actor and save session state", async ({ playwright }) => {
  mkdirSync(AUTH_STATE_DIR, { recursive: true })

  for (const email of ALL_ACTORS) {
    // A fresh context per actor: reusing one would carry the previous actor's
    // cookie into the next sign-in, and Better Auth would refuse the origin
    // check on a request that already has a session (ADR 006 §9a).
    const ctx = await playwright.request.newContext({
      baseURL: process.env.BASE_URL || "http://localhost:8787",
    })
    await signIn(ctx, email)
    await ctx.storageState({ path: stateFor(email) })
    await ctx.dispose()
  }
})

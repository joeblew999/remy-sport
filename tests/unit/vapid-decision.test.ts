import { describe, it, expect } from "bun:test"
import { decideFromNames, decideVapid, halfPairMessage } from "../../scripts/ops/vapid"

/**
 * What to do about a VAPID keypair, given what is already stored.
 *
 * The only place these branches can be exercised. `scripts/push-secrets.ts`
 * acts on the deployed Worker, and reaching its half-pair branch for real would
 * mean deleting a production key to see what happens — which is the thing the
 * branch exists to prevent.
 *
 * The rule matters because rotating is silent and irreversible: the public key
 * is pinned by every browser at `subscribe()` time, so a new one leaves every
 * existing subscription sending to an endpoint it cannot sign for. Nothing
 * server-side detects that except deliveries beginning to fail.
 *
 * The listings below are shaped like `wrangler secret list` answers, because
 * that mapping is where the original bug lived: `grep -q VAPID_PRIVATE_KEY`
 * asked about one half of a pair and substring-matched the whole listing.
 */

/** A listing as the Worker actually returns it, reduced to names. */
const listing = (...names: string[]) => new Set(names)

const OTHERS = ["BETTER_AUTH_SECRET", "MOQ_RELAY_URL", "MOQ_RELAY_TOKEN"]

describe("decideFromNames — the four states a keypair can be in", () => {
  it("both present: leave it alone", () => {
    // Production's actual shape. Anything but "keep" here rotates live keys.
    const names = listing(...OTHERS, "VAPID_SUBJECT", "VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY")
    expect(decideFromNames(names)).toEqual({ action: "keep" })
  })

  it("both absent: generate a pair", () => {
    expect(decideFromNames(listing(...OTHERS))).toEqual({ action: "generate" })
  })

  it("private only — the case the old grep matched — refuses", () => {
    // `grep -q VAPID_PRIVATE_KEY` found this and exited 0, leaving a
    // deployment that can sign but has no public key to hand a browser.
    const names = listing(...OTHERS, "VAPID_PRIVATE_KEY")
    expect(decideFromNames(names)).toEqual({
      action: "refuse",
      have: "VAPID_PRIVATE_KEY",
      missing: "VAPID_PUBLIC_KEY",
    })
  })

  it("public only — the case that silently rotated production — refuses", () => {
    // The bug. The grep did not match, so the task generated a fresh pair and
    // put all three: internally consistent, exit 0, and every subscription
    // browsers had pinned the old public key into was dead.
    const names = listing(...OTHERS, "VAPID_PUBLIC_KEY")
    expect(decideFromNames(names)).toEqual({
      action: "refuse",
      have: "VAPID_PUBLIC_KEY",
      missing: "VAPID_PRIVATE_KEY",
    })
  })
})

describe("the subject is not part of the pair", () => {
  it("a subject alone is still 'generate'", () => {
    // VAPID_SUBJECT is a contact address for a push service to complain to. It
    // has no cryptographic relationship to the keys, so its presence must not
    // make a missing pair look partially configured.
    expect(decideFromNames(listing("VAPID_SUBJECT"))).toEqual({ action: "generate" })
  })

  it("a missing subject does not make a complete pair look broken", () => {
    const names = listing("VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY")
    expect(decideFromNames(names)).toEqual({ action: "keep" })
  })
})

describe("exact names, not substrings", () => {
  it("a secret whose name merely contains the key name does not count", () => {
    // The old check was `grep -q VAPID_PRIVATE_KEY` over the whole listing, so
    // anything containing that text satisfied it — including, on a JSON
    // listing, a secret named OLD_VAPID_PRIVATE_KEY_BACKUP.
    const names = listing("OLD_VAPID_PRIVATE_KEY_BACKUP", "VAPID_PUBLIC_KEY_V2")
    expect(decideFromNames(names)).toEqual({ action: "generate" })
  })
})

describe("halfPairMessage", () => {
  it("names which half is missing and offers both resolutions", () => {
    const d = { have: "VAPID_PUBLIC_KEY", missing: "VAPID_PRIVATE_KEY" }
    const msg = halfPairMessage(d, "the deployed worker")
    expect(msg).toContain("the deployed worker has VAPID_PUBLIC_KEY but not VAPID_PRIVATE_KEY")
    // Both ways out, because which one is right is not ours to decide — and
    // which is cheaper, because under pressure that is the part that matters.
    expect(msg).toContain("Restoring VAPID_PRIVATE_KEY costs nothing")
    expect(msg).toContain("rotating costs every")
    // And the consequence, stated where the person deciding will read it.
    expect(msg).toContain("invalidates every subscription")
    // No mechanism: the two callers resolve this differently, so naming one
    // caller's fix in shared text misleads the other.
    expect(msg).not.toContain("PUSH_ROTATE")
    expect(msg).not.toContain("rerun")
  })
})

describe("decideVapid — the same rule, from booleans", () => {
  it("covers all four combinations", () => {
    expect(decideVapid({ publicKey: true, privateKey: true }).action).toBe("keep")
    expect(decideVapid({ publicKey: false, privateKey: false }).action).toBe("generate")
    expect(decideVapid({ publicKey: true, privateKey: false }).action).toBe("refuse")
    expect(decideVapid({ publicKey: false, privateKey: true }).action).toBe("refuse")
  })
})

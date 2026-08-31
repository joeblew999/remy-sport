import { describe, it, expect } from "bun:test"
import { pushService } from "../../src/api/push-send"

/**
 * Which push service an endpoint belongs to, from the hostname and nothing
 * else.
 *
 * The endpoint is a device identifier — anyone holding the whole URL can push
 * to that browser — so the path must never be read, stored or logged. These
 * assert that the label depends on the hostname only, and that a real endpoint's
 * secret part never reaches the answer.
 *
 * Coarse on purpose: the question this exists to answer is "is Apple failing
 * our iOS PWA users", not "which of Apple's front-ends".
 */

describe("pushService", () => {
  it("labels the four vendors that actually serve Web Push", () => {
    expect(pushService("https://web.push.apple.com/QLtT7pB2…")).toBe("apple")
    expect(pushService("https://fcm.googleapis.com/fcm/send/dQw4…")).toBe("fcm")
    expect(pushService("https://updates.push.services.mozilla.com/wpush/v2/gAA…")).toBe("mozilla")
    expect(pushService("https://wns2-par02p.notify.windows.com/w/?token=Bg…")).toBe("windows")
  })

  it("does not read the path, which is the part that is secret", () => {
    // Same host, wildly different paths — and one of them contains a vendor
    // name that would fool any substring match over the whole URL.
    const a = pushService("https://web.push.apple.com/aaa")
    const b = pushService("https://web.push.apple.com/fcm.googleapis.com/bbb")
    expect(a).toBe("apple")
    expect(b).toBe("apple")
  })

  it("matches on the host suffix, not on the string containing a name", () => {
    // A hostile or merely odd host must not be labelled as a vendor it is not.
    expect(pushService("https://push.apple.com.evil.example/x")).toBe("other")
    expect(pushService("https://notfcm.googleapis.com.example.net/x")).toBe("other")
  })

  it("survives a value that is not a URL at all", () => {
    // This runs inside the send path. It must not throw, whatever is stored.
    expect(pushService("")).toBe("other")
    expect(pushService("not a url")).toBe("other")
  })

  it("returns a bounded set, so the blob stays low cardinality", () => {
    const labels = new Set(
      [
        "https://web.push.apple.com/a",
        "https://web.push.apple.com/b",
        "https://fcm.googleapis.com/c",
        "https://android.googleapis.com/d",
        "https://updates.push.services.mozilla.com/e",
        "https://something.else.example/f",
      ].map(pushService),
    )
    // Two Apple endpoints and two Google hosts collapse to one label each —
    // which is the point: raw hosts drift, vendors do not.
    expect([...labels].sort()).toEqual(["apple", "fcm", "mozilla", "other"])
  })
})

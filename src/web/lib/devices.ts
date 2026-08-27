import { formatSince } from "./dates"
/**
 * Turning a session row into something a person can recognise (ADR 014).
 *
 * The signal available is `userAgent` and `ipAddress` — that is all Better
 * Auth records. A user asked "is this you?" cannot answer from a raw UA
 * string, so it is reduced to browser + platform, which is the level people
 * actually recognise ("Chrome on macOS").
 *
 * Deliberately coarse. UA sniffing is unreliable in general, and precision is
 * not the goal here: the question is only "does this look like one of mine, or
 * something I should revoke". An honest "Unknown device" beats a confident
 * wrong guess, so anything unrecognised says so rather than being forced into
 * the nearest match.
 */

export interface RawSession {
  id: string
  token: string
  createdAt: string
  updatedAt: string
  expiresAt: string
  userAgent: string | null
  ipAddress: string | null
  impersonatedBy?: string | null
}

export interface Device {
  id: string
  token: string
  label: string
  browser: string
  platform: string
  ipAddress: string | null
  createdAt: string
  lastSeen: string
  expiresAt: string
  current: boolean
  impersonated: boolean
}

// Order matters: Edge and Opera both include "Chrome" in their UA, and Chrome
// on iOS reports "CriOS". Checking the more specific tokens first is what stops
// every browser being reported as Chrome.
const BROWSERS: Array<[RegExp, string]> = [
  [/\bEdg[A-Z]?\//, "Edge"],
  [/\bOPR\/|\bOpera\//, "Opera"],
  [/\bCriOS\//, "Chrome"],
  [/\bFxiOS\//, "Firefox"],
  [/\bFirefox\//, "Firefox"],
  [/\bChrome\//, "Chrome"],
  [/\bSafari\//, "Safari"],
  [/\bcurl\//, "curl"],
  [/\bnode\b|\bundici\b/i, "Server"],
]

const PLATFORMS: Array<[RegExp, string]> = [
  [/\bAndroid\b/, "Android"],
  [/\biPhone\b/, "iPhone"],
  [/\biPad\b/, "iPad"],
  [/\bMac OS X\b|\bMacintosh\b/, "macOS"],
  [/\bWindows\b/, "Windows"],
  [/\bCrOS\b/, "ChromeOS"],
  [/\bLinux\b/, "Linux"],
]

function match(ua: string, table: Array<[RegExp, string]>): string | null {
  for (const [re, name] of table) if (re.test(ua)) return name
  return null
}

export function describeDevice(ua: string | null): { browser: string; platform: string; label: string } {
  if (!ua) return { browser: "Unknown", platform: "Unknown", label: "Unknown device" }
  const browser = match(ua, BROWSERS) ?? "Unknown"
  const platform = match(ua, PLATFORMS) ?? "Unknown"
  if (browser === "Unknown" && platform === "Unknown") {
    return { browser, platform, label: "Unknown device" }
  }
  if (platform === "Unknown") return { browser, platform, label: browser }
  if (browser === "Unknown") return { browser, platform, label: platform }
  return { browser, platform, label: `${browser} on ${platform}` }
}

/**
 * `currentToken` identifies the session doing the asking, so the UI can mark it
 * and refuse to offer "revoke" on it without warning — signing yourself out
 * from a device-management screen is a surprise, not a feature.
 */
export function toDevices(sessions: RawSession[], currentToken: string | null): Device[] {
  return sessions
    .map((s) => {
      const { browser, platform, label } = describeDevice(s.userAgent)
      return {
        id: s.id,
        token: s.token,
        label,
        browser,
        platform,
        ipAddress: s.ipAddress && s.ipAddress.length > 0 ? s.ipAddress : null,
        createdAt: s.createdAt,
        lastSeen: s.updatedAt,
        expiresAt: s.expiresAt,
        current: currentToken !== null && s.token === currentToken,
        impersonated: Boolean(s.impersonatedBy),
      }
    })
    // Current session first, then most recently seen. Someone scanning for an
    // intruder wants the unfamiliar entries near the top, and "recently active"
    // is the closest available proxy for "worth looking at".
    .sort((a, b) => {
      if (a.current !== b.current) return a.current ? -1 : 1
      return new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime()
    })
}

/**
 * Delegates to `formatSince` — see lib/dates.ts.
 *
 * This used to return "just now" / "5m ago" / "yesterday" as English literals,
 * on the one screen where somebody is checking whether a session is theirs.
 */
export function formatWhen(locale: string, iso: string): string {
  return formatSince(locale, iso);
}

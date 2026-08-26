/**
 * The localisation primitives — `pick`, `pivot`, `clean`.
 *
 * `bun test`, not Playwright: these are pure functions of their arguments, and
 * until now the only way to exercise them was to boot wrangler, seed D1 and
 * drive a browser for three and a half minutes. That is a fine way to check
 * that a page renders and a terrible way to check that a Thai-only name keeps
 * its pivot.
 *
 * Every case here is a claim made in a comment in src/domain/names.ts or in
 * AGENTS.md. If one starts failing, one of the two is now wrong.
 */

import { expect, test, describe } from "bun:test"
import { clean, pick, pivot, FALLBACK, type Names } from "../../src/domain/names"

describe("pick — resolve a name in the reader's language", () => {
  const names: Names = { en: "Boys", th: "ชาย" }

  test("returns the requested locale", () => {
    expect(pick(names, "th")).toBe("ชาย")
  })

  test("degrades to English rather than blanking", () => {
    // "Falls back through English" — the row always has an English pivot, so a
    // reader of an unshipped language sees a name rather than an empty cell.
    expect(pick({ en: "Boys" }, "th")).toBe("Boys")
  })

  test("uses the caller's fallback when there is nothing at all", () => {
    expect(pick(undefined, "th", "—")).toBe("—")
    expect(pick({}, "th", "—")).toBe("—")
  })

  test("empty string is treated as absent, not as a name", () => {
    // `||` not `??` in the implementation, deliberately: a blank renders worse
    // than a fallback.
    expect(pick({ th: "", en: "Boys" }, "th")).toBe("Boys")
  })

  test("English is the pivot locale", () => {
    expect(FALLBACK).toBe("en")
  })
})

describe("pivot — the value stored on the row", () => {
  test("prefers English", () => {
    expect(pivot({ en: "Boys", th: "ชาย" })).toBe("Boys")
  })

  test("accepts a Thai-only submission", () => {
    // The documented reason this does not simply demand English: "a Thai-only
    // submission is still valid and still renderable". The NOT NULL pivot must
    // therefore be fillable from any single language.
    expect(pivot({ th: "ชาย" })).toBe("ชาย")
  })

  test("whitespace-only English does not win over a real Thai name", () => {
    expect(pivot({ en: "   ", th: "ชาย" })).toBe("ชาย")
  })

  test("returns undefined when nothing is supplied", () => {
    // Which is what makes `NamesInput`'s "at least one locale" refinement the
    // thing standing between this and a NOT NULL violation.
    expect(pivot({})).toBeUndefined()
    expect(pivot({ en: "  ", th: "  " })).toBeUndefined()
  })
})

describe("clean — what actually gets written", () => {
  test("trims", () => {
    expect(clean({ en: "  Boys  " })).toEqual({ en: "Boys" })
  })

  test("drops empty and whitespace-only locales", () => {
    expect(clean({ en: "Boys", th: "   " })).toEqual({ en: "Boys" })
  })

  test("drops unknown locales rather than storing them", () => {
    // clean() iterates LOCALES, so a key outside the PO's vocabulary cannot be
    // written. Shipping a language is a fixture change, not an arbitrary key.
    expect(clean({ en: "Boys", xx: "Nope" } as Names)).toEqual({ en: "Boys" })
  })

  test("an all-blank input cleans to an empty object, not to blanks", () => {
    expect(clean({ en: "", th: "  " })).toEqual({})
  })
})

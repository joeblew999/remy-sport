import { describe, expect, it } from "vitest"
import { THEME_KEY, applyTheme, isTheme, readTheme, resolveTheme } from "../../src/web/lib/theme"

describe("the theme choice", () => {
  it("is one of three words and nothing else", () => {
    expect(isTheme("light")).toBe(true)
    expect(isTheme("dark")).toBe(true)
    expect(isTheme("system")).toBe(true)
    expect(isTheme("auto")).toBe(false)
    expect(isTheme(null)).toBe(false)
    expect(isTheme(1)).toBe(false)
  })

  it("reads as system when nothing, or nonsense, was stored", () => {
    const stored = new Map<string, string>()
    const storage = { getItem: (key: string) => stored.get(key) ?? null }
    expect(readTheme(storage)).toBe("system")
    stored.set(THEME_KEY, "purple")
    expect(readTheme(storage)).toBe("system")
    stored.set(THEME_KEY, "dark")
    expect(readTheme(storage)).toBe("dark")
  })

  it("resolves system against what the system says, and the others against nothing", () => {
    expect(resolveTheme("system", true)).toBe("dark")
    expect(resolveTheme("system", false)).toBe("light")
    expect(resolveTheme("light", true)).toBe("light")
    expect(resolveTheme("dark", false)).toBe("dark")
  })

  it("puts exactly one class on the root", () => {
    const classes = new Set<string>(["light", "something-else"])
    const root = {
      classList: {
        remove: (...names: string[]) => names.forEach((n) => classes.delete(n)),
        add: (name: string) => classes.add(name),
      },
    }
    applyTheme(root, "dark")
    expect([...classes].sort()).toEqual(["dark", "something-else"])
    applyTheme(root, "light")
    expect([...classes].sort()).toEqual(["light", "something-else"])
  })
})

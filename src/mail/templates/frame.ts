import type { CSSProperties } from "react"

/**
 * The frame around the words: the doctype and the inline styles.
 *
 * Email clients ignore stylesheets, so every style is inline, and this is the
 * one file in the folder allowed to hold a string with a space in it — font
 * stacks and the doctype. Everything a reader can read comes from a Paraglide
 * message; `tests/repo/mail-templates.test.ts` holds the templates to that
 * and does not look here.
 */
export const DOCTYPE =
  '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">'

export const styles = {
  body: {
    backgroundColor: "#f4f4f5",
    margin: 0,
    padding: "24px 0",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  },
  container: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    margin: "0 auto",
    maxWidth: 480,
    padding: "32px 28px",
  },
  text: { color: "#18181b", fontSize: 16, lineHeight: "24px", margin: "0 0 16px" },
  code: {
    color: "#18181b",
    fontSize: 36,
    fontWeight: 700,
    letterSpacing: "0.2em",
    margin: "0 0 24px",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  },
  headline: { color: "#18181b", fontSize: 22, fontWeight: 700, lineHeight: "30px", margin: "0 0 20px" },
  link: { color: "#1d4ed8", textDecoration: "underline" },
  hr: { borderColor: "#e4e4e7", margin: "24px 0 16px" },
  small: { color: "#71717a", fontSize: 13, lineHeight: "20px", margin: 0 },
} satisfies Record<string, CSSProperties>

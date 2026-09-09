import type { ReactElement, ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { Body, Container, Head, Hr, Html, Link, Preview, Text } from "@react-email/components"
import { DOCTYPE, styles } from "./frame"

/**
 * Every email the app sends, as React, from the strings it already had.
 *
 * One source of truth, kept the only way it can be once an email has an HTML
 * part: the words come from a Paraglide message, once, and a template decides
 * structure — which paragraph is a heading, which token is a link, where the
 * unsubscribe footer goes. The text part IS the message; the HTML part is the
 * same message laid out. Nothing here holds a sentence, and
 * `tests/repo/mail-templates.test.ts` fails the build if one appears.
 *
 * Rendered in the Worker with `react-dom/server`, which resolves to React's
 * edge build under workerd. `@react-email/components` supplies the primitives
 * that survive mail clients; its own `render` is not used, because it drags
 * html-to-text and prettier into a bundle that only needs markup.
 */

/** A transactional mail: what `mailer.send` takes, less the recipient. */
export type Composed = { subject: string; text: string; html: string }

/** The per-recipient unsubscribe, in the reader's language: the sentence and the link. */
export type Unsubscribe = { label: string; url: string }

/**
 * A bulk mail: the HTML is a function of the recipient's unsubscribe link,
 * because the token in it is per person and the copy is rendered per locale.
 */
export type Bulk = { subject: string; text: string; html: (unsubscribe: Unsubscribe | null) => string }

/** The paragraphs of a message, exactly as the text part has them. */
export function paragraphs(message: string): string[] {
  return message
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
}

const URL_TOKEN = /(https?:\/\/[^\s]+)/

/** A paragraph with its URLs made links; everything else stays text. */
export function withLinks(paragraph: string): ReactNode[] {
  return paragraph.split(URL_TOKEN).map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <Link key={i} href={part} style={styles.link}>
        {part}
      </Link>
    ) : (
      part
    ),
  )
}

export function Layout({ locale, preview, children }: { locale: string; preview: string; children: ReactNode }) {
  return (
    <Html lang={locale} dir="ltr">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>{children}</Container>
      </Body>
    </Html>
  )
}

export function Paragraphs({ text }: { text: string }) {
  return (
    <>
      {paragraphs(text).map((p, i) => (
        <Text key={i} style={styles.text}>
          {withLinks(p)}
        </Text>
      ))}
    </>
  )
}

/** The way out, on bulk mail only: the sentence in the reader's language, then the link itself. */
export function Footer({ unsubscribe }: { unsubscribe: Unsubscribe | null }) {
  if (!unsubscribe) return null
  return (
    <>
      <Hr style={styles.hr} />
      <Text style={styles.small}>
        {unsubscribe.label}{" "}
        <Link href={unsubscribe.url} style={styles.link}>
          {unsubscribe.url}
        </Link>
      </Text>
    </>
  )
}

export function toHtml(element: ReactElement): string {
  return `${DOCTYPE}${renderToStaticMarkup(element)}`
}

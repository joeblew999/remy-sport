import { Heading } from "@react-email/components"
import { m } from "../../paraglide/messages.js"
import type { ReleasedLocale } from "../../domain/vocabularies"
import { styles } from "./frame"
import { Footer, Layout, Paragraphs, toHtml, type Bulk, type Unsubscribe } from "./render"

export type GameMailInput = {
  kind: "start" | "end" | "score"
  home: string
  away: string
  event: string
  /** Absolute: an email is read outside the app, so a hash route alone goes nowhere. */
  url: string
  homeScore: string
  awayScore: string
}

/** A game notification: the subject as the headline, the message's paragraphs, the way out. */
export function GameMail({
  headline,
  text,
  locale,
  unsubscribe,
}: {
  headline: string
  text: string
  locale: string
  unsubscribe: Unsubscribe | null
}) {
  return (
    <Layout locale={locale} preview={headline}>
      <Heading as="h1" style={styles.headline}>
        {headline}
      </Heading>
      <Paragraphs text={text} />
      <Footer unsubscribe={unsubscribe} />
    </Layout>
  )
}

export function gameMail(g: GameMailInput, locale: ReleasedLocale): Bulk {
  const { home, away, event, url, homeScore, awayScore } = g
  const subject =
    g.kind === "start"
      ? m.email_game_start_subject({ home, away }, { locale })
      : g.kind === "end"
        ? m.email_game_end_subject({ home, away, homeScore, awayScore }, { locale })
        : m.email_game_subject({ home, away, homeScore, awayScore }, { locale })
  const text = m.email_game_text({ event, home, away, url, homeScore, awayScore }, { locale })
  return {
    subject,
    text,
    html: (unsubscribe) => toHtml(<GameMail headline={subject} text={text} locale={locale} unsubscribe={unsubscribe} />),
  }
}

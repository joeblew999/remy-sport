import { Heading } from "@react-email/components"
import { m } from "../../paraglide/messages.js"
import type { ReleasedLocale } from "../../domain/vocabularies"
import { styles } from "./frame"
import { Footer, Layout, Paragraphs, toHtml, type Bulk, type Unsubscribe } from "./render"

export type MeetingMailInput = {
  /** Who asked. Their name, not their address. */
  from: string
  title: string
  /** Absolute: an email is read outside the app, so a hash route alone goes nowhere. */
  url: string
}

/** A meeting invitation: who wants to talk, what about, and the way in. */
export function MeetingMail({
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

export function meetingMail(i: MeetingMailInput, locale: ReleasedLocale): Bulk {
  const { from, title, url } = i
  const subject = m.email_meeting_subject({ from }, { locale })
  const text = m.email_meeting_text({ from, title, url }, { locale })
  return {
    subject,
    text,
    html: (unsubscribe) => toHtml(<MeetingMail headline={subject} text={text} locale={locale} unsubscribe={unsubscribe} />),
  }
}

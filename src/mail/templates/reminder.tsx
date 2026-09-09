import { Heading } from "@react-email/components"
import { m } from "../../paraglide/messages.js"
import type { ReleasedLocale } from "../../domain/vocabularies"
import { styles } from "./frame"
import { Footer, Layout, Paragraphs, toHtml, type Bulk, type Unsubscribe } from "./render"

/** An event starting soon: the subject as the headline, the message's paragraphs, the way out. */
export function ReminderMail({
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

export function reminderMail({ event, url }: { event: string; url: string }, locale: ReleasedLocale): Bulk {
  const subject = m.email_reminder_subject({ event }, { locale })
  const text = m.email_reminder_text({ event, url }, { locale })
  return {
    subject,
    text,
    html: (unsubscribe) => toHtml(<ReminderMail headline={subject} text={text} locale={locale} unsubscribe={unsubscribe} />),
  }
}

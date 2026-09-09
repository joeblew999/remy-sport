import { m } from "../../paraglide/messages.js"
import type { ReleasedLocale } from "../../domain/vocabularies"
import { Layout, Paragraphs, toHtml, type Composed } from "./render"

/** A co-organiser's invitation: the message's paragraphs, the accept URL a link. */
export function InviteMail({ text, locale, preview }: { text: string; locale: string; preview: string }) {
  return (
    <Layout locale={locale} preview={preview}>
      <Paragraphs text={text} />
    </Layout>
  )
}

export function inviteMail(
  { invitedBy, org, url }: { invitedBy: string; org: string; url: string },
  locale: ReleasedLocale,
): Composed {
  const subject = m.email_invite_subject({ invitedBy, org }, { locale })
  const text = m.email_invite_body({ invitedBy, org, url }, { locale })
  return { subject, text, html: toHtml(<InviteMail text={text} locale={locale} preview={subject} />) }
}

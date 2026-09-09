import { Heading } from "@react-email/components"
import { m } from "../../paraglide/messages.js"
import type { ReleasedLocale } from "../../domain/vocabularies"
import { styles } from "./frame"
import { Layout, Paragraphs, toHtml, type Composed } from "./render"

/**
 * The sign-in code. The code is the headline, large and spaced so a phone's
 * mail parser and a person both find it at once; the message's paragraphs
 * follow. No link, on purpose — see `sendVerificationOTP` in src/auth.ts.
 */
export function OtpMail({ otp, text, locale, preview }: { otp: string; text: string; locale: string; preview: string }) {
  return (
    <Layout locale={locale} preview={preview}>
      <Heading as="h1" style={styles.code}>
        {otp}
      </Heading>
      <Paragraphs text={text} />
    </Layout>
  )
}

export function otpMail({ otp, purpose }: { otp: string; purpose: string }, locale: ReleasedLocale): Composed {
  const subject = m.email_otp_subject({ otp }, { locale })
  const text = m.email_otp_body({ otp, purpose }, { locale })
  return { subject, text, html: toHtml(<OtpMail otp={otp} text={text} locale={locale} preview={subject} />) }
}

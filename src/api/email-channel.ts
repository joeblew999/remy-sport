import { and, eq, ne, or } from "drizzle-orm"
import * as schema from "../db/schema"
// From ./db rather than ./base: base imports auth, auth imports this, and a
// cycle would make module initialisation order load-bearing.
import type { Db } from "./db"

/**
 * The verified sign-in address, registered as the reader's EMAIL channel.
 *
 * The transport, the copy and the unsubscribe headers existed for months and
 * reached nobody: nothing ever wrote a real person's address into
 * `userNotificationChannel` as EMAIL, so the queue found no email audience and
 * every notification email the app could render went out to no one. This is
 * the missing write, and it runs where every sign-in passes — Better Auth's
 * session-create hook (`onSessionCreated` in src/auth.config.ts).
 *
 * The address has just been proved: the reader typed the code that was sent
 * to it. That is what `verifiedAt` records, and a user whose row says
 * `emailVerified` false — one created by an admin and never signed in —
 * gets no channel until they do.
 *
 * `isEnabled` on the row means "this address may be used"; whether it IS used
 * for a given notification type is the preference, which is opt-in for email
 * (`wantsChannel` in ./push.ts). Registering here therefore emails nobody
 * until they turn a switch on.
 *
 * Two statements rather than one upsert, because two unique indexes are in
 * play — one label per person per channel, one address per channel — and an
 * upsert can only name one. A row for this person at another address is the
 * address having changed, and goes; a row for this address under another
 * person is stale (Better Auth keeps addresses unique) and goes too. Then an
 * insert that yields to an existing row, so a reader's own switch on the row
 * survives their next sign-in.
 */
export async function registerEmailChannel(db: Db, userId: string, localeCode: string | null): Promise<void> {
  const user = await db
    .select({ email: schema.user.email, emailVerified: schema.user.emailVerified })
    .from(schema.user)
    .where(eq(schema.user.id, userId))
    .get()
  if (!user?.email || !user.emailVerified) return

  const email = user.email.trim().toLowerCase()
  await db
    .delete(schema.userNotificationChannel)
    .where(
      and(
        eq(schema.userNotificationChannel.channelCode, "EMAIL"),
        or(
          and(eq(schema.userNotificationChannel.userId, userId), ne(schema.userNotificationChannel.address, email)),
          and(eq(schema.userNotificationChannel.address, email), ne(schema.userNotificationChannel.userId, userId)),
        ),
      ),
    )
  await db
    .insert(schema.userNotificationChannel)
    .values({
      userId,
      channelCode: "EMAIL",
      address: email,
      addressLabel: "primary",
      secret: null,
      localeCode,
      isEnabled: true,
      verifiedAt: new Date().toISOString(),
    })
    .onConflictDoNothing()
}

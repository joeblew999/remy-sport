-- What has already been announced, so a scheduled job can be run twice safely.
--
-- Cron is not exactly-once. Cloudflare may retry a firing, a deploy may cause
-- two runs to overlap, and a missed run has to be able to catch up on the next
-- one without re-sending what it already sent. Every one of those is normal,
-- and none is survivable by a job that decides what to send from the clock.
--
-- The unique index is the whole mechanism: the sender inserts *before* it
-- sends, and a conflict means somebody else already has. That is a claim, not a
-- log — which is why it is checked with INSERT rather than SELECT-then-INSERT,
-- where two concurrent runs both read nothing and both send.
--
-- `kind` distinguishes the 24-hour reminder from the 1-hour one: the PO's
-- EVENT_REMINDER description names both, and they are two announcements about
-- the same event rather than one sent twice.

CREATE TABLE `notification_sent` (
	`object_type_code` text NOT NULL,
	`object_id` text NOT NULL,
	`type_code` text NOT NULL,
	`kind` text NOT NULL,
	`sent_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_sent_key` ON `notification_sent` (`object_type_code`,`object_id`,`type_code`,`kind`);
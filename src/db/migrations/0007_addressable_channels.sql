ALTER TABLE `userNotificationChannel` ADD `secret` text;--> statement-breakpoint
ALTER TABLE `userNotificationChannel` ADD `locale_code` text REFERENCES locale(code);--> statement-breakpoint
CREATE UNIQUE INDEX `userNotificationChannel_address` ON `userNotificationChannel` (`channel_code`,`address`);
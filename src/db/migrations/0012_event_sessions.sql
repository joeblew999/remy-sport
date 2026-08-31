CREATE TABLE `eventSession` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`venue_id` text,
	`starts_at` text NOT NULL,
	`ends_at` text NOT NULL,
	`names` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `event`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`venue_id`) REFERENCES `venue`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE TABLE `eventDivision` (
	`event_id` text NOT NULL,
	`division_id` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `event`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`division_id`) REFERENCES `division`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `eventDivision_key` ON `eventDivision` (`event_id`,`division_id`);
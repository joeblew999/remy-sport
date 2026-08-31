CREATE TABLE `sessionAttendance` (
	`session_id` text NOT NULL,
	`player_id` text NOT NULL,
	`recorded_at` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `eventSession`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`player_id`) REFERENCES `player`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessionAttendance_key` ON `sessionAttendance` (`session_id`,`player_id`);
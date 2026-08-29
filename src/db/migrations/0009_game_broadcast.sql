CREATE TABLE `gameBroadcast` (
	`game_id` text NOT NULL,
	`user_id` text NOT NULL,
	`started_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `game`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gameBroadcast_key` ON `gameBroadcast` (`game_id`);
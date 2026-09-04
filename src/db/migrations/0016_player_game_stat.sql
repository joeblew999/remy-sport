CREATE TABLE `playerGameStat` (
	`game_id` text NOT NULL,
	`player_id` text NOT NULL,
	`points` integer,
	`rebounds` integer,
	`assists` integer,
	`fouls` integer,
	FOREIGN KEY (`game_id`) REFERENCES `game`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`player_id`) REFERENCES `player`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `playerGameStat_key` ON `playerGameStat` (`game_id`,`player_id`);
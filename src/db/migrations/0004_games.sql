-- Games: the noun the Scores, Standings and Live half of the roadmap needs.
--
-- The Product Owner's model had ENTER_SCORES, CONFIRM_MATCH_STATUS,
-- VIEW_GAME_RESULTS and VIEW_MATCH_STATUS all declaring object type EVENT,
-- because there was no GAME to declare. That is why ENTER_SCORES was granted to
-- ANY_REFEREE — the platform role — which let every referee score every game in
-- every event. Those four actions are GAME-scoped now, and `gameReferee` is the
-- table the GAME_REFEREE relation reads.
--
-- `game_status` starts empty and that is safe: no game rows exist yet, so its
-- foreign key has nothing to violate. The seed fills it like every other
-- vocabulary. Contrast 0001, where lookup rows had to ship in the migration
-- because existing rows already pointed at them.

CREATE TABLE `game_status` (
	`code` text PRIMARY KEY NOT NULL,
	`name_en` text NOT NULL,
	`names` text NOT NULL,
	`sort` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `game` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`home_team_id` text NOT NULL,
	`away_team_id` text NOT NULL,
	`venue_id` text,
	`starts_at` text NOT NULL,
	`status_code` text DEFAULT 'SCHEDULED' NOT NULL,
	`home_score` integer,
	`away_score` integer,
	FOREIGN KEY (`event_id`) REFERENCES `event`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`home_team_id`) REFERENCES `team`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`away_team_id`) REFERENCES `team`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`venue_id`) REFERENCES `venue`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`status_code`) REFERENCES `game_status`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `gameReferee` (
	`game_id` text NOT NULL,
	`user_id` text NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `game`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gameReferee_key` ON `gameReferee` (`game_id`,`user_id`);
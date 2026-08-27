CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`issuer` text NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `account_issuer_accountId_uidx` ON `account` (`issuer`,`account_id`);--> statement-breakpoint
CREATE INDEX `account_userId_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE TABLE `invitation` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text,
	`team_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`inviter_id` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`inviter_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `invitation_organizationId_idx` ON `invitation` (`organization_id`);--> statement-breakpoint
CREATE INDEX `invitation_email_idx` ON `invitation` (`email`);--> statement-breakpoint
CREATE TABLE `member` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `member_organizationId_idx` ON `member` (`organization_id`);--> statement-breakpoint
CREATE INDEX `member_userId_idx` ON `member` (`user_id`);--> statement-breakpoint
CREATE TABLE `org_team` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`member_count` integer DEFAULT 0 NOT NULL,
	`organization_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `orgTeam_organizationId_idx` ON `org_team` (`organization_id`);--> statement-breakpoint
CREATE TABLE `org_team_member` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`user_id` text NOT NULL,
	`membership_key` text,
	`created_at` integer,
	FOREIGN KEY (`team_id`) REFERENCES `org_team`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `org_team_member_membership_key_unique` ON `org_team_member` (`membership_key`);--> statement-breakpoint
CREATE INDEX `orgTeamMember_teamId_idx` ON `org_team_member` (`team_id`);--> statement-breakpoint
CREATE INDEX `orgTeamMember_userId_idx` ON `org_team_member` (`user_id`);--> statement-breakpoint
CREATE TABLE `organization` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`logo` text,
	`created_at` integer NOT NULL,
	`metadata` text,
	`names` text,
	`org_type_code` text,
	`city_code` text,
	`province_code` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organization_slug_unique` ON `organization` (`slug`);--> statement-breakpoint
CREATE TABLE `organization_role` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`role` text NOT NULL,
	`permission` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `organizationRole_organizationId_idx` ON `organization_role` (`organization_id`);--> statement-breakpoint
CREATE INDEX `organizationRole_role_idx` ON `organization_role` (`role`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	`impersonated_by` text,
	`active_organization_id` text,
	`active_team_id` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_userId_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`role` text,
	`banned` integer DEFAULT false,
	`ban_reason` text,
	`ban_expires` integer,
	`biz_id` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);--> statement-breakpoint
CREATE TABLE `event` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`names` text NOT NULL,
	`type_code` text NOT NULL,
	`format_code` text DEFAULT '5x5' NOT NULL,
	`description` text,
	`start_date` text,
	`end_date` text,
	`city_code` text,
	`province_code` text,
	`is_fiba_certified` integer DEFAULT false NOT NULL,
	`organizer_user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organizer_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `event_city_code_idx` ON `event` (`city_code`);--> statement-breakpoint
CREATE TABLE `team` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`names` text NOT NULL,
	`org_id` text NOT NULL,
	`age_group_code` text NOT NULL,
	`gender_code` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `org`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`age_group_code`) REFERENCES `age_group`(`code`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`gender_code`) REFERENCES `gender`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `team_org_idx` ON `team` (`org_id`);--> statement-breakpoint
CREATE TABLE `action` (
	`code` text PRIMARY KEY NOT NULL,
	`object_type_code` text NOT NULL,
	`category` text NOT NULL,
	`name_en` text NOT NULL,
	`names` text NOT NULL,
	`sort` integer NOT NULL,
	FOREIGN KEY (`object_type_code`) REFERENCES `object_type`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `age_group` (
	`code` text PRIMARY KEY NOT NULL,
	`name_en` text NOT NULL,
	`names` text NOT NULL,
	`min_age` integer,
	`max_age` integer,
	`sort` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `city` (
	`code` text PRIMARY KEY NOT NULL,
	`name_en` text NOT NULL,
	`names` text NOT NULL,
	`province_code` text NOT NULL,
	`sort` integer NOT NULL,
	FOREIGN KEY (`province_code`) REFERENCES `province`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `coach_role` (
	`code` text PRIMARY KEY NOT NULL,
	`name_en` text NOT NULL,
	`names` text NOT NULL,
	`sort` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `event_format` (
	`code` text PRIMARY KEY NOT NULL,
	`name_en` text NOT NULL,
	`names` text NOT NULL,
	`sort` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `event_type` (
	`code` text PRIMARY KEY NOT NULL,
	`name_en` text NOT NULL,
	`names` text NOT NULL,
	`description_en` text NOT NULL,
	`descriptions` text NOT NULL,
	`sort` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `gender` (
	`code` text PRIMARY KEY NOT NULL,
	`name_en` text NOT NULL,
	`names` text NOT NULL,
	`sort` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `guardian_type` (
	`code` text PRIMARY KEY NOT NULL,
	`name_en` text NOT NULL,
	`names` text NOT NULL,
	`sort` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `locale` (
	`code` text PRIMARY KEY NOT NULL,
	`name_en` text NOT NULL,
	`names` text NOT NULL,
	`status` text NOT NULL,
	`sort` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `notification_category` (
	`code` text PRIMARY KEY NOT NULL,
	`name_en` text NOT NULL,
	`names` text NOT NULL,
	`sort` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `notification_channel` (
	`code` text PRIMARY KEY NOT NULL,
	`name_en` text NOT NULL,
	`names` text NOT NULL,
	`address_format` text NOT NULL,
	`description_en` text NOT NULL,
	`descriptions` text NOT NULL,
	`sort` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `notification_type` (
	`code` text PRIMARY KEY NOT NULL,
	`category_code` text NOT NULL,
	`name_en` text NOT NULL,
	`names` text NOT NULL,
	`description_en` text NOT NULL,
	`descriptions` text NOT NULL,
	`sort` integer NOT NULL,
	FOREIGN KEY (`category_code`) REFERENCES `notification_category`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `object_type` (
	`code` text PRIMARY KEY NOT NULL,
	`name_en` text NOT NULL,
	`names` text NOT NULL,
	`description_en` text NOT NULL,
	`descriptions` text NOT NULL,
	`table_name` text,
	`sort` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `org_role` (
	`code` text PRIMARY KEY NOT NULL,
	`name_en` text NOT NULL,
	`names` text NOT NULL,
	`sort` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `org_type` (
	`code` text PRIMARY KEY NOT NULL,
	`name_en` text NOT NULL,
	`names` text NOT NULL,
	`sort` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `position` (
	`code` text PRIMARY KEY NOT NULL,
	`name_en` text NOT NULL,
	`names` text NOT NULL,
	`full_name_en` text NOT NULL,
	`full_names` text NOT NULL,
	`sort` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `province` (
	`code` text PRIMARY KEY NOT NULL,
	`name_en` text NOT NULL,
	`names` text NOT NULL,
	`sort` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `relation` (
	`code` text PRIMARY KEY NOT NULL,
	`object_type_code` text NOT NULL,
	`name_en` text NOT NULL,
	`names` text NOT NULL,
	`via` text NOT NULL,
	`source_table` text,
	`object_column` text,
	`user_column` text,
	`filter_column` text,
	`filter_value` text,
	`through_table` text,
	`through_column` text,
	`active_to_column` text,
	`role_code` text,
	`sort` integer NOT NULL,
	FOREIGN KEY (`object_type_code`) REFERENCES `object_type`(`code`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`role_code`) REFERENCES `role`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `role` (
	`code` text PRIMARY KEY NOT NULL,
	`name_en` text NOT NULL,
	`names` text NOT NULL,
	`description_en` text NOT NULL,
	`descriptions` text NOT NULL,
	`sort` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `skill_tier` (
	`code` text PRIMARY KEY NOT NULL,
	`name_en` text NOT NULL,
	`names` text NOT NULL,
	`sort` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user_status` (
	`code` text PRIMARY KEY NOT NULL,
	`name_en` text NOT NULL,
	`names` text NOT NULL,
	`description_en` text NOT NULL,
	`descriptions` text NOT NULL,
	`sort` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `division` (
	`id` text PRIMARY KEY NOT NULL,
	`age_group_code` text NOT NULL,
	`gender_code` text NOT NULL,
	`skill_tier_code` text,
	`names` text NOT NULL,
	FOREIGN KEY (`age_group_code`) REFERENCES `age_group`(`code`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`gender_code`) REFERENCES `gender`(`code`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`skill_tier_code`) REFERENCES `skill_tier`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `eventCoOrganizer` (
	`event_id` text NOT NULL,
	`user_id` text NOT NULL,
	`added_at` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `event`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `eventCoOrganizer_key` ON `eventCoOrganizer` (`event_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `eventPlayer` (
	`event_id` text NOT NULL,
	`player_id` text NOT NULL,
	`registered_at` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `event`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`player_id`) REFERENCES `player`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `eventPlayer_key` ON `eventPlayer` (`event_id`,`player_id`);--> statement-breakpoint
CREATE TABLE `eventTeam` (
	`event_id` text NOT NULL,
	`team_id` text NOT NULL,
	`division_id` text NOT NULL,
	`registered_at` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `event`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`team_id`) REFERENCES `team`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`division_id`) REFERENCES `division`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `eventTeam_key` ON `eventTeam` (`event_id`,`team_id`,`division_id`);--> statement-breakpoint
CREATE TABLE `eventVenue` (
	`event_id` text NOT NULL,
	`venue_id` text NOT NULL,
	`is_primary` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `event`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`venue_id`) REFERENCES `venue`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `eventVenue_key` ON `eventVenue` (`event_id`,`venue_id`);--> statement-breakpoint
CREATE TABLE `guardian` (
	`user_id` text NOT NULL,
	`player_id` text NOT NULL,
	`guardian_type_code` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`player_id`) REFERENCES `player`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`guardian_type_code`) REFERENCES `guardian_type`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `guardian_key` ON `guardian` (`user_id`,`player_id`);--> statement-breakpoint
CREATE TABLE `org` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`org_type_code` text NOT NULL,
	`city_code` text NOT NULL,
	`province_code` text NOT NULL,
	`names` text NOT NULL,
	FOREIGN KEY (`org_type_code`) REFERENCES `org_type`(`code`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`city_code`) REFERENCES `city`(`code`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`province_code`) REFERENCES `province`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `org_key` ON `org` (`id`,`slug`);--> statement-breakpoint
CREATE TABLE `player` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`jersey_number` integer NOT NULL,
	`position_code` text NOT NULL,
	`dob` text NOT NULL,
	`names` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`position_code`) REFERENCES `position`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `playerTeam` (
	`player_id` text NOT NULL,
	`team_id` text NOT NULL,
	`from_date` text NOT NULL,
	`to_date` text,
	FOREIGN KEY (`player_id`) REFERENCES `player`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`team_id`) REFERENCES `team`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `playerTeam_key` ON `playerTeam` (`player_id`,`team_id`,`from_date`);--> statement-breakpoint
CREATE TABLE `subscription` (
	`user_id` text NOT NULL,
	`object_type_code` text NOT NULL,
	`object_id` text NOT NULL,
	`subscribed_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`object_type_code`) REFERENCES `object_type`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subscription_key` ON `subscription` (`user_id`,`object_type_code`,`object_id`);--> statement-breakpoint
CREATE TABLE `teamCoach` (
	`team_id` text NOT NULL,
	`user_id` text NOT NULL,
	`coach_role_code` text NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `team`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`coach_role_code`) REFERENCES `coach_role`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `teamCoach_key` ON `teamCoach` (`team_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `userNotificationChannel` (
	`user_id` text NOT NULL,
	`channel_code` text NOT NULL,
	`address` text NOT NULL,
	`address_label` text NOT NULL,
	`is_enabled` integer NOT NULL,
	`verified_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`channel_code`) REFERENCES `notification_channel`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `userNotificationChannel_key` ON `userNotificationChannel` (`user_id`,`channel_code`,`address_label`);--> statement-breakpoint
CREATE TABLE `userNotificationPreference` (
	`user_id` text NOT NULL,
	`notification_type_code` text NOT NULL,
	`channel_code` text NOT NULL,
	`is_enabled` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`notification_type_code`) REFERENCES `notification_type`(`code`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`channel_code`) REFERENCES `notification_channel`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `userNotificationPreference_key` ON `userNotificationPreference` (`user_id`,`notification_type_code`,`channel_code`);--> statement-breakpoint
CREATE TABLE `venue` (
	`id` text PRIMARY KEY NOT NULL,
	`address` text NOT NULL,
	`city_code` text NOT NULL,
	`province_code` text NOT NULL,
	`names` text NOT NULL,
	FOREIGN KEY (`city_code`) REFERENCES `city`(`code`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`province_code`) REFERENCES `province`(`code`) ON UPDATE no action ON DELETE no action
);

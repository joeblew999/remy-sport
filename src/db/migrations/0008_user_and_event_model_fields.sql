ALTER TABLE `user` ADD `names` text;--> statement-breakpoint
ALTER TABLE `user` ADD `locale_code` text;--> statement-breakpoint
ALTER TABLE `user` ADD `status_code` text;--> statement-breakpoint
ALTER TABLE `event` ADD `org_id` text REFERENCES org(id);
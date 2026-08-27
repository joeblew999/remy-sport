-- Membership becomes the domain's, and the organization plugin goes.
--
-- Better Auth owns authentication: user, session, account, verification. It
-- owned six more tables than that — organization, member, invitation,
-- organizationRole, orgTeam, orgTeamMember — and every one of them is the
-- domain's. `organization` had become a shadow of `org` carrying the same ids,
-- and the ORG relations derived from `member`, which meant the Product Owner's
-- model reached into an auth library's column names and its lowercased roles.
--
-- What went with the plugin was an invitation flow no part of the product could
-- start: there was never a way to send one.
--
-- The rows are copied before anything is dropped. drizzle-kit emitted this
-- without that step — a schema diff sees a table appear and a table disappear,
-- and cannot know that one holds the other's data.

CREATE TABLE `org_member` (
	`org_id` text NOT NULL,
	`user_id` text NOT NULL,
	`org_role_code` text NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `org`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`org_role_code`) REFERENCES `org_role`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `org_member_key` ON `org_member` (`org_id`,`user_id`);--> statement-breakpoint
-- The existing memberships, before the table holding them goes. Better Auth
-- stored the role lowercased; the model spells it in its own case.
INSERT OR IGNORE INTO org_member (org_id, user_id, org_role_code)
SELECT organization_id, user_id, UPPER(role) FROM member
WHERE organization_id IN (SELECT id FROM org)
  AND UPPER(role) IN (SELECT code FROM org_role);
--> statement-breakpoint
DROP TABLE `invitation`;--> statement-breakpoint
DROP TABLE `member`;--> statement-breakpoint
DROP TABLE `org_team`;--> statement-breakpoint
DROP TABLE `org_team_member`;--> statement-breakpoint
DROP TABLE `organization`;--> statement-breakpoint
DROP TABLE `organization_role`;--> statement-breakpoint
ALTER TABLE `session` DROP COLUMN `active_organization_id`;--> statement-breakpoint
ALTER TABLE `session` DROP COLUMN `active_team_id`;
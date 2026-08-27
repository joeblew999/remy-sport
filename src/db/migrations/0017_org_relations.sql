-- Bring an existing database up to the current vocabularies.
--
-- 0009 is GENERATED and always reflects the fixtures as they are now, so a
-- database that applied it months ago never sees anything added since. Fresh
-- databases get the current shape from 0009 itself and every statement below is
-- a no-op for them; deployed ones get the delta here.
--
-- That asymmetry is the cost of generating a migration. It works while changes
-- are additive — CREATE TABLE IF NOT EXISTS, INSERT OR IGNORE — and it does not
-- work for a rename, which is why relationships.jsonl still carries a name
-- nobody likes. See the note on it in the PO's schema.md.
--
-- What changed: the ORG object type finally has relations and actions attached
-- to it, DIVISION had none and is gone, and `relation` gained the structured
-- derivation columns that replaced its free-text `derived_from`.

-- How much authority someone holds inside an organisation. Distinct from the
-- six-role platform vocabulary: a COACH platform-wide may be an ADMIN of one
-- school.
CREATE TABLE IF NOT EXISTS org_role (
  code               TEXT PRIMARY KEY,
  name_en            TEXT NOT NULL,
  names              TEXT NOT NULL,
  sort               INTEGER NOT NULL
);
INSERT OR IGNORE INTO org_role (code, name_en, names, sort) VALUES
  ('ADMIN', 'Organisation Admin', '{"th":"ผู้ดูแลองค์กร","en":"Organisation Admin"}', 1),
  ('MEMBER', 'Organisation Member', '{"th":"สมาชิกองค์กร","en":"Organisation Member"}', 2);

-- Viewing, editing and staffing an organisation.
INSERT OR IGNORE INTO action (code, object_type_code, category, name_en, names, sort) VALUES
  ('SIGN_IN_OUT', 'PLATFORM', 'Auth', 'Sign in / Sign out', '{"th":"ลงชื่อเข้า / ออก","en":"Sign in / Sign out"}', 1),
  ('SIGN_UP_AS_SPECTATOR', 'PLATFORM', 'Auth', 'Sign up as Spectator', '{"th":"สมัครเป็นผู้ชม","en":"Sign up as Spectator"}', 2),
  ('SIGN_UP_AS_PLAYER', 'PLATFORM', 'Auth', 'Sign up as Player (adult)', '{"th":"สมัครเป็นผู้เล่น (ผู้ใหญ่)","en":"Sign up as Player (adult)"}', 3),
  ('SIGN_UP_AS_COACH', 'PLATFORM', 'Auth', 'Sign up as Coach', '{"th":"สมัครเป็นโค้ช","en":"Sign up as Coach"}', 4),
  ('SIGN_UP_AS_ORGANIZER', 'PLATFORM', 'Auth', 'Sign up as Organizer', '{"th":"สมัครเป็นผู้จัดการแข่งขัน","en":"Sign up as Organizer"}', 5),
  ('SIGN_UP_PLAYER_AS_GUARDIAN', 'PLATFORM', 'Auth', 'Sign up minor Player as Guardian', '{"th":"สมัครผู้เล่น (เด็กในความดูแล)","en":"Sign up minor Player as Guardian"}', 6),
  ('SIGN_UP_AS_REFEREE_REQUEST', 'PLATFORM', 'Auth', 'Submit Referee signup request', '{"th":"ส่งคำขอสมัครเป็นผู้ตัดสิน","en":"Submit Referee signup request"}', 7),
  ('APPROVE_REFEREE', 'PLATFORM', 'Admin', 'Approve pending Referee account', '{"th":"อนุมัติผู้ตัดสิน","en":"Approve pending Referee account"}', 8),
  ('CREATE_USER_ACCOUNT', 'PLATFORM', 'Admin', 'Create any user account (admin-only minting)', '{"th":"สร้างบัญชีผู้ใช้ (ใดๆ)","en":"Create any user account (admin-only minting)"}', 9),
  ('INVITE_CO_ORGANIZER', 'EVENT', 'Events', 'Invite Co-organizer to event', '{"th":"เชิญผู้ร่วมจัด","en":"Invite Co-organizer to event"}', 10),
  ('ACCEPT_CO_ORGANIZER_INVITE', 'EVENT', 'Events', 'Accept Co-organizer invite', '{"th":"ตอบรับเป็นผู้ร่วมจัด","en":"Accept Co-organizer invite"}', 11),
  ('INSTALL_APP', 'PLATFORM', 'Live', 'Install app (PWA)', '{"th":"ติดตั้งแอป (PWA)","en":"Install app (PWA)"}', 12),
  ('MANAGE_ALL_USERS', 'PLATFORM', 'Admin', 'Manage all users', '{"th":"จัดการผู้ใช้ทั้งหมด","en":"Manage all users"}', 13),
  ('MODERATE_LISTINGS', 'PLATFORM', 'Admin', 'Moderate listings', '{"th":"ตรวจสอบและจัดการรายการ","en":"Moderate listings"}', 14),
  ('BROWSE_EVENTS', 'PLATFORM', 'Events', 'Browse events (list)', '{"th":"เรียกดูอีเวนต์","en":"Browse events (list)"}', 15),
  ('BROWSE_TEAMS', 'PLATFORM', 'Teams', 'Browse / find a team', '{"th":"ค้นหาทีม","en":"Browse / find a team"}', 16),
  ('CREATE_EVENT', 'PLATFORM', 'Events', 'Create event', '{"th":"สร้างอีเวนต์","en":"Create event"}', 17),
  ('VIEW_EVENT', 'EVENT', 'Events', 'View event detail', '{"th":"ดูอีเวนต์","en":"View event detail"}', 18),
  ('EDIT_EVENT', 'EVENT', 'Events', 'Edit event', '{"th":"แก้ไขอีเวนต์","en":"Edit event"}', 19),
  ('DELETE_EVENT', 'EVENT', 'Events', 'Delete event', '{"th":"ลบอีเวนต์","en":"Delete event"}', 20),
  ('MANAGE_DIVISIONS', 'EVENT', 'Events', 'Manage event divisions', '{"th":"จัดการดิวิชั่น","en":"Manage event divisions"}', 21),
  ('REGISTER_TEAM_FOR_EVENT', 'EVENT', 'Events', 'Register team for event', '{"th":"ลงทะเบียนทีมเข้าอีเวนต์","en":"Register team for event"}', 22),
  ('REGISTER_PLAYER_FOR_EVENT', 'EVENT', 'Events', 'Register player for event', '{"th":"ลงทะเบียนผู้เล่นเข้าอีเวนต์","en":"Register player for event"}', 23),
  ('CREATE_TEAM', 'PLATFORM', 'Teams', 'Create team', '{"th":"สร้างทีม","en":"Create team"}', 24),
  ('VIEW_TEAM', 'TEAM', 'Teams', 'View team profile', '{"th":"ดูโปรไฟล์ทีม","en":"View team profile"}', 25),
  ('EDIT_TEAM_PROFILE', 'TEAM', 'Teams', 'Edit team profile', '{"th":"แก้ไขโปรไฟล์ทีม","en":"Edit team profile"}', 26),
  ('DELETE_TEAM', 'TEAM', 'Teams', 'Delete team', '{"th":"ลบทีม","en":"Delete team"}', 27),
  ('MANAGE_ROSTER', 'TEAM', 'Teams', 'Manage team roster', '{"th":"จัดการรายชื่อผู้เล่น","en":"Manage team roster"}', 28),
  ('CREATE_PLAYER', 'PLATFORM', 'Players', 'Create player profile', '{"th":"สร้างโปรไฟล์ผู้เล่น","en":"Create player profile"}', 29),
  ('VIEW_PLAYER', 'PLAYER', 'Players', 'View player profile', '{"th":"ดูโปรไฟล์ผู้เล่น","en":"View player profile"}', 30),
  ('EDIT_PLAYER_PROFILE', 'PLAYER', 'Players', 'Edit player profile', '{"th":"แก้ไขโปรไฟล์ผู้เล่น","en":"Edit player profile"}', 31),
  ('DELETE_PLAYER', 'PLAYER', 'Players', 'Delete player profile', '{"th":"ลบโปรไฟล์ผู้เล่น","en":"Delete player profile"}', 32),
  ('VIEW_PLAYER_STATS', 'PLAYER', 'Rankings', 'View player stats', '{"th":"ดูสถิติผู้เล่น","en":"View player stats"}', 33),
  ('FOLLOW_PLAYER', 'PLAYER', 'Players', 'Follow player', '{"th":"ติดตามผู้เล่น","en":"Follow player"}', 34),
  ('UNFOLLOW_PLAYER', 'PLAYER', 'Players', 'Unfollow player', '{"th":"เลิกติดตามผู้เล่น","en":"Unfollow player"}', 35),
  ('RECEIVE_PLAYER_NOTIFICATIONS', 'PLAYER', 'Live', 'Receive player notifications', '{"th":"รับการแจ้งเตือนผู้เล่น","en":"Receive player notifications"}', 36),
  ('FOLLOW_TEAM', 'TEAM', 'Teams', 'Follow team', '{"th":"ติดตามทีม","en":"Follow team"}', 37),
  ('UNFOLLOW_TEAM', 'TEAM', 'Teams', 'Unfollow team', '{"th":"เลิกติดตามทีม","en":"Unfollow team"}', 38),
  ('RECEIVE_TEAM_NOTIFICATIONS', 'TEAM', 'Live', 'Receive team notifications', '{"th":"รับการแจ้งเตือนทีม","en":"Receive team notifications"}', 39),
  ('FOLLOW_EVENT', 'EVENT', 'Events', 'Follow event', '{"th":"ติดตามอีเวนต์","en":"Follow event"}', 40),
  ('UNFOLLOW_EVENT', 'EVENT', 'Events', 'Unfollow event', '{"th":"เลิกติดตามอีเวนต์","en":"Unfollow event"}', 41),
  ('RECEIVE_EVENT_NOTIFICATIONS', 'EVENT', 'Live', 'Receive event notifications', '{"th":"รับการแจ้งเตือนอีเวนต์","en":"Receive event notifications"}', 42),
  ('VIEW_BRACKET', 'EVENT', 'Schedules', 'View bracket', '{"th":"ดูสายแข่งขัน","en":"View bracket"}', 43),
  ('VIEW_FIXTURE_SCHEDULE', 'EVENT', 'Schedules', 'View fixture schedule', '{"th":"ดูตารางแข่งขัน","en":"View fixture schedule"}', 44),
  ('VIEW_COURT_ASSIGNMENTS', 'EVENT', 'Schedules', 'View court assignments', '{"th":"ดูการจัดสนาม","en":"View court assignments"}', 45),
  ('GENERATE_BRACKETS', 'EVENT', 'Schedules', 'Generate brackets', '{"th":"สร้างสายแข่งขัน","en":"Generate brackets"}', 46),
  ('GENERATE_FIXTURES', 'EVENT', 'Schedules', 'Generate fixtures', '{"th":"สร้างตารางแข่งขัน","en":"Generate fixtures"}', 47),
  ('DEFINE_SESSION_SCHEDULE', 'EVENT', 'Schedules', 'Define session schedule', '{"th":"กำหนดตารางเซสชัน","en":"Define session schedule"}', 48),
  ('ASSIGN_COURTS', 'EVENT', 'Schedules', 'Assign courts', '{"th":"กำหนดสนาม","en":"Assign courts"}', 49),
  ('ENTER_SCORES', 'EVENT', 'Scores', 'Enter scores', '{"th":"บันทึกคะแนน","en":"Enter scores"}', 50),
  ('CONFIRM_MATCH_STATUS', 'EVENT', 'Scores', 'Confirm match status', '{"th":"ยืนยันสถานะการแข่งขัน","en":"Confirm match status"}', 51),
  ('RECORD_ATTENDANCE', 'EVENT', 'Scores', 'Record attendance', '{"th":"บันทึกการเข้าร่วม","en":"Record attendance"}', 52),
  ('VIEW_GAME_RESULTS', 'EVENT', 'Scores', 'View game results', '{"th":"ดูผลการแข่งขัน","en":"View game results"}', 53),
  ('VIEW_MATCH_STATUS', 'EVENT', 'Scores', 'View match status', '{"th":"ดูสถานะการแข่งขัน","en":"View match status"}', 54),
  ('SPOILER_MODE', 'PLATFORM', 'Scores', 'Spoiler mode preference', '{"th":"โหมดซ่อนสปอยล์","en":"Spoiler mode preference"}', 55),
  ('VIEW_RESULTS_ARCHIVE', 'PLATFORM', 'Scores', 'View results archive', '{"th":"ดูประวัติผลการแข่งขัน","en":"View results archive"}', 56),
  ('VIEW_STANDINGS', 'EVENT', 'Rankings', 'View standings', '{"th":"ดูตารางคะแนน","en":"View standings"}', 57),
  ('VIEW_RANK_MOVEMENT', 'EVENT', 'Rankings', 'View rank movement', '{"th":"ดูการเปลี่ยนอันดับ","en":"View rank movement"}', 58),
  ('VIEW_RANKINGS_HISTORY', 'PLATFORM', 'Rankings', 'View rankings history', '{"th":"ดูประวัติอันดับ","en":"View rankings history"}', 59),
  ('VIEW_SEASON_RECORDS', 'EVENT', 'Rankings', 'View season records', '{"th":"ดูสถิติประจำฤดูกาล","en":"View season records"}', 60),
  ('VIEW_LIVE_SCORES', 'EVENT', 'Live', 'View live scores', '{"th":"ดูคะแนนสด","en":"View live scores"}', 61),
  ('RECEIVE_NOTIFICATIONS', 'PLATFORM', 'Live', 'Receive push notifications', '{"th":"รับการแจ้งเตือน","en":"Receive push notifications"}', 62),
  ('MANAGE_OWN_NOTIFICATION_CHANNELS', 'PLATFORM', 'Live', 'Manage own notification channels (add / remove / verify / enable / disable)', '{"th":"จัดการช่องทางการแจ้งเตือนของตัวเอง","en":"Manage own notification channels (add / remove / verify / enable / disable)"}', 63),
  ('MANAGE_OWN_NOTIFICATION_PREFERENCES', 'PLATFORM', 'Live', 'Manage own per-type notification preferences (which type via which channel)', '{"th":"จัดการการตั้งค่าการแจ้งเตือนของตัวเอง","en":"Manage own per-type notification preferences (which type via which channel)"}', 64),
  ('VIEW_LIVE_STREAM', 'EVENT', 'Live', 'View live stream links', '{"th":"ดูถ่ายทอดสด","en":"View live stream links"}', 65),
  ('VIEW_COURT_STATUS_BOARD', 'EVENT', 'Live', 'View court status board', '{"th":"ดูกระดานสถานะสนาม","en":"View court status board"}', 66),
  ('AI_CREATE_EVENT', 'PLATFORM', 'AI', 'Create event via AI chat', '{"th":"สร้างอีเวนต์ผ่านแชต","en":"Create event via AI chat"}', 67),
  ('AI_BRACKET_SUGGESTIONS', 'EVENT', 'AI', 'AI bracket suggestions', '{"th":"คำแนะนำสายแข่งขัน","en":"AI bracket suggestions"}', 68),
  ('AI_QA', 'PLATFORM', 'AI', 'AI Q&A', '{"th":"ถาม-ตอบ AI","en":"AI Q&A"}', 69),
  ('VIEW_ORG', 'ORG', 'Organisation', 'View organisation profile', '{"th":"ดูโปรไฟล์องค์กร","en":"View organisation profile"}', 70),
  ('EDIT_ORG_PROFILE', 'ORG', 'Organisation', 'Edit organisation profile', '{"th":"แก้ไขโปรไฟล์องค์กร","en":"Edit organisation profile"}', 71),
  ('INVITE_ORG_MEMBER', 'ORG', 'Organisation', 'Invite someone to an organisation', '{"th":"เชิญสมาชิกเข้าองค์กร","en":"Invite someone to an organisation"}', 72),
  ('REMOVE_ORG_MEMBER', 'ORG', 'Organisation', 'Remove someone from an organisation', '{"th":"นำสมาชิกออกจากองค์กร","en":"Remove someone from an organisation"}', 73);

-- Nothing ever held a relation to a division: MANAGE_DIVISIONS is an EVENT
-- action, granted through OWNER and CO_ORGANIZER. Removed from the model.
DELETE FROM object_type WHERE code = 'DIVISION';

-- `relation` swapped free-text `derived_from` for structured columns the app
-- compiles into its resolvers. Rebuilt rather than altered: it is a vocabulary
-- with no inbound foreign keys, so dropping it costs nothing and this stays
-- correct whether the old shape, the new shape, or neither is present.
DROP TABLE IF EXISTS relation;
CREATE TABLE IF NOT EXISTS relation (
  code               TEXT PRIMARY KEY,
  object_type_code   TEXT NOT NULL REFERENCES object_type(code),
  name_en            TEXT NOT NULL,
  names              TEXT NOT NULL,
  via                TEXT NOT NULL,
  source_table       TEXT,
  object_column      TEXT,
  user_column        TEXT,
  filter_column      TEXT,
  filter_value       TEXT,
  through_table      TEXT,
  through_column     TEXT,
  active_to_column   TEXT,
  role_code          TEXT REFERENCES role(code),
  sort               INTEGER NOT NULL
);
INSERT OR IGNORE INTO relation (code, object_type_code, name_en, names, via, source_table, object_column, user_column, filter_column, filter_value, through_table, through_column, active_to_column, role_code, sort) VALUES
  ('OWNER', 'EVENT', 'Owner', '{"th":"เจ้าของ","en":"Owner"}', 'table', 'events', 'id', 'organizer_user_id', NULL, NULL, NULL, NULL, NULL, NULL, 1),
  ('CO_ORGANIZER', 'EVENT', 'Co-organizer', '{"th":"ผู้ร่วมจัด","en":"Co-organizer"}', 'table', 'event_co_organizers', 'event_id', 'user_id', NULL, NULL, NULL, NULL, NULL, NULL, 2),
  ('HEAD_COACH', 'TEAM', 'Head Coach', '{"th":"หัวหน้าผู้ฝึกสอน","en":"Head Coach"}', 'table', 'team_coaches', 'team_id', 'user_id', 'coach_role_code', 'HEAD', NULL, NULL, NULL, NULL, 3),
  ('ASSISTANT_COACH', 'TEAM', 'Assistant Coach', '{"th":"ผู้ช่วยผู้ฝึกสอน","en":"Assistant Coach"}', 'table', 'team_coaches', 'team_id', 'user_id', 'coach_role_code', 'ASSISTANT', NULL, NULL, NULL, NULL, 4),
  ('TEAM_MANAGER', 'TEAM', 'Team Manager', '{"th":"ผู้จัดการทีม","en":"Team Manager"}', 'table', 'team_coaches', 'team_id', 'user_id', 'coach_role_code', 'MANAGER', NULL, NULL, NULL, NULL, 5),
  ('TEAM_PLAYER', 'TEAM', 'Team Player', '{"th":"ผู้เล่นในทีม","en":"Team Player"}', 'table', 'player_teams', 'team_id', 'user_id', NULL, NULL, 'players', 'player_id', 'to_date', NULL, 6),
  ('SELF', 'PLAYER', 'Self', '{"th":"ตัวเอง","en":"Self"}', 'table', 'players', 'id', 'user_id', NULL, NULL, NULL, NULL, NULL, NULL, 7),
  ('GUARDIAN', 'PLAYER', 'Guardian', '{"th":"ผู้ปกครอง","en":"Guardian"}', 'table', 'guardians', 'player_id', 'user_id', NULL, NULL, NULL, NULL, NULL, NULL, 8),
  ('FOLLOWER_PLAYER', 'PLAYER', 'Player Follower', '{"th":"ผู้ติดตาม (ผู้เล่น)","en":"Player Follower"}', 'table', 'subscriptions', 'object_id', 'user_id', 'object_type_code', 'PLAYER', NULL, NULL, NULL, NULL, 9),
  ('FOLLOWER_TEAM', 'TEAM', 'Team Follower', '{"th":"ผู้ติดตาม (ทีม)","en":"Team Follower"}', 'table', 'subscriptions', 'object_id', 'user_id', 'object_type_code', 'TEAM', NULL, NULL, NULL, NULL, 10),
  ('ORG_ADMIN', 'ORG', 'Organisation Admin', '{"th":"ผู้ดูแลองค์กร","en":"Organisation Admin"}', 'table', 'members', 'organization_id', 'user_id', 'role', 'admin', NULL, NULL, NULL, NULL, 11),
  ('ORG_MEMBER', 'ORG', 'Organisation Member', '{"th":"สมาชิกองค์กร","en":"Organisation Member"}', 'table', 'members', 'organization_id', 'user_id', 'role', 'member', NULL, NULL, NULL, NULL, 12),
  ('FOLLOWER_EVENT', 'EVENT', 'Event Follower', '{"th":"ผู้ติดตาม (อีเวนต์)","en":"Event Follower"}', 'table', 'subscriptions', 'object_id', 'user_id', 'object_type_code', 'EVENT', NULL, NULL, NULL, NULL, 13),
  ('PLATFORM_ADMIN', 'PLATFORM', 'Platform Admin', '{"th":"ผู้ดูแลแพลตฟอร์ม","en":"Platform Admin"}', 'role', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'ADMIN', 14),
  ('ANY_ORGANIZER', 'PLATFORM', 'Any Organizer', '{"th":"ผู้จัดการแข่งขันใดๆ","en":"Any Organizer"}', 'role', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'ORGANIZER', 15),
  ('ANY_COACH', 'PLATFORM', 'Any Coach', '{"th":"โค้ชใดๆ","en":"Any Coach"}', 'role', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'COACH', 16),
  ('ANY_PLAYER', 'PLATFORM', 'Any Player', '{"th":"ผู้เล่นใดๆ","en":"Any Player"}', 'role', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'PLAYER', 17),
  ('ANY_REFEREE', 'PLATFORM', 'Any Referee', '{"th":"ผู้ตัดสินใดๆ","en":"Any Referee"}', 'role', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'REFEREE', 18),
  ('ANY_SPECTATOR', 'PLATFORM', 'Any Spectator', '{"th":"ผู้ชมใดๆ","en":"Any Spectator"}', 'role', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'SPECTATOR', 19),
  ('ANY_SIGNED_IN', 'PLATFORM', 'Any Signed-in User', '{"th":"ผู้ที่เข้าสู่ระบบใดๆ","en":"Any Signed-in User"}', 'everyone', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 20),
  ('PUBLIC', 'PLATFORM', 'Public', '{"th":"สาธารณะ","en":"Public"}', 'everyone', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 21);

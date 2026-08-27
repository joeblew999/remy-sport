// The Product Owner's model, as data.
//
// AUTHORED HERE. This is the source — there is no JSONL behind it any more.
// remy-sport copies this file verbatim; it does not transform it, because every
// transform is a place for the two to disagree, and that is where every silent
// bug lived when this was generated: a `full_names` key drizzle spells
// `fullNames`, a NOT NULL pivot column omitted, a type inferred from a sample
// value.
//
// What proves this agrees with the database is the seed itself:
// `db.insert(city).values(CITY)` does not compile if a field and a column
// disagree. The schema is authored in remy-sport/src/db/, and everything above
// it derives from there — zod row schemas, the oRPC contract, the React types.

import type { Names } from "./names"

export const ALL_LOCALES = ["th", "en", "ja"] as const

/**
 * The languages a reader is offered.
 *
 * Drafts are declared and compiled in so they can be exercised, but showing a
 * reader a half-translated interface is worse than showing them English. A
 * language moves here by one word changing in the PO's locales.jsonl.
 */
export const LOCALES = ["th", "en"] as const

export type Locale = (typeof ALL_LOCALES)[number]

/** A language actually on offer. Narrower than `Locale`. */
export type ReleasedLocale = (typeof LOCALES)[number]

/** 5 rows, from object_types.jsonl. */
export const OBJECT_TYPE = [
  { code: "EVENT", tableName: "events", names: {"th":"อีเวนต์","en":"Event"}, descriptions: {"th":"ทัวร์นาเมนต์ ลีก ค่ายฝึก และกิจกรรมแสดงผลงาน โดยประเภทย่อยอยู่ใน events.type_code","en":"Tournaments leagues camps showcases — subtype lives in events.type_code"} },
  { code: "TEAM", tableName: "teams", names: {"th":"ทีม","en":"Team"}, descriptions: {"th":"โปรไฟล์ทีมและรายชื่อผู้เล่น","en":"Team profile and roster"} },
  { code: "PLAYER", tableName: "players", names: {"th":"ผู้เล่น","en":"Player"}, descriptions: {"th":"โปรไฟล์ผู้เล่นรายบุคคล","en":"Individual player profile"} },
  { code: "ORG", tableName: "organizations", names: {"th":"องค์กร","en":"Organisation"}, descriptions: {"th":"โรงเรียน สโมสร และสหพันธ์","en":"Schools clubs federations"} },
  { code: "PLATFORM", tableName: null, names: {"th":"แพลตฟอร์ม","en":"Platform"}, descriptions: {"th":"การดำเนินการทั่วทั้งระบบที่ไม่ผูกกับออบเจ็กต์ใดโดยเฉพาะ","en":"Global actions not tied to a specific object"} },
] as const

export const OBJECT_TYPE_CODES = OBJECT_TYPE.map((t) => t.code) as unknown as [
  "EVENT",
  "TEAM",
  "PLAYER",
  "ORG",
  "PLATFORM",
]

export type ObjectTypeCode = (typeof OBJECT_TYPE_CODES)[number]

/** 73 rows, from actions.jsonl. */
export const ACTION = [
  { code: "SIGN_IN_OUT", objectTypeCode: "PLATFORM", category: "Auth", names: {"th":"ลงชื่อเข้า / ออก","en":"Sign in / Sign out"} },
  { code: "SIGN_UP_AS_SPECTATOR", objectTypeCode: "PLATFORM", category: "Auth", names: {"th":"สมัครเป็นผู้ชม","en":"Sign up as Spectator"} },
  { code: "SIGN_UP_AS_PLAYER", objectTypeCode: "PLATFORM", category: "Auth", names: {"th":"สมัครเป็นผู้เล่น (ผู้ใหญ่)","en":"Sign up as Player (adult)"} },
  { code: "SIGN_UP_AS_COACH", objectTypeCode: "PLATFORM", category: "Auth", names: {"th":"สมัครเป็นโค้ช","en":"Sign up as Coach"} },
  { code: "SIGN_UP_AS_ORGANIZER", objectTypeCode: "PLATFORM", category: "Auth", names: {"th":"สมัครเป็นผู้จัดการแข่งขัน","en":"Sign up as Organizer"} },
  { code: "SIGN_UP_PLAYER_AS_GUARDIAN", objectTypeCode: "PLATFORM", category: "Auth", names: {"th":"สมัครผู้เล่น (เด็กในความดูแล)","en":"Sign up minor Player as Guardian"} },
  { code: "SIGN_UP_AS_REFEREE_REQUEST", objectTypeCode: "PLATFORM", category: "Auth", names: {"th":"ส่งคำขอสมัครเป็นผู้ตัดสิน","en":"Submit Referee signup request"} },
  { code: "APPROVE_REFEREE", objectTypeCode: "PLATFORM", category: "Admin", names: {"th":"อนุมัติผู้ตัดสิน","en":"Approve pending Referee account"} },
  { code: "CREATE_USER_ACCOUNT", objectTypeCode: "PLATFORM", category: "Admin", names: {"th":"สร้างบัญชีผู้ใช้ (ใดๆ)","en":"Create any user account (admin-only minting)"} },
  { code: "INVITE_CO_ORGANIZER", objectTypeCode: "EVENT", category: "Events", names: {"th":"เชิญผู้ร่วมจัด","en":"Invite Co-organizer to event"} },
  { code: "ACCEPT_CO_ORGANIZER_INVITE", objectTypeCode: "EVENT", category: "Events", names: {"th":"ตอบรับเป็นผู้ร่วมจัด","en":"Accept Co-organizer invite"} },
  { code: "INSTALL_APP", objectTypeCode: "PLATFORM", category: "Live", names: {"th":"ติดตั้งแอป (PWA)","en":"Install app (PWA)"} },
  { code: "MANAGE_ALL_USERS", objectTypeCode: "PLATFORM", category: "Admin", names: {"th":"จัดการผู้ใช้ทั้งหมด","en":"Manage all users"} },
  { code: "MODERATE_LISTINGS", objectTypeCode: "PLATFORM", category: "Admin", names: {"th":"ตรวจสอบและจัดการรายการ","en":"Moderate listings"} },
  { code: "BROWSE_EVENTS", objectTypeCode: "PLATFORM", category: "Events", names: {"th":"เรียกดูอีเวนต์","en":"Browse events (list)"} },
  { code: "BROWSE_TEAMS", objectTypeCode: "PLATFORM", category: "Teams", names: {"th":"ค้นหาทีม","en":"Browse / find a team"} },
  { code: "CREATE_EVENT", objectTypeCode: "PLATFORM", category: "Events", names: {"th":"สร้างอีเวนต์","en":"Create event"} },
  { code: "VIEW_EVENT", objectTypeCode: "EVENT", category: "Events", names: {"th":"ดูอีเวนต์","en":"View event detail"} },
  { code: "EDIT_EVENT", objectTypeCode: "EVENT", category: "Events", names: {"th":"แก้ไขอีเวนต์","en":"Edit event"} },
  { code: "DELETE_EVENT", objectTypeCode: "EVENT", category: "Events", names: {"th":"ลบอีเวนต์","en":"Delete event"} },
  { code: "MANAGE_DIVISIONS", objectTypeCode: "EVENT", category: "Events", names: {"th":"จัดการดิวิชั่น","en":"Manage event divisions"} },
  { code: "REGISTER_TEAM_FOR_EVENT", objectTypeCode: "EVENT", category: "Events", names: {"th":"ลงทะเบียนทีมเข้าอีเวนต์","en":"Register team for event"} },
  { code: "REGISTER_PLAYER_FOR_EVENT", objectTypeCode: "EVENT", category: "Events", names: {"th":"ลงทะเบียนผู้เล่นเข้าอีเวนต์","en":"Register player for event"} },
  { code: "CREATE_TEAM", objectTypeCode: "PLATFORM", category: "Teams", names: {"th":"สร้างทีม","en":"Create team"} },
  { code: "VIEW_TEAM", objectTypeCode: "TEAM", category: "Teams", names: {"th":"ดูโปรไฟล์ทีม","en":"View team profile"} },
  { code: "EDIT_TEAM_PROFILE", objectTypeCode: "TEAM", category: "Teams", names: {"th":"แก้ไขโปรไฟล์ทีม","en":"Edit team profile"} },
  { code: "DELETE_TEAM", objectTypeCode: "TEAM", category: "Teams", names: {"th":"ลบทีม","en":"Delete team"} },
  { code: "MANAGE_ROSTER", objectTypeCode: "TEAM", category: "Teams", names: {"th":"จัดการรายชื่อผู้เล่น","en":"Manage team roster"} },
  { code: "CREATE_PLAYER", objectTypeCode: "PLATFORM", category: "Players", names: {"th":"สร้างโปรไฟล์ผู้เล่น","en":"Create player profile"} },
  { code: "VIEW_PLAYER", objectTypeCode: "PLAYER", category: "Players", names: {"th":"ดูโปรไฟล์ผู้เล่น","en":"View player profile"} },
  { code: "EDIT_PLAYER_PROFILE", objectTypeCode: "PLAYER", category: "Players", names: {"th":"แก้ไขโปรไฟล์ผู้เล่น","en":"Edit player profile"} },
  { code: "DELETE_PLAYER", objectTypeCode: "PLAYER", category: "Players", names: {"th":"ลบโปรไฟล์ผู้เล่น","en":"Delete player profile"} },
  { code: "VIEW_PLAYER_STATS", objectTypeCode: "PLAYER", category: "Rankings", names: {"th":"ดูสถิติผู้เล่น","en":"View player stats"} },
  { code: "FOLLOW_PLAYER", objectTypeCode: "PLAYER", category: "Players", names: {"th":"ติดตามผู้เล่น","en":"Follow player"} },
  { code: "UNFOLLOW_PLAYER", objectTypeCode: "PLAYER", category: "Players", names: {"th":"เลิกติดตามผู้เล่น","en":"Unfollow player"} },
  { code: "RECEIVE_PLAYER_NOTIFICATIONS", objectTypeCode: "PLAYER", category: "Live", names: {"th":"รับการแจ้งเตือนผู้เล่น","en":"Receive player notifications"} },
  { code: "FOLLOW_TEAM", objectTypeCode: "TEAM", category: "Teams", names: {"th":"ติดตามทีม","en":"Follow team"} },
  { code: "UNFOLLOW_TEAM", objectTypeCode: "TEAM", category: "Teams", names: {"th":"เลิกติดตามทีม","en":"Unfollow team"} },
  { code: "RECEIVE_TEAM_NOTIFICATIONS", objectTypeCode: "TEAM", category: "Live", names: {"th":"รับการแจ้งเตือนทีม","en":"Receive team notifications"} },
  { code: "FOLLOW_EVENT", objectTypeCode: "EVENT", category: "Events", names: {"th":"ติดตามอีเวนต์","en":"Follow event"} },
  { code: "UNFOLLOW_EVENT", objectTypeCode: "EVENT", category: "Events", names: {"th":"เลิกติดตามอีเวนต์","en":"Unfollow event"} },
  { code: "RECEIVE_EVENT_NOTIFICATIONS", objectTypeCode: "EVENT", category: "Live", names: {"th":"รับการแจ้งเตือนอีเวนต์","en":"Receive event notifications"} },
  { code: "VIEW_BRACKET", objectTypeCode: "EVENT", category: "Schedules", names: {"th":"ดูสายแข่งขัน","en":"View bracket"} },
  { code: "VIEW_FIXTURE_SCHEDULE", objectTypeCode: "EVENT", category: "Schedules", names: {"th":"ดูตารางแข่งขัน","en":"View fixture schedule"} },
  { code: "VIEW_COURT_ASSIGNMENTS", objectTypeCode: "EVENT", category: "Schedules", names: {"th":"ดูการจัดสนาม","en":"View court assignments"} },
  { code: "GENERATE_BRACKETS", objectTypeCode: "EVENT", category: "Schedules", names: {"th":"สร้างสายแข่งขัน","en":"Generate brackets"} },
  { code: "GENERATE_FIXTURES", objectTypeCode: "EVENT", category: "Schedules", names: {"th":"สร้างตารางแข่งขัน","en":"Generate fixtures"} },
  { code: "DEFINE_SESSION_SCHEDULE", objectTypeCode: "EVENT", category: "Schedules", names: {"th":"กำหนดตารางเซสชัน","en":"Define session schedule"} },
  { code: "ASSIGN_COURTS", objectTypeCode: "EVENT", category: "Schedules", names: {"th":"กำหนดสนาม","en":"Assign courts"} },
  { code: "ENTER_SCORES", objectTypeCode: "EVENT", category: "Scores", names: {"th":"บันทึกคะแนน","en":"Enter scores"} },
  { code: "CONFIRM_MATCH_STATUS", objectTypeCode: "EVENT", category: "Scores", names: {"th":"ยืนยันสถานะการแข่งขัน","en":"Confirm match status"} },
  { code: "RECORD_ATTENDANCE", objectTypeCode: "EVENT", category: "Scores", names: {"th":"บันทึกการเข้าร่วม","en":"Record attendance"} },
  { code: "VIEW_GAME_RESULTS", objectTypeCode: "EVENT", category: "Scores", names: {"th":"ดูผลการแข่งขัน","en":"View game results"} },
  { code: "VIEW_MATCH_STATUS", objectTypeCode: "EVENT", category: "Scores", names: {"th":"ดูสถานะการแข่งขัน","en":"View match status"} },
  { code: "SPOILER_MODE", objectTypeCode: "PLATFORM", category: "Scores", names: {"th":"โหมดซ่อนสปอยล์","en":"Spoiler mode preference"} },
  { code: "VIEW_RESULTS_ARCHIVE", objectTypeCode: "PLATFORM", category: "Scores", names: {"th":"ดูประวัติผลการแข่งขัน","en":"View results archive"} },
  { code: "VIEW_STANDINGS", objectTypeCode: "EVENT", category: "Rankings", names: {"th":"ดูตารางคะแนน","en":"View standings"} },
  { code: "VIEW_RANK_MOVEMENT", objectTypeCode: "EVENT", category: "Rankings", names: {"th":"ดูการเปลี่ยนอันดับ","en":"View rank movement"} },
  { code: "VIEW_RANKINGS_HISTORY", objectTypeCode: "PLATFORM", category: "Rankings", names: {"th":"ดูประวัติอันดับ","en":"View rankings history"} },
  { code: "VIEW_SEASON_RECORDS", objectTypeCode: "EVENT", category: "Rankings", names: {"th":"ดูสถิติประจำฤดูกาล","en":"View season records"} },
  { code: "VIEW_LIVE_SCORES", objectTypeCode: "EVENT", category: "Live", names: {"th":"ดูคะแนนสด","en":"View live scores"} },
  { code: "RECEIVE_NOTIFICATIONS", objectTypeCode: "PLATFORM", category: "Live", names: {"th":"รับการแจ้งเตือน","en":"Receive push notifications"} },
  { code: "MANAGE_OWN_NOTIFICATION_CHANNELS", objectTypeCode: "PLATFORM", category: "Live", names: {"th":"จัดการช่องทางการแจ้งเตือนของตัวเอง","en":"Manage own notification channels (add / remove / verify / enable / disable)"} },
  { code: "MANAGE_OWN_NOTIFICATION_PREFERENCES", objectTypeCode: "PLATFORM", category: "Live", names: {"th":"จัดการการตั้งค่าการแจ้งเตือนของตัวเอง","en":"Manage own per-type notification preferences (which type via which channel)"} },
  { code: "VIEW_LIVE_STREAM", objectTypeCode: "EVENT", category: "Live", names: {"th":"ดูถ่ายทอดสด","en":"View live stream links"} },
  { code: "VIEW_COURT_STATUS_BOARD", objectTypeCode: "EVENT", category: "Live", names: {"th":"ดูกระดานสถานะสนาม","en":"View court status board"} },
  { code: "AI_CREATE_EVENT", objectTypeCode: "PLATFORM", category: "AI", names: {"th":"สร้างอีเวนต์ผ่านแชต","en":"Create event via AI chat"} },
  { code: "AI_BRACKET_SUGGESTIONS", objectTypeCode: "EVENT", category: "AI", names: {"th":"คำแนะนำสายแข่งขัน","en":"AI bracket suggestions"} },
  { code: "AI_QA", objectTypeCode: "PLATFORM", category: "AI", names: {"th":"ถาม-ตอบ AI","en":"AI Q&A"} },
  { code: "VIEW_ORG", objectTypeCode: "ORG", category: "Organisation", names: {"th":"ดูโปรไฟล์องค์กร","en":"View organisation profile"} },
  { code: "EDIT_ORG_PROFILE", objectTypeCode: "ORG", category: "Organisation", names: {"th":"แก้ไขโปรไฟล์องค์กร","en":"Edit organisation profile"} },
  { code: "INVITE_ORG_MEMBER", objectTypeCode: "ORG", category: "Organisation", names: {"th":"เชิญสมาชิกเข้าองค์กร","en":"Invite someone to an organisation"} },
  { code: "REMOVE_ORG_MEMBER", objectTypeCode: "ORG", category: "Organisation", names: {"th":"นำสมาชิกออกจากองค์กร","en":"Remove someone from an organisation"} },
] as const

export const ACTION_CODES = ACTION.map((t) => t.code) as unknown as [
  "SIGN_IN_OUT",
  "SIGN_UP_AS_SPECTATOR",
  "SIGN_UP_AS_PLAYER",
  "SIGN_UP_AS_COACH",
  "SIGN_UP_AS_ORGANIZER",
  "SIGN_UP_PLAYER_AS_GUARDIAN",
  "SIGN_UP_AS_REFEREE_REQUEST",
  "APPROVE_REFEREE",
  "CREATE_USER_ACCOUNT",
  "INVITE_CO_ORGANIZER",
  "ACCEPT_CO_ORGANIZER_INVITE",
  "INSTALL_APP",
  "MANAGE_ALL_USERS",
  "MODERATE_LISTINGS",
  "BROWSE_EVENTS",
  "BROWSE_TEAMS",
  "CREATE_EVENT",
  "VIEW_EVENT",
  "EDIT_EVENT",
  "DELETE_EVENT",
  "MANAGE_DIVISIONS",
  "REGISTER_TEAM_FOR_EVENT",
  "REGISTER_PLAYER_FOR_EVENT",
  "CREATE_TEAM",
  "VIEW_TEAM",
  "EDIT_TEAM_PROFILE",
  "DELETE_TEAM",
  "MANAGE_ROSTER",
  "CREATE_PLAYER",
  "VIEW_PLAYER",
  "EDIT_PLAYER_PROFILE",
  "DELETE_PLAYER",
  "VIEW_PLAYER_STATS",
  "FOLLOW_PLAYER",
  "UNFOLLOW_PLAYER",
  "RECEIVE_PLAYER_NOTIFICATIONS",
  "FOLLOW_TEAM",
  "UNFOLLOW_TEAM",
  "RECEIVE_TEAM_NOTIFICATIONS",
  "FOLLOW_EVENT",
  "UNFOLLOW_EVENT",
  "RECEIVE_EVENT_NOTIFICATIONS",
  "VIEW_BRACKET",
  "VIEW_FIXTURE_SCHEDULE",
  "VIEW_COURT_ASSIGNMENTS",
  "GENERATE_BRACKETS",
  "GENERATE_FIXTURES",
  "DEFINE_SESSION_SCHEDULE",
  "ASSIGN_COURTS",
  "ENTER_SCORES",
  "CONFIRM_MATCH_STATUS",
  "RECORD_ATTENDANCE",
  "VIEW_GAME_RESULTS",
  "VIEW_MATCH_STATUS",
  "SPOILER_MODE",
  "VIEW_RESULTS_ARCHIVE",
  "VIEW_STANDINGS",
  "VIEW_RANK_MOVEMENT",
  "VIEW_RANKINGS_HISTORY",
  "VIEW_SEASON_RECORDS",
  "VIEW_LIVE_SCORES",
  "RECEIVE_NOTIFICATIONS",
  "MANAGE_OWN_NOTIFICATION_CHANNELS",
  "MANAGE_OWN_NOTIFICATION_PREFERENCES",
  "VIEW_LIVE_STREAM",
  "VIEW_COURT_STATUS_BOARD",
  "AI_CREATE_EVENT",
  "AI_BRACKET_SUGGESTIONS",
  "AI_QA",
  "VIEW_ORG",
  "EDIT_ORG_PROFILE",
  "INVITE_ORG_MEMBER",
  "REMOVE_ORG_MEMBER",
]

export type ActionCode = (typeof ACTION_CODES)[number]

/** 8 rows, from age_groups.jsonl. */
export const AGE_GROUP = [
  { code: "U10", minAge: null, maxAge: 10, names: {"th":"อายุไม่เกิน 10 ปี","en":"Under 10"} },
  { code: "U12", minAge: null, maxAge: 12, names: {"th":"อายุไม่เกิน 12 ปี","en":"Under 12"} },
  { code: "U14", minAge: null, maxAge: 14, names: {"th":"อายุไม่เกิน 14 ปี","en":"Under 14"} },
  { code: "U16", minAge: null, maxAge: 16, names: {"th":"อายุไม่เกิน 16 ปี","en":"Under 16"} },
  { code: "U18", minAge: null, maxAge: 18, names: {"th":"อายุไม่เกิน 18 ปี","en":"Under 18"} },
  { code: "U21", minAge: null, maxAge: 21, names: {"th":"อายุไม่เกิน 21 ปี","en":"Under 21"} },
  { code: "OPEN", minAge: null, maxAge: null, names: {"th":"เปิดอายุ","en":"Open Age"} },
  { code: "SENIOR", minAge: 30, maxAge: null, names: {"th":"อาวุโส","en":"Senior"} },
] as const

export const AGE_GROUP_CODES = AGE_GROUP.map((t) => t.code) as unknown as [
  "U10",
  "U12",
  "U14",
  "U16",
  "U18",
  "U21",
  "OPEN",
  "SENIOR",
]

export type AgeGroupCode = (typeof AGE_GROUP_CODES)[number]

/** 15 rows, from provinces.jsonl. */
export const PROVINCE = [
  { code: "BKK", names: {"th":"กรุงเทพมหานคร","en":"Bangkok"} },
  { code: "NBI", names: {"th":"นนทบุรี","en":"Nonthaburi"} },
  { code: "CMI", names: {"th":"เชียงใหม่","en":"Chiang Mai"} },
  { code: "CRI", names: {"th":"เชียงราย","en":"Chiang Rai"} },
  { code: "NMA", names: {"th":"นครราชสีมา","en":"Nakhon Ratchasima"} },
  { code: "KKN", names: {"th":"ขอนแก่น","en":"Khon Kaen"} },
  { code: "UBN", names: {"th":"อุบลราชธานี","en":"Ubon Ratchathani"} },
  { code: "UDN", names: {"th":"อุดรธานี","en":"Udon Thani"} },
  { code: "CBI", names: {"th":"ชลบุรี","en":"Chonburi"} },
  { code: "PHK", names: {"th":"ภูเก็ต","en":"Phuket"} },
  { code: "SKA", names: {"th":"สงขลา","en":"Songkhla"} },
  { code: "NST", names: {"th":"นครศรีธรรมราช","en":"Nakhon Si Thammarat"} },
  { code: "SNI", names: {"th":"สุราษฎร์ธานี","en":"Surat Thani"} },
  { code: "RBR", names: {"th":"ราชบุรี","en":"Ratchaburi"} },
  { code: "PTE", names: {"th":"ปทุมธานี","en":"Pathum Thani"} },
] as const

export const PROVINCE_CODES = PROVINCE.map((t) => t.code) as unknown as [
  "BKK",
  "NBI",
  "CMI",
  "CRI",
  "NMA",
  "KKN",
  "UBN",
  "UDN",
  "CBI",
  "PHK",
  "SKA",
  "NST",
  "SNI",
  "RBR",
  "PTE",
]

export type ProvinceCode = (typeof PROVINCE_CODES)[number]

/** 2 rows, from cities.jsonl. */
export const CITY = [
  { code: "BANGKOK", provinceCode: "BKK", names: {"th":"กรุงเทพมหานคร","en":"Bangkok"} },
  { code: "CHIANG_MAI", provinceCode: "CMI", names: {"th":"เชียงใหม่","en":"Chiang Mai"} },
] as const

export const CITY_CODES = CITY.map((t) => t.code) as unknown as [
  "BANGKOK",
  "CHIANG_MAI",
]

export type CityCode = (typeof CITY_CODES)[number]

/** 3 rows, from coach_roles.jsonl. */
export const COACH_ROLE = [
  { code: "HEAD", names: {"th":"หัวหน้าผู้ฝึกสอน","en":"Head Coach"} },
  { code: "ASSISTANT", names: {"th":"ผู้ช่วยผู้ฝึกสอน","en":"Assistant Coach"} },
  { code: "MANAGER", names: {"th":"ผู้จัดการทีม","en":"Team Manager"} },
] as const

export const COACH_ROLE_CODES = COACH_ROLE.map((t) => t.code) as unknown as [
  "HEAD",
  "ASSISTANT",
  "MANAGER",
]

export type CoachRoleCode = (typeof COACH_ROLE_CODES)[number]

/** 2 rows, from event_formats.jsonl. */
export const EVENT_FORMAT = [
  { code: "5x5", names: {"th":"5 ต่อ 5","en":"5-on-5"} },
  { code: "3x3", names: {"th":"3 ต่อ 3","en":"3x3"} },
] as const

export const EVENT_FORMAT_CODES = EVENT_FORMAT.map((t) => t.code) as unknown as [
  "5x5",
  "3x3",
]

export type EventFormatCode = (typeof EVENT_FORMAT_CODES)[number]

/** 4 rows, from event_types.jsonl. */
export const EVENT_TYPE = [
  { code: "TOURNAMENT", names: {"th":"การแข่งขันแบบทัวร์นาเมนต์","en":"Tournament"}, descriptions: {"th":"การแข่งขันแบบแบ่งสายและคัดออกจนได้ผู้ชนะที่ประกาศอย่างเป็นทางการ","en":"Bracketed competition with elimination rounds and a declared winner"} },
  { code: "LEAGUE", names: {"th":"ลีก","en":"League"}, descriptions: {"th":"ฤดูกาลแข่งขันต่อเนื่อง ทีมแข่งขันตามรอบที่กำหนดและสะสมคะแนน","en":"Recurring season — teams play scheduled rounds and accumulate points"} },
  { code: "CAMP", names: {"th":"ค่ายฝึก","en":"Camp / Clinic"}, descriptions: {"th":"กิจกรรมฝึกทักษะเพื่อพัฒนาความสามารถ ไม่ใช่การแข่งขัน","en":"Training event — skill development not competition"} },
  { code: "SHOWCASE", names: {"th":"การโชว์ผู้เล่น","en":"Showcase"}, descriptions: {"th":"กิจกรรมแสดงผลงานเพื่อสร้างโอกาสให้แมวมอง ผู้สรรหา และสื่อเห็นผู้เล่น","en":"Exhibition event for visibility — scouts recruiters media"} },
] as const

export const EVENT_TYPE_CODES = EVENT_TYPE.map((t) => t.code) as unknown as [
  "TOURNAMENT",
  "LEAGUE",
  "CAMP",
  "SHOWCASE",
]

export type EventTypeCode = (typeof EVENT_TYPE_CODES)[number]

/** 3 rows, from genders.jsonl. */
export const GENDER = [
  { code: "M", names: {"th":"ชาย","en":"Boys"} },
  { code: "F", names: {"th":"หญิง","en":"Girls"} },
  { code: "COED", names: {"th":"ผสม","en":"Co-ed"} },
] as const

export const GENDER_CODES = GENDER.map((t) => t.code) as unknown as [
  "M",
  "F",
  "COED",
]

export type GenderCode = (typeof GENDER_CODES)[number]

/** 4 rows, from guardian_types.jsonl. */
export const GUARDIAN_TYPE = [
  { code: "PARENT", names: {"th":"ผู้ปกครอง","en":"Parent"} },
  { code: "GRANDPARENT", names: {"th":"ปู่ย่าตายาย","en":"Grandparent"} },
  { code: "LEGAL_GUARDIAN", names: {"th":"ผู้ดูแล","en":"Legal Guardian"} },
  { code: "OTHER", names: {"th":"อื่นๆ","en":"Other"} },
] as const

export const GUARDIAN_TYPE_CODES = GUARDIAN_TYPE.map((t) => t.code) as unknown as [
  "PARENT",
  "GRANDPARENT",
  "LEGAL_GUARDIAN",
  "OTHER",
]

export type GuardianTypeCode = (typeof GUARDIAN_TYPE_CODES)[number]

/** 3 rows, from locales.jsonl. */
export const LOCALE = [
  { code: "th", status: "released", names: {"th":"ไทย","en":"Thai"} },
  { code: "en", status: "released", names: {"th":"อังกฤษ","en":"English"} },
  { code: "ja", status: "draft", names: {"th":"ญี่ปุ่น","en":"Japanese"} },
] as const

export const LOCALE_CODES = LOCALE.map((t) => t.code) as unknown as [
  "th",
  "en",
  "ja",
]

export type LocaleCode = (typeof LOCALE_CODES)[number]

/** 8 rows, from notification_categories.jsonl. */
export const NOTIFICATION_CATEGORY = [
  { code: "LIVE", names: {"th":"สด","en":"Live"} },
  { code: "REMINDER", names: {"th":"เตือนความจำ","en":"Reminder"} },
  { code: "DISCOVERY", names: {"th":"ค้นพบ","en":"Discovery"} },
  { code: "TEAM", names: {"th":"ทีม","en":"Team"} },
  { code: "REGISTRATION", names: {"th":"การสมัคร","en":"Registration"} },
  { code: "DIGEST", names: {"th":"สรุป","en":"Digest"} },
  { code: "ANNOUNCEMENT", names: {"th":"ประกาศ","en":"Announcement"} },
  { code: "WORKFLOW", names: {"th":"ขั้นตอนดำเนินการ","en":"Workflow"} },
] as const

export const NOTIFICATION_CATEGORY_CODES = NOTIFICATION_CATEGORY.map((t) => t.code) as unknown as [
  "LIVE",
  "REMINDER",
  "DISCOVERY",
  "TEAM",
  "REGISTRATION",
  "DIGEST",
  "ANNOUNCEMENT",
  "WORKFLOW",
]

export type NotificationCategoryCode = (typeof NOTIFICATION_CATEGORY_CODES)[number]

/** 5 rows, from notification_channels.jsonl. */
export const NOTIFICATION_CHANNEL = [
  { code: "LINE", addressFormat: "LINE personal ID or LINE Official Account user ID", names: {"th":"ไลน์","en":"LINE"}, descriptions: {"th":"ช่องทางรับส่งข้อความหลักในประเทศไทย มีการใช้งานมากกว่า 90 เปอร์เซ็นต์และมีการมีส่วนร่วมสูงสุด","en":"Dominant messaging channel in Thailand (90%+ penetration). Highest engagement."} },
  { code: "EMAIL", addressFormat: "RFC 5322 email address", names: {"th":"อีเมล","en":"Email"}, descriptions: {"th":"ใช้ได้ทั่วไปแต่มีการมีส่วนร่วมในไทยต่ำกว่า เหมาะสำหรับสรุปข้อมูลและใบเสร็จ","en":"Universal but lower engagement in Thailand. Good for digests and receipts."} },
  { code: "SMS", addressFormat: "E.164 phone number", names: {"th":"เอสเอ็มเอส","en":"SMS"}, descriptions: {"th":"ส่งถึงผู้รับได้อย่างน่าเชื่อถือ แต่มีค่าใช้จ่ายต่อข้อความ เหมาะสำหรับรหัส OTP และการแจ้งเตือนสำคัญ","en":"Reliable delivery; cost per message. Good for OTP and critical alerts."} },
  { code: "PUSH", addressFormat: "Web Push subscription token (PWA)", names: {"th":"การแจ้งเตือนแบบ Push","en":"Push"}, descriptions: {"th":"ต้องติดตั้ง PWA ไม่มีค่าใช้จ่ายเมื่อใช้งานในปริมาณมาก แต่การเข้าถึงยังจำกัดจนกว่าจะมีผู้ติดตั้งเพิ่ม","en":"Requires PWA installation. Free at scale; limited reach until adoption grows."} },
  { code: "IN_APP", addressFormat: "Internal user ID (delivered when user opens app/site)", names: {"th":"การแจ้งเตือนในแอป","en":"In-app"}, descriptions: {"th":"ใช้งานได้เสมอสำหรับผู้ที่ลงชื่อเข้าใช้ แต่จะแสดงเมื่อผู้ใช้กำลังใช้งานแอปหรือเว็บไซต์","en":"Always works for signed-in users; only seen when user is active."} },
] as const

export const NOTIFICATION_CHANNEL_CODES = NOTIFICATION_CHANNEL.map((t) => t.code) as unknown as [
  "LINE",
  "EMAIL",
  "SMS",
  "PUSH",
  "IN_APP",
]

export type NotificationChannelCode = (typeof NOTIFICATION_CHANNEL_CODES)[number]

/** 14 rows, from notification_types.jsonl. */
export const NOTIFICATION_TYPE = [
  { code: "MATCH_START", categoryCode: "LIVE", names: {"th":"เริ่มแข่งขัน","en":"Match Start"}, descriptions: {"th":"การแข่งขันกำลังจะเริ่มต้น","en":"A match is starting now"} },
  { code: "MATCH_END", categoryCode: "LIVE", names: {"th":"จบการแข่งขัน","en":"Match End"}, descriptions: {"th":"การแข่งขันจบลงแล้วและมีผลคะแนนสุดท้าย","en":"A match has ended (final score available)"} },
  { code: "SCORE_UPDATE", categoryCode: "LIVE", names: {"th":"คะแนนเปลี่ยนแปลง","en":"Score Update"}, descriptions: {"th":"คะแนนเปลี่ยนแปลงระหว่างการแข่งขันสด","en":"Score changed during a live match"} },
  { code: "EVENT_REMINDER", categoryCode: "REMINDER", names: {"th":"เตือนความจำอีเวนต์","en":"Event Reminder"}, descriptions: {"th":"อีเวนต์กำลังจะเริ่มในอีกไม่นาน ก่อนเริ่ม 24 ชั่วโมงหรือ 1 ชั่วโมง","en":"An event is starting soon (24h or 1h before)"} },
  { code: "EVENT_CREATED", categoryCode: "DISCOVERY", names: {"th":"อีเวนต์ใหม่","en":"Event Created"}, descriptions: {"th":"มีการเผยแพร่อีเวนต์ใหม่ในขอบเขตที่คุณติดตาม","en":"A new event was published in your followed scope"} },
  { code: "ROSTER_CHANGE", categoryCode: "TEAM", names: {"th":"เปลี่ยนแปลงรายชื่อผู้เล่น","en":"Roster Change"}, descriptions: {"th":"รายชื่อผู้เล่นของทีมที่คุณติดตามมีการเปลี่ยนแปลง","en":"A followed team's roster changed"} },
  { code: "REGISTRATION_OPEN", categoryCode: "REGISTRATION", names: {"th":"เปิดลงทะเบียน","en":"Registration Open"}, descriptions: {"th":"เปิดรับลงทะเบียนอีเวนต์แล้ว","en":"Event registration is now open"} },
  { code: "REGISTRATION_CLOSING", categoryCode: "REGISTRATION", names: {"th":"ปิดลงทะเบียนเร็วๆนี้","en":"Registration Closing Soon"}, descriptions: {"th":"การลงทะเบียนอีเวนต์กำลังจะปิด","en":"Event registration is about to close"} },
  { code: "DAILY_DIGEST", categoryCode: "DIGEST", names: {"th":"สรุปประจำวัน","en":"Daily Digest"}, descriptions: {"th":"สรุปกิจกรรมที่คุณติดตามประจำวัน","en":"Daily summary of activity you follow"} },
  { code: "WEEKLY_DIGEST", categoryCode: "DIGEST", names: {"th":"สรุปประจำสัปดาห์","en":"Weekly Digest"}, descriptions: {"th":"สรุปกิจกรรมที่คุณติดตามประจำสัปดาห์","en":"Weekly summary of activity you follow"} },
  { code: "ANNOUNCEMENT", categoryCode: "ANNOUNCEMENT", names: {"th":"ประกาศ","en":"Announcement"}, descriptions: {"th":"ประกาศทั่วไปจากผู้จัดการแข่งขันหรือผู้ดูแลระบบ","en":"General announcement from an organizer or admin"} },
  { code: "APPROVAL_REQUEST", categoryCode: "WORKFLOW", names: {"th":"คำขออนุมัติ","en":"Approval Request"}, descriptions: {"th":"ต้องดำเนินการโดยผู้ดูแลระบบ เช่น คำขอสมัครผู้ตัดสินที่รออนุมัติ","en":"Admin action needed (e.g. pending REFEREE signup)"} },
  { code: "APPROVAL_GRANTED", categoryCode: "WORKFLOW", names: {"th":"ได้รับอนุมัติ","en":"Approval Granted"}, descriptions: {"th":"คำขอของคุณได้รับการอนุมัติแล้ว","en":"Your request was approved"} },
  { code: "INVITATION", categoryCode: "WORKFLOW", names: {"th":"คำเชิญ","en":"Invitation"}, descriptions: {"th":"คุณได้รับคำเชิญ เช่น คำเชิญเป็นผู้ร่วมจัด","en":"You were invited (co-organizer etc)"} },
] as const

export const NOTIFICATION_TYPE_CODES = NOTIFICATION_TYPE.map((t) => t.code) as unknown as [
  "MATCH_START",
  "MATCH_END",
  "SCORE_UPDATE",
  "EVENT_REMINDER",
  "EVENT_CREATED",
  "ROSTER_CHANGE",
  "REGISTRATION_OPEN",
  "REGISTRATION_CLOSING",
  "DAILY_DIGEST",
  "WEEKLY_DIGEST",
  "ANNOUNCEMENT",
  "APPROVAL_REQUEST",
  "APPROVAL_GRANTED",
  "INVITATION",
]

export type NotificationTypeCode = (typeof NOTIFICATION_TYPE_CODES)[number]

/** 3 rows, from org_roles.jsonl. */
export const ORG_ROLE = [
  { code: "OWNER", names: {"th":"เจ้าขององค์กร","en":"Organisation Owner"} },
  { code: "ADMIN", names: {"th":"ผู้ดูแลองค์กร","en":"Organisation Admin"} },
  { code: "MEMBER", names: {"th":"สมาชิกองค์กร","en":"Organisation Member"} },
] as const

export const ORG_ROLE_CODES = ORG_ROLE.map((t) => t.code) as unknown as [
  "OWNER",
  "ADMIN",
  "MEMBER",
]

export type OrgRoleCode = (typeof ORG_ROLE_CODES)[number]

/** 4 rows, from org_types.jsonl. */
export const ORG_TYPE = [
  { code: "SCHOOL", names: {"th":"โรงเรียน","en":"School"} },
  { code: "CLUB", names: {"th":"สโมสร","en":"Club"} },
  { code: "FEDERATION", names: {"th":"สหพันธ์","en":"Federation"} },
  { code: "GRASSROOTS", names: {"th":"ชุมชนรากหญ้า","en":"Grassroots"} },
] as const

export const ORG_TYPE_CODES = ORG_TYPE.map((t) => t.code) as unknown as [
  "SCHOOL",
  "CLUB",
  "FEDERATION",
  "GRASSROOTS",
]

export type OrgTypeCode = (typeof ORG_TYPE_CODES)[number]

/** 5 rows, from positions.jsonl. */
export const POSITION = [
  { code: "PG", names: {"th":"พอยต์การ์ด","en":"PG"}, full_names: {"th":"พอยต์การ์ด","en":"Point Guard"} },
  { code: "SG", names: {"th":"ชู้ตติ้งการ์ด","en":"SG"}, full_names: {"th":"ชู้ตติ้งการ์ด","en":"Shooting Guard"} },
  { code: "SF", names: {"th":"สมอลล์ฟอร์เวิร์ด","en":"SF"}, full_names: {"th":"สมอลล์ฟอร์เวิร์ด","en":"Small Forward"} },
  { code: "PF", names: {"th":"พาวเวอร์ฟอร์เวิร์ด","en":"PF"}, full_names: {"th":"พาวเวอร์ฟอร์เวิร์ด","en":"Power Forward"} },
  { code: "C", names: {"th":"เซ็นเตอร์","en":"C"}, full_names: {"th":"เซ็นเตอร์","en":"Center"} },
] as const

export const POSITION_CODES = POSITION.map((t) => t.code) as unknown as [
  "PG",
  "SG",
  "SF",
  "PF",
  "C",
]

export type PositionCode = (typeof POSITION_CODES)[number]

/** 6 rows, from roles.jsonl. */
export const ROLE = [
  { code: "ADMIN", names: {"th":"ผู้ดูแลระบบ","en":"Admin"}, descriptions: {"th":"เจ้าหน้าที่ภายในที่ดูแลแพลตฟอร์มและมีสิทธิ์เขียนข้อมูลทั้งหมด","en":"Internal staff managing the platform — full write access across all data"} },
  { code: "ORGANIZER", names: {"th":"ผู้จัดการแข่งขัน","en":"Organizer"}, descriptions: {"th":"สร้างและจัดทัวร์นาเมนต์ ลีก ค่ายฝึก และกิจกรรมแสดงผลงาน","en":"Creates and runs tournaments leagues camps showcases"} },
  { code: "COACH", names: {"th":"โค้ช","en":"Coach"}, descriptions: {"th":"จัดการทีม การลงทะเบียนรายชื่อผู้เล่น และการบันทึกการเข้าร่วม","en":"Manages a team — roster registration attendance"} },
  { code: "PLAYER", names: {"th":"ผู้เล่น","en":"Player"}, descriptions: {"th":"นักกีฬารายบุคคลที่จัดการโปรไฟล์ การลงทะเบียน และสถิติของตนเอง","en":"Individual athlete — own profile registrations stats"} },
  { code: "SPECTATOR", names: {"th":"ผู้ชม","en":"Spectator"}, descriptions: {"th":"ผู้ติดตามที่อ่านข้อมูลได้อย่างเดียว เช่น ผู้ปกครอง แฟนกีฬา และผู้ชมทั่วไป","en":"Read-only follower — parents fans casual viewers"} },
  { code: "REFEREE", names: {"th":"ผู้ตัดสิน","en":"Referee"}, descriptions: {"th":"เจ้าหน้าที่ผู้ได้รับการรับรองที่บันทึกคะแนนและสถานะการแข่งขัน","en":"Certified official — score entry match status"} },
] as const

export const ROLE_CODES = ROLE.map((t) => t.code) as unknown as [
  "ADMIN",
  "ORGANIZER",
  "COACH",
  "PLAYER",
  "SPECTATOR",
  "REFEREE",
]

export type RoleCode = (typeof ROLE_CODES)[number]

/** 22 rows, from relations.jsonl. */
export const RELATION = [
  { code: "OWNER", objectTypeCode: "EVENT", via: "table", sourceTable: "events", objectColumn: "id", userColumn: "organizer_user_id", filterColumn: null, filterValue: null, throughTable: null, throughColumn: null, activeToColumn: null, roleCode: null, names: {"th":"เจ้าของ","en":"Owner"} },
  { code: "CO_ORGANIZER", objectTypeCode: "EVENT", via: "table", sourceTable: "event_co_organizers", objectColumn: "event_id", userColumn: "user_id", filterColumn: null, filterValue: null, throughTable: null, throughColumn: null, activeToColumn: null, roleCode: null, names: {"th":"ผู้ร่วมจัด","en":"Co-organizer"} },
  { code: "HEAD_COACH", objectTypeCode: "TEAM", via: "table", sourceTable: "team_coaches", objectColumn: "team_id", userColumn: "user_id", filterColumn: "coach_role_code", filterValue: "HEAD", throughTable: null, throughColumn: null, activeToColumn: null, roleCode: null, names: {"th":"หัวหน้าผู้ฝึกสอน","en":"Head Coach"} },
  { code: "ASSISTANT_COACH", objectTypeCode: "TEAM", via: "table", sourceTable: "team_coaches", objectColumn: "team_id", userColumn: "user_id", filterColumn: "coach_role_code", filterValue: "ASSISTANT", throughTable: null, throughColumn: null, activeToColumn: null, roleCode: null, names: {"th":"ผู้ช่วยผู้ฝึกสอน","en":"Assistant Coach"} },
  { code: "TEAM_MANAGER", objectTypeCode: "TEAM", via: "table", sourceTable: "team_coaches", objectColumn: "team_id", userColumn: "user_id", filterColumn: "coach_role_code", filterValue: "MANAGER", throughTable: null, throughColumn: null, activeToColumn: null, roleCode: null, names: {"th":"ผู้จัดการทีม","en":"Team Manager"} },
  { code: "TEAM_PLAYER", objectTypeCode: "TEAM", via: "table", sourceTable: "player_teams", objectColumn: "team_id", userColumn: "user_id", filterColumn: null, filterValue: null, throughTable: "players", throughColumn: "player_id", activeToColumn: "to_date", roleCode: null, names: {"th":"ผู้เล่นในทีม","en":"Team Player"} },
  { code: "SELF", objectTypeCode: "PLAYER", via: "table", sourceTable: "players", objectColumn: "id", userColumn: "user_id", filterColumn: null, filterValue: null, throughTable: null, throughColumn: null, activeToColumn: null, roleCode: null, names: {"th":"ตัวเอง","en":"Self"} },
  { code: "GUARDIAN", objectTypeCode: "PLAYER", via: "table", sourceTable: "guardians", objectColumn: "player_id", userColumn: "user_id", filterColumn: null, filterValue: null, throughTable: null, throughColumn: null, activeToColumn: null, roleCode: null, names: {"th":"ผู้ปกครอง","en":"Guardian"} },
  { code: "FOLLOWER_PLAYER", objectTypeCode: "PLAYER", via: "table", sourceTable: "subscriptions", objectColumn: "object_id", userColumn: "user_id", filterColumn: "object_type_code", filterValue: "PLAYER", throughTable: null, throughColumn: null, activeToColumn: null, roleCode: null, names: {"th":"ผู้ติดตาม (ผู้เล่น)","en":"Player Follower"} },
  { code: "FOLLOWER_TEAM", objectTypeCode: "TEAM", via: "table", sourceTable: "subscriptions", objectColumn: "object_id", userColumn: "user_id", filterColumn: "object_type_code", filterValue: "TEAM", throughTable: null, throughColumn: null, activeToColumn: null, roleCode: null, names: {"th":"ผู้ติดตาม (ทีม)","en":"Team Follower"} },
  { code: "ORG_OWNER", objectTypeCode: "ORG", via: "table", sourceTable: "members", objectColumn: "organization_id", userColumn: "user_id", filterColumn: "role", filterValue: "owner", throughTable: null, throughColumn: null, activeToColumn: null, roleCode: null, names: {"th":"เจ้าขององค์กร","en":"Organisation Owner"} },
  { code: "ORG_ADMIN", objectTypeCode: "ORG", via: "table", sourceTable: "members", objectColumn: "organization_id", userColumn: "user_id", filterColumn: "role", filterValue: "admin", throughTable: null, throughColumn: null, activeToColumn: null, roleCode: null, names: {"th":"ผู้ดูแลองค์กร","en":"Organisation Admin"} },
  { code: "ORG_MEMBER", objectTypeCode: "ORG", via: "table", sourceTable: "members", objectColumn: "organization_id", userColumn: "user_id", filterColumn: "role", filterValue: "member", throughTable: null, throughColumn: null, activeToColumn: null, roleCode: null, names: {"th":"สมาชิกองค์กร","en":"Organisation Member"} },
  { code: "FOLLOWER_EVENT", objectTypeCode: "EVENT", via: "table", sourceTable: "subscriptions", objectColumn: "object_id", userColumn: "user_id", filterColumn: "object_type_code", filterValue: "EVENT", throughTable: null, throughColumn: null, activeToColumn: null, roleCode: null, names: {"th":"ผู้ติดตาม (อีเวนต์)","en":"Event Follower"} },
  { code: "PLATFORM_ADMIN", objectTypeCode: "PLATFORM", via: "role", sourceTable: null, objectColumn: null, userColumn: null, filterColumn: null, filterValue: null, throughTable: null, throughColumn: null, activeToColumn: null, roleCode: "ADMIN", names: {"th":"ผู้ดูแลแพลตฟอร์ม","en":"Platform Admin"} },
  { code: "ANY_ORGANIZER", objectTypeCode: "PLATFORM", via: "role", sourceTable: null, objectColumn: null, userColumn: null, filterColumn: null, filterValue: null, throughTable: null, throughColumn: null, activeToColumn: null, roleCode: "ORGANIZER", names: {"th":"ผู้จัดการแข่งขันใดๆ","en":"Any Organizer"} },
  { code: "ANY_COACH", objectTypeCode: "PLATFORM", via: "role", sourceTable: null, objectColumn: null, userColumn: null, filterColumn: null, filterValue: null, throughTable: null, throughColumn: null, activeToColumn: null, roleCode: "COACH", names: {"th":"โค้ชใดๆ","en":"Any Coach"} },
  { code: "ANY_PLAYER", objectTypeCode: "PLATFORM", via: "role", sourceTable: null, objectColumn: null, userColumn: null, filterColumn: null, filterValue: null, throughTable: null, throughColumn: null, activeToColumn: null, roleCode: "PLAYER", names: {"th":"ผู้เล่นใดๆ","en":"Any Player"} },
  { code: "ANY_REFEREE", objectTypeCode: "PLATFORM", via: "role", sourceTable: null, objectColumn: null, userColumn: null, filterColumn: null, filterValue: null, throughTable: null, throughColumn: null, activeToColumn: null, roleCode: "REFEREE", names: {"th":"ผู้ตัดสินใดๆ","en":"Any Referee"} },
  { code: "ANY_SPECTATOR", objectTypeCode: "PLATFORM", via: "role", sourceTable: null, objectColumn: null, userColumn: null, filterColumn: null, filterValue: null, throughTable: null, throughColumn: null, activeToColumn: null, roleCode: "SPECTATOR", names: {"th":"ผู้ชมใดๆ","en":"Any Spectator"} },
  { code: "ANY_SIGNED_IN", objectTypeCode: "PLATFORM", via: "everyone", sourceTable: null, objectColumn: null, userColumn: null, filterColumn: null, filterValue: null, throughTable: null, throughColumn: null, activeToColumn: null, roleCode: null, names: {"th":"ผู้ที่เข้าสู่ระบบใดๆ","en":"Any Signed-in User"} },
  { code: "PUBLIC", objectTypeCode: "PLATFORM", via: "everyone", sourceTable: null, objectColumn: null, userColumn: null, filterColumn: null, filterValue: null, throughTable: null, throughColumn: null, activeToColumn: null, roleCode: null, names: {"th":"สาธารณะ","en":"Public"} },
] as const

export const RELATION_CODES = RELATION.map((t) => t.code) as unknown as [
  "OWNER",
  "CO_ORGANIZER",
  "HEAD_COACH",
  "ASSISTANT_COACH",
  "TEAM_MANAGER",
  "TEAM_PLAYER",
  "SELF",
  "GUARDIAN",
  "FOLLOWER_PLAYER",
  "FOLLOWER_TEAM",
  "ORG_OWNER",
  "ORG_ADMIN",
  "ORG_MEMBER",
  "FOLLOWER_EVENT",
  "PLATFORM_ADMIN",
  "ANY_ORGANIZER",
  "ANY_COACH",
  "ANY_PLAYER",
  "ANY_REFEREE",
  "ANY_SPECTATOR",
  "ANY_SIGNED_IN",
  "PUBLIC",
]

export type RelationCode = (typeof RELATION_CODES)[number]

/** 1 rows, from skill_tiers.jsonl. */
export const SKILL_TIER = [
  { code: "PREMIER", names: {"th":"พรีเมียร์","en":"Premier"} },
] as const

export const SKILL_TIER_CODES = SKILL_TIER.map((t) => t.code) as unknown as [
  "PREMIER",
]

export type SkillTierCode = (typeof SKILL_TIER_CODES)[number]

/** 4 rows, from user_statuses.jsonl. */
export const USER_STATUS = [
  { code: "ACTIVE", names: {"th":"ใช้งานอยู่","en":"Active"}, descriptions: {"th":"บัญชีเปิดใช้งานเต็มรูปแบบและสามารถใช้แพลตฟอร์มได้","en":"Account is fully active and can use the platform"} },
  { code: "PENDING_APPROVAL", names: {"th":"รออนุมัติ","en":"Pending Approval"}, descriptions: {"th":"มีบัญชีแล้วแต่กำลังรอการอนุมัติจากผู้ดูแลระบบ เช่น ผู้ตัดสินที่รอการตรวจสอบการรับรอง BAT","en":"Account exists but is waiting for admin approval (e.g. REFEREE awaiting BAT certification verification)"} },
  { code: "SUSPENDED", names: {"th":"ระงับชั่วคราว","en":"Suspended"}, descriptions: {"th":"บัญชีถูกระงับชั่วคราวโดยผู้ดูแลระบบ","en":"Account is temporarily suspended by admin"} },
  { code: "DEACTIVATED", names: {"th":"ปิดใช้งาน","en":"Deactivated"}, descriptions: {"th":"บัญชีถูกปิดใช้งานถาวร","en":"Account is permanently deactivated"} },
] as const

export const USER_STATUS_CODES = USER_STATUS.map((t) => t.code) as unknown as [
  "ACTIVE",
  "PENDING_APPROVAL",
  "SUSPENDED",
  "DEACTIVATED",
]

export type UserStatusCode = (typeof USER_STATUS_CODES)[number]

/**
 * Every vocabulary, keyed as /api/reference returns it.
 *
 * The browser resolves labels from this immediately, rather than waiting for
 * the endpoint: a page that renders `CHIANG_MAI` for the time one fetch takes
 * is a page that renders a database code to a reader. The endpoint is still the
 * source at runtime — this is the same data, compiled in, so the first paint is
 * already right and a Tauri build has labels with no network at all.
 */



/**
 * Which relations grant which action — the PO's authorisation policy, compiled.
 *
 * 196 rows from data/seed/authorization/permissions.jsonl, grouped by action.
 * A user may perform an action if they hold **any** of the relations listed for
 * it. `eventTypes` narrows a grant to particular event subtypes; an empty array
 * means it applies everywhere.
 *
 * This is the file src/auth/access-control.ts used to restate by hand, in a
 * different shape and at a different granularity, with nothing checking the two
 * against each other. That is how the team write path came to ask about
 * organisation membership — a relation this model does not contain.
 */
export const GRANTS = {
  SIGN_IN_OUT: [
    { relation: "PUBLIC", eventTypes: [] },
  ],
  INSTALL_APP: [
    { relation: "PUBLIC", eventTypes: [] },
  ],
  MANAGE_ALL_USERS: [
    { relation: "PLATFORM_ADMIN", eventTypes: [] },
  ],
  MODERATE_LISTINGS: [
    { relation: "PLATFORM_ADMIN", eventTypes: [] },
  ],
  BROWSE_EVENTS: [
    { relation: "PUBLIC", eventTypes: [] },
  ],
  BROWSE_TEAMS: [
    { relation: "PUBLIC", eventTypes: [] },
  ],
  CREATE_EVENT: [
    { relation: "ANY_ORGANIZER", eventTypes: [] },
    { relation: "PLATFORM_ADMIN", eventTypes: [] },
  ],
  VIEW_EVENT: [
    { relation: "PUBLIC", eventTypes: [] },
  ],
  EDIT_EVENT: [
    { relation: "OWNER", eventTypes: [] },
    { relation: "CO_ORGANIZER", eventTypes: [] },
    { relation: "PLATFORM_ADMIN", eventTypes: [] },
  ],
  DELETE_EVENT: [
    { relation: "OWNER", eventTypes: [] },
    { relation: "PLATFORM_ADMIN", eventTypes: [] },
  ],
  MANAGE_DIVISIONS: [
    { relation: "OWNER", eventTypes: ["TOURNAMENT", "LEAGUE", "SHOWCASE"] },
    { relation: "CO_ORGANIZER", eventTypes: ["TOURNAMENT", "LEAGUE", "SHOWCASE"] },
    { relation: "PLATFORM_ADMIN", eventTypes: ["TOURNAMENT", "LEAGUE", "SHOWCASE"] },
  ],
  REGISTER_TEAM_FOR_EVENT: [
    { relation: "HEAD_COACH", eventTypes: ["TOURNAMENT", "LEAGUE", "SHOWCASE"] },
    { relation: "TEAM_MANAGER", eventTypes: ["TOURNAMENT", "LEAGUE", "SHOWCASE"] },
    { relation: "PLATFORM_ADMIN", eventTypes: ["TOURNAMENT", "LEAGUE", "SHOWCASE"] },
  ],
  REGISTER_PLAYER_FOR_EVENT: [
    { relation: "SELF", eventTypes: ["CAMP", "SHOWCASE"] },
    { relation: "GUARDIAN", eventTypes: ["CAMP", "SHOWCASE"] },
    { relation: "PLATFORM_ADMIN", eventTypes: ["CAMP", "SHOWCASE"] },
  ],
  CREATE_TEAM: [
    { relation: "ANY_COACH", eventTypes: [] },
    { relation: "PLATFORM_ADMIN", eventTypes: [] },
  ],
  VIEW_TEAM: [
    { relation: "PUBLIC", eventTypes: [] },
  ],
  EDIT_TEAM_PROFILE: [
    { relation: "HEAD_COACH", eventTypes: [] },
    { relation: "TEAM_MANAGER", eventTypes: [] },
    { relation: "PLATFORM_ADMIN", eventTypes: [] },
  ],
  DELETE_TEAM: [
    { relation: "PLATFORM_ADMIN", eventTypes: [] },
  ],
  MANAGE_ROSTER: [
    { relation: "HEAD_COACH", eventTypes: [] },
    { relation: "ASSISTANT_COACH", eventTypes: [] },
    { relation: "TEAM_MANAGER", eventTypes: [] },
    { relation: "PLATFORM_ADMIN", eventTypes: [] },
  ],
  CREATE_PLAYER: [
    { relation: "ANY_COACH", eventTypes: [] },
    { relation: "ANY_PLAYER", eventTypes: [] },
    { relation: "PLATFORM_ADMIN", eventTypes: [] },
  ],
  VIEW_PLAYER: [
    { relation: "PUBLIC", eventTypes: [] },
  ],
  EDIT_PLAYER_PROFILE: [
    { relation: "SELF", eventTypes: [] },
    { relation: "GUARDIAN", eventTypes: [] },
    { relation: "HEAD_COACH", eventTypes: [] },
    { relation: "ASSISTANT_COACH", eventTypes: [] },
    { relation: "PLATFORM_ADMIN", eventTypes: [] },
  ],
  DELETE_PLAYER: [
    { relation: "PLATFORM_ADMIN", eventTypes: [] },
  ],
  VIEW_PLAYER_STATS: [
    { relation: "PUBLIC", eventTypes: [] },
  ],
  VIEW_BRACKET: [
    { relation: "PUBLIC", eventTypes: ["TOURNAMENT", "SHOWCASE"] },
  ],
  VIEW_FIXTURE_SCHEDULE: [
    { relation: "PUBLIC", eventTypes: ["TOURNAMENT", "LEAGUE"] },
  ],
  VIEW_COURT_ASSIGNMENTS: [
    { relation: "PUBLIC", eventTypes: ["TOURNAMENT", "LEAGUE", "SHOWCASE"] },
  ],
  GENERATE_BRACKETS: [
    { relation: "OWNER", eventTypes: ["TOURNAMENT", "SHOWCASE"] },
    { relation: "CO_ORGANIZER", eventTypes: ["TOURNAMENT", "SHOWCASE"] },
    { relation: "PLATFORM_ADMIN", eventTypes: ["TOURNAMENT", "SHOWCASE"] },
  ],
  GENERATE_FIXTURES: [
    { relation: "OWNER", eventTypes: ["TOURNAMENT", "LEAGUE"] },
    { relation: "CO_ORGANIZER", eventTypes: ["TOURNAMENT", "LEAGUE"] },
    { relation: "PLATFORM_ADMIN", eventTypes: ["TOURNAMENT", "LEAGUE"] },
  ],
  DEFINE_SESSION_SCHEDULE: [
    { relation: "OWNER", eventTypes: ["CAMP"] },
    { relation: "CO_ORGANIZER", eventTypes: ["CAMP"] },
    { relation: "PLATFORM_ADMIN", eventTypes: ["CAMP"] },
  ],
  ASSIGN_COURTS: [
    { relation: "OWNER", eventTypes: ["TOURNAMENT", "LEAGUE", "SHOWCASE"] },
    { relation: "CO_ORGANIZER", eventTypes: ["TOURNAMENT", "LEAGUE", "SHOWCASE"] },
    { relation: "PLATFORM_ADMIN", eventTypes: ["TOURNAMENT", "LEAGUE", "SHOWCASE"] },
  ],
  ENTER_SCORES: [
    { relation: "OWNER", eventTypes: ["TOURNAMENT", "LEAGUE", "SHOWCASE"] },
    { relation: "CO_ORGANIZER", eventTypes: ["TOURNAMENT", "LEAGUE", "SHOWCASE"] },
    { relation: "ANY_REFEREE", eventTypes: ["TOURNAMENT", "LEAGUE", "SHOWCASE"] },
    { relation: "PLATFORM_ADMIN", eventTypes: ["TOURNAMENT", "LEAGUE", "SHOWCASE"] },
  ],
  CONFIRM_MATCH_STATUS: [
    { relation: "OWNER", eventTypes: ["TOURNAMENT", "LEAGUE", "SHOWCASE"] },
    { relation: "CO_ORGANIZER", eventTypes: ["TOURNAMENT", "LEAGUE", "SHOWCASE"] },
    { relation: "ANY_REFEREE", eventTypes: ["TOURNAMENT", "LEAGUE", "SHOWCASE"] },
    { relation: "PLATFORM_ADMIN", eventTypes: ["TOURNAMENT", "LEAGUE", "SHOWCASE"] },
  ],
  RECORD_ATTENDANCE: [
    { relation: "OWNER", eventTypes: ["CAMP"] },
    { relation: "CO_ORGANIZER", eventTypes: ["CAMP"] },
    { relation: "HEAD_COACH", eventTypes: ["CAMP"] },
    { relation: "ASSISTANT_COACH", eventTypes: ["CAMP"] },
    { relation: "PLATFORM_ADMIN", eventTypes: ["CAMP"] },
  ],
  VIEW_GAME_RESULTS: [
    { relation: "PUBLIC", eventTypes: ["TOURNAMENT", "LEAGUE", "SHOWCASE"] },
  ],
  VIEW_MATCH_STATUS: [
    { relation: "PUBLIC", eventTypes: ["TOURNAMENT", "LEAGUE", "SHOWCASE"] },
  ],
  SPOILER_MODE: [
    { relation: "ANY_SIGNED_IN", eventTypes: [] },
  ],
  VIEW_RESULTS_ARCHIVE: [
    { relation: "PUBLIC", eventTypes: [] },
  ],
  VIEW_STANDINGS: [
    { relation: "PUBLIC", eventTypes: ["TOURNAMENT", "LEAGUE"] },
  ],
  VIEW_RANK_MOVEMENT: [
    { relation: "PUBLIC", eventTypes: ["TOURNAMENT", "LEAGUE"] },
  ],
  VIEW_RANKINGS_HISTORY: [
    { relation: "PUBLIC", eventTypes: [] },
  ],
  VIEW_SEASON_RECORDS: [
    { relation: "PUBLIC", eventTypes: ["LEAGUE"] },
  ],
  VIEW_LIVE_SCORES: [
    { relation: "PUBLIC", eventTypes: ["TOURNAMENT", "LEAGUE", "SHOWCASE"] },
  ],
  RECEIVE_NOTIFICATIONS: [
    { relation: "ANY_SIGNED_IN", eventTypes: [] },
  ],
  VIEW_LIVE_STREAM: [
    { relation: "PUBLIC", eventTypes: ["TOURNAMENT", "LEAGUE", "SHOWCASE"] },
  ],
  VIEW_COURT_STATUS_BOARD: [
    { relation: "PUBLIC", eventTypes: ["TOURNAMENT", "LEAGUE", "SHOWCASE"] },
  ],
  AI_CREATE_EVENT: [
    { relation: "ANY_ORGANIZER", eventTypes: [] },
    { relation: "PLATFORM_ADMIN", eventTypes: [] },
  ],
  AI_BRACKET_SUGGESTIONS: [
    { relation: "OWNER", eventTypes: ["TOURNAMENT", "SHOWCASE"] },
    { relation: "CO_ORGANIZER", eventTypes: ["TOURNAMENT", "SHOWCASE"] },
    { relation: "PLATFORM_ADMIN", eventTypes: ["TOURNAMENT", "SHOWCASE"] },
  ],
  AI_QA: [
    { relation: "PUBLIC", eventTypes: [] },
  ],
  SIGN_UP_AS_SPECTATOR: [
    { relation: "PUBLIC", eventTypes: [] },
  ],
  SIGN_UP_AS_PLAYER: [
    { relation: "PUBLIC", eventTypes: [] },
  ],
  SIGN_UP_AS_COACH: [
    { relation: "PUBLIC", eventTypes: [] },
  ],
  SIGN_UP_AS_ORGANIZER: [
    { relation: "PUBLIC", eventTypes: [] },
  ],
  SIGN_UP_PLAYER_AS_GUARDIAN: [
    { relation: "ANY_SIGNED_IN", eventTypes: [] },
  ],
  SIGN_UP_AS_REFEREE_REQUEST: [
    { relation: "PUBLIC", eventTypes: [] },
  ],
  APPROVE_REFEREE: [
    { relation: "PLATFORM_ADMIN", eventTypes: [] },
  ],
  CREATE_USER_ACCOUNT: [
    { relation: "PLATFORM_ADMIN", eventTypes: [] },
  ],
  INVITE_CO_ORGANIZER: [
    { relation: "OWNER", eventTypes: [] },
    { relation: "PLATFORM_ADMIN", eventTypes: [] },
  ],
  ACCEPT_CO_ORGANIZER_INVITE: [
    { relation: "ANY_SIGNED_IN", eventTypes: [] },
  ],
  FOLLOW_PLAYER: [
    { relation: "ANY_SIGNED_IN", eventTypes: [] },
  ],
  FOLLOW_TEAM: [
    { relation: "ANY_SIGNED_IN", eventTypes: [] },
  ],
  FOLLOW_EVENT: [
    { relation: "ANY_SIGNED_IN", eventTypes: [] },
  ],
  UNFOLLOW_PLAYER: [
    { relation: "FOLLOWER_PLAYER", eventTypes: [] },
    { relation: "PLATFORM_ADMIN", eventTypes: [] },
  ],
  UNFOLLOW_TEAM: [
    { relation: "FOLLOWER_TEAM", eventTypes: [] },
    { relation: "PLATFORM_ADMIN", eventTypes: [] },
  ],
  UNFOLLOW_EVENT: [
    { relation: "FOLLOWER_EVENT", eventTypes: [] },
    { relation: "PLATFORM_ADMIN", eventTypes: [] },
  ],
  RECEIVE_PLAYER_NOTIFICATIONS: [
    { relation: "FOLLOWER_PLAYER", eventTypes: [] },
    { relation: "GUARDIAN", eventTypes: [] },
    { relation: "SELF", eventTypes: [] },
  ],
  RECEIVE_TEAM_NOTIFICATIONS: [
    { relation: "FOLLOWER_TEAM", eventTypes: [] },
    { relation: "HEAD_COACH", eventTypes: [] },
    { relation: "ASSISTANT_COACH", eventTypes: [] },
    { relation: "TEAM_MANAGER", eventTypes: [] },
    { relation: "TEAM_PLAYER", eventTypes: [] },
  ],
  RECEIVE_EVENT_NOTIFICATIONS: [
    { relation: "FOLLOWER_EVENT", eventTypes: [] },
    { relation: "OWNER", eventTypes: [] },
    { relation: "CO_ORGANIZER", eventTypes: [] },
  ],
  MANAGE_OWN_NOTIFICATION_CHANNELS: [
    { relation: "ANY_SIGNED_IN", eventTypes: [] },
  ],
  MANAGE_OWN_NOTIFICATION_PREFERENCES: [
    { relation: "ANY_SIGNED_IN", eventTypes: [] },
  ],
  VIEW_ORG: [
    { relation: "PUBLIC", eventTypes: [] },
  ],
  EDIT_ORG_PROFILE: [
    { relation: "ORG_ADMIN", eventTypes: [] },
    { relation: "PLATFORM_ADMIN", eventTypes: [] },
    { relation: "ORG_OWNER", eventTypes: [] },
  ],
  INVITE_ORG_MEMBER: [
    { relation: "ORG_ADMIN", eventTypes: [] },
    { relation: "PLATFORM_ADMIN", eventTypes: [] },
    { relation: "ORG_OWNER", eventTypes: [] },
  ],
  REMOVE_ORG_MEMBER: [
    { relation: "ORG_ADMIN", eventTypes: [] },
    { relation: "PLATFORM_ADMIN", eventTypes: [] },
    { relation: "ORG_OWNER", eventTypes: [] },
  ],
} as const

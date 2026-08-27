// The Product Owner's people, schools, teams and events, as data.
//
// AUTHORED HERE, and copied verbatim into remy-sport. Ids are the model's own —
// `usr_admin_001`, `org_001` — and they are the ids the database uses, so a
// fixture row joins to a Better Auth user on the same column rather than through
// a bridge. Stable ids are the whole reason a re-seed is safe.

import type { Names } from "./names"

export const SEED_ENTITIES = {
  divisions: [
    {"id":"div_001","ageGroupCode":"U16","genderCode":"M","skillTierCode":null,"names":{"th":"U16 ชาย","en":"U16 Boys"}},
    {"id":"div_002","ageGroupCode":"U18","genderCode":"M","skillTierCode":null,"names":{"th":"U18 ชาย","en":"U18 Boys"}},
    {"id":"div_003","ageGroupCode":"U16","genderCode":"F","skillTierCode":null,"names":{"th":"U16 หญิง","en":"U16 Girls"}},
    {"id":"div_004","ageGroupCode":"U18","genderCode":"F","skillTierCode":null,"names":{"th":"U18 หญิง","en":"U18 Girls"}},
    {"id":"div_005","ageGroupCode":"U18","genderCode":"M","skillTierCode":"PREMIER","names":{"th":"U18 ชาย ระดับสูง","en":"U18 Boys Premier"}},
    {"id":"div_006","ageGroupCode":"U16","genderCode":"M","skillTierCode":"PREMIER","names":{"th":"U16 ชาย ระดับสูง","en":"U16 Boys Premier"}},
  ],
  events: [
    {"id":"evt_001","typeCode":"TOURNAMENT","formatCode":"5x5","organizerUserId":"usr_org_001","orgId":"org_001","startDate":"2026-06-10","endDate":"2026-06-15","cityCode":"BANGKOK","provinceCode":"BKK","isFibaCertified":false,"names":{"th":"การแข่งขัน Sponsor Thailand Basketball League 2026 รอบกรุงเทพ","en":"Sponsor Thailand Basketball League 2026 — Bangkok Round"}},
    {"id":"evt_002","typeCode":"LEAGUE","formatCode":"5x5","organizerUserId":"usr_org_002","orgId":null,"startDate":"2026-05-01","endDate":"2026-09-30","cityCode":"BANGKOK","provinceCode":"BKK","isFibaCertified":false,"names":{"th":"ลีกบาสเกตบอลโรงเรียนกรุงเทพ ฤดูกาล 2026","en":"Bangkok Schools Basketball League 2026"}},
    {"id":"evt_003","typeCode":"CAMP","formatCode":"5x5","organizerUserId":"usr_org_003","orgId":"org_003","startDate":"2026-04-15","endDate":"2026-04-19","cityCode":"CHIANG_MAI","provinceCode":"CMI","isFibaCertified":false,"names":{"th":"ค่ายฝึกบาสเกตบอลภาคฤดูร้อน เชียงใหม่ 2026","en":"Chiang Mai Summer Basketball Camp 2026"}},
    {"id":"evt_004","typeCode":"SHOWCASE","formatCode":"5x5","organizerUserId":"usr_org_001","orgId":"org_004","startDate":"2026-08-01","endDate":"2026-08-02","cityCode":"BANGKOK","provinceCode":"BKK","isFibaCertified":true,"names":{"th":"การโชว์ผู้เล่นบาสเกตบอลประเทศไทย 2026","en":"Thailand Basketball Showcase 2026"}},
  ],
  orgs: [
    {"id":"org_001","slug":"assumption-college","orgTypeCode":"SCHOOL","cityCode":"BANGKOK","provinceCode":"BKK","names":{"th":"โรงเรียนอัสสัมชัญ","en":"Assumption College"}},
    {"id":"org_002","slug":"triam-udom-suksa","orgTypeCode":"SCHOOL","cityCode":"BANGKOK","provinceCode":"BKK","names":{"th":"โรงเรียนเตรียมอุดมศึกษา","en":"Triam Udom Suksa School"}},
    {"id":"org_003","slug":"montfort-college","orgTypeCode":"SCHOOL","cityCode":"CHIANG_MAI","provinceCode":"CMI","names":{"th":"โรงเรียนมงฟอร์ตวิทยาลัย","en":"Montfort College"}},
    {"id":"org_004","slug":"basketball-sport-association-thailand","orgTypeCode":"FEDERATION","cityCode":"BANGKOK","provinceCode":"BKK","names":{"th":"สมาคมกีฬาบาสเกตบอลแห่งประเทศไทย","en":"Basketball Sport Association of Thailand"}},
    {"id":"org_005","slug":"bangkok-basketball-club","orgTypeCode":"CLUB","cityCode":"BANGKOK","provinceCode":"BKK","names":{"th":"สโมสรบาสเกตบอลกรุงเทพ","en":"Bangkok Basketball Club"}},
  ],
  players: [
    {"id":"ply_001","userId":"usr_player_001","jerseyNumber":4,"positionCode":"PG","dob":"2009-03-15","names":{"th":"ธนกร สุขใส","en":"Thanakorn Suksai"}},
    {"id":"ply_002","userId":null,"jerseyNumber":7,"positionCode":"SF","dob":"2009-08-22","names":{"th":"ภูริพัฒน์ จันทรา","en":"Phuripat Chantra"}},
    {"id":"ply_003","userId":null,"jerseyNumber":11,"positionCode":"C","dob":"2009-01-10","names":{"th":"ณัฐวุฒิ บุญรอด","en":"Nattawut Boonrod"}},
    {"id":"ply_004","userId":"usr_player_002","jerseyNumber":8,"positionCode":"SG","dob":"2008-06-30","names":{"th":"กันยา ทองดี","en":"Kanya Thongdee"}},
    {"id":"ply_005","userId":null,"jerseyNumber":14,"positionCode":"PF","dob":"2008-11-05","names":{"th":"อรอุมา ศรีทอง","en":"Onuma Srithong"}},
    {"id":"ply_006","userId":null,"jerseyNumber":5,"positionCode":"PG","dob":"2009-04-18","names":{"th":"เจษฎา ใจดี","en":"Jessada Jaidee"}},
    {"id":"ply_007","userId":null,"jerseyNumber":9,"positionCode":"SF","dob":"2009-09-12","names":{"th":"สิทธิชัย พรหมมา","en":"Sittichai Phromma"}},
  ],
  teams: [
    {"id":"team_001","orgId":"org_001","ageGroupCode":"U16","genderCode":"M","names":{"th":"ทีมบาสเกตบอลอัสสัมชัญ U16 ชาย","en":"Assumption College U16 Boys"}},
    {"id":"team_002","orgId":"org_002","ageGroupCode":"U18","genderCode":"F","names":{"th":"ทีมบาสเกตบอลเตรียมอุดมศึกษา U18 หญิง","en":"Triam Udom U18 Girls"}},
    {"id":"team_003","orgId":"org_003","ageGroupCode":"U16","genderCode":"M","names":{"th":"ทีมบาสเกตบอลมงฟอร์ต U16 ชาย","en":"Montfort U16 Boys"}},
    {"id":"team_004","orgId":"org_001","ageGroupCode":"U18","genderCode":"M","names":{"th":"ทีมบาสเกตบอลอัสสัมชัญ U18 ชาย","en":"Assumption College U18 Boys"}},
  ],
  users: [
    {"id":"usr_admin_001","roleCode":"ADMIN","statusCode":"ACTIVE","email":"admin@remysport.test","phone":"+66812340000","lineId":"remy_admin","localeCode":"en","names":{"th":"ผู้ดูแลระบบ","en":"System Admin"}},
    {"id":"usr_org_001","roleCode":"ORGANIZER","statusCode":"ACTIVE","email":"somchai.p@assumption.test","phone":"+66812340001","lineId":"somchai_ad","localeCode":"th","names":{"th":"สมชาย พัฒนสกุล","en":"Somchai Phattanasakul"}},
    {"id":"usr_org_002","roleCode":"ORGANIZER","statusCode":"ACTIVE","email":"niran.w@bsbl.test","phone":"+66812340002","lineId":"niran_bsbl","localeCode":"th","names":{"th":"นิรันดร์ วงศ์ไทย","en":"Niran Wongthai"}},
    {"id":"usr_org_003","roleCode":"ORGANIZER","statusCode":"ACTIVE","email":"apinya.k@cmcamp.test","phone":"+66812340003","lineId":"apinya_cm","localeCode":"th","names":{"th":"อภิญญา คำผา","en":"Apinya Khampha"}},
    {"id":"usr_coach_001","roleCode":"COACH","statusCode":"ACTIVE","email":"wichai.s@assumption.test","phone":"+66812340011","lineId":"coach_wichai","localeCode":"th","names":{"th":"วิชัย ศรีสุข","en":"Wichai Srisuk"}},
    {"id":"usr_coach_002","roleCode":"COACH","statusCode":"ACTIVE","email":"pranom.c@triamudom.test","phone":"+66812340012","lineId":"coach_pranom","localeCode":"th","names":{"th":"ประนอม ไชโย","en":"Pranom Chaiyo"}},
    {"id":"usr_coach_003","roleCode":"COACH","statusCode":"ACTIVE","email":"sutee.k@montfort.test","phone":"+66812340013","lineId":"coach_sutee","localeCode":"th","names":{"th":"สุธี แก้วใจ","en":"Sutee Kaewjai"}},
    {"id":"usr_player_001","roleCode":"PLAYER","statusCode":"ACTIVE","email":"thanakorn.s@example.test","phone":"+66812340021","lineId":"thanakorn_b","localeCode":"th","names":{"th":"ธนกร สุขใส","en":"Thanakorn Suksai"}},
    {"id":"usr_player_002","roleCode":"PLAYER","statusCode":"ACTIVE","email":"kanya.t@example.test","phone":"+66812340022","lineId":"kanya_g","localeCode":"th","names":{"th":"กันยา ทองดี","en":"Kanya Thongdee"}},
    {"id":"usr_spectator_001","roleCode":"SPECTATOR","statusCode":"ACTIVE","email":"pim.s@example.test","phone":"+66812340031","lineId":"pim_mom","localeCode":"th","names":{"th":"พิมพ์ สุขใส","en":"Pim Suksai"}},
    {"id":"usr_referee_001","roleCode":"REFEREE","statusCode":"ACTIVE","email":"adisorn.b@bat.test","phone":"+66812340041","lineId":"ref_adisorn","localeCode":"th","names":{"th":"อดิศร บุญชัย","en":"Adisorn Boonchai"}},
    {"id":"usr_referee_002","roleCode":"REFEREE","statusCode":"PENDING_APPROVAL","email":"waraporn.j@bat.test","phone":"+66812340042","lineId":"ref_waraporn","localeCode":"th","names":{"th":"วราภรณ์ ใจงาม","en":"Waraporn Jaingam"}},
  ],
  /**
   * Three games, in the three states that matter: played, in progress, and
   * still to come.
   *
   * Only team_001 and team_003 can meet — they are the two U16 boys' teams, and
   * a fixture between teams of different age groups or genders would be a
   * fixture nobody would ever schedule. team_003 is registered to evt_002 below
   * so the league has an opponent to field.
   *
   * gam_003 has no scores and no venue: a game that has not been played has no
   * result, and 0–0 is a result. The product already renders "Venue TBC".
   */
  games: [
    {"id":"gam_001","eventId":"evt_001","homeTeamId":"team_001","awayTeamId":"team_003","venueId":"ven_002","startsAt":"2026-06-10T10:00:00Z","statusCode":"FINISHED","homeScore":68,"awayScore":54},
    {"id":"gam_002","eventId":"evt_002","homeTeamId":"team_001","awayTeamId":"team_003","venueId":"ven_001","startsAt":"2026-08-27T13:00:00Z","statusCode":"LIVE","homeScore":41,"awayScore":38},
    {"id":"gam_003","eventId":"evt_002","homeTeamId":"team_003","awayTeamId":"team_001","venueId":null,"startsAt":"2026-09-15T10:00:00Z","statusCode":"SCHEDULED","homeScore":null,"awayScore":null},
  ],
  venues: [
    {"id":"ven_001","address":"26 Charoen Krung Rd","cityCode":"BANGKOK","provinceCode":"BKK","names":{"th":"สนามกีฬาในร่ม โรงเรียนอัสสัมชัญ","en":"Assumption College Indoor Court"}},
    {"id":"ven_002","address":"National Stadium Complex Rama I Rd","cityCode":"BANGKOK","provinceCode":"BKK","names":{"th":"สนามกีฬานิมิบุตร","en":"Nimibutr Stadium"}},
    {"id":"ven_003","address":"Mae Rim Rd","cityCode":"CHIANG_MAI","provinceCode":"CMI","names":{"th":"สนามกีฬากลาง 700 ปี","en":"700th Anniversary Sports Complex"}},
    {"id":"ven_004","address":"227 Phaya Thai Rd","cityCode":"BANGKOK","provinceCode":"BKK","names":{"th":"สนามกีฬาในร่ม โรงเรียนเตรียมอุดมศึกษา","en":"Triam Udom Indoor Court"}},
  ],
} as const

/** The join rows between them: rosters, registrations, guardians, follows. */
export const SEED_RELATIONSHIPS = {
  eventCoOrganizers: [
    {"eventId":"evt_001","userId":"usr_org_002","addedAt":"2026-04-05","statusCode":"ACCEPTED"},
  ],
  eventPlayers: [
    {"eventId":"evt_003","playerId":"ply_001","registeredAt":"2026-03-20"},
    {"eventId":"evt_003","playerId":"ply_004","registeredAt":"2026-03-22"},
    {"eventId":"evt_003","playerId":"ply_006","registeredAt":"2026-03-25"},
    {"eventId":"evt_004","playerId":"ply_001","registeredAt":"2026-07-10"},
    {"eventId":"evt_004","playerId":"ply_004","registeredAt":"2026-07-12"},
  ],
  eventTeams: [
    {"eventId":"evt_001","teamId":"team_001","divisionId":"div_001","registeredAt":"2026-04-01"},
    {"eventId":"evt_001","teamId":"team_003","divisionId":"div_001","registeredAt":"2026-04-02"},
    {"eventId":"evt_001","teamId":"team_004","divisionId":"div_002","registeredAt":"2026-04-03"},
    {"eventId":"evt_002","teamId":"team_001","divisionId":"div_001","registeredAt":"2026-04-15"},
    {"eventId":"evt_002","teamId":"team_002","divisionId":"div_004","registeredAt":"2026-04-16"},
    {"eventId":"evt_002","teamId":"team_004","divisionId":"div_002","registeredAt":"2026-04-17"},
    // The league's second U16 boys' team — without an opponent in its division,
    // team_001 would have nobody to play and the games below could not exist.
    {"eventId":"evt_002","teamId":"team_003","divisionId":"div_001","registeredAt":"2026-04-18"},
    {"eventId":"evt_004","teamId":"team_001","divisionId":"div_001","registeredAt":"2026-07-01"},
    {"eventId":"evt_004","teamId":"team_002","divisionId":"div_004","registeredAt":"2026-07-02"},
  ],
  eventVenues: [
    {"eventId":"evt_001","venueId":"ven_002","isPrimary":true},
    {"eventId":"evt_001","venueId":"ven_001","isPrimary":false},
    {"eventId":"evt_002","venueId":"ven_001","isPrimary":true},
    {"eventId":"evt_003","venueId":"ven_003","isPrimary":true},
    {"eventId":"evt_004","venueId":"ven_002","isPrimary":true},
  ],
  /**
   * Which referee is on which game.
   *
   * This is what `GAME_REFEREE` reads, and the reason it exists: `ENTER_SCORES`
   * used to be granted to `ANY_REFEREE`, the platform role, so every referee
   * could enter a score for every game in every event. Adisorn is on the two
   * Bangkok games; Waraporn has the September fixture and no others.
   */
  gameReferees: [
    {"gameId":"gam_001","userId":"usr_referee_001"},
    {"gameId":"gam_002","userId":"usr_referee_001"},
    {"gameId":"gam_003","userId":"usr_referee_002"},
  ],
  guardians: [
    {"userId":"usr_spectator_001","playerId":"ply_001","guardianTypeCode":"PARENT"},
  ],
  orgMembers: [
    {"orgId":"org_001","userId":"usr_org_001","orgRoleCode":"OWNER"},
    {"orgId":"org_001","userId":"usr_coach_001","orgRoleCode":"ADMIN"},
    {"orgId":"org_002","userId":"usr_org_002","orgRoleCode":"MEMBER"},
  ],
  playerTeams: [
    {"playerId":"ply_001","teamId":"team_001","fromDate":"2026-01-01","toDate":null},
    {"playerId":"ply_001","teamId":"team_004","fromDate":"2026-03-01","toDate":null},
    {"playerId":"ply_002","teamId":"team_001","fromDate":"2026-01-01","toDate":null},
    {"playerId":"ply_003","teamId":"team_001","fromDate":"2026-01-01","toDate":null},
    {"playerId":"ply_004","teamId":"team_002","fromDate":"2026-01-01","toDate":null},
    {"playerId":"ply_005","teamId":"team_002","fromDate":"2026-01-01","toDate":null},
    {"playerId":"ply_006","teamId":"team_003","fromDate":"2026-01-01","toDate":null},
    {"playerId":"ply_007","teamId":"team_003","fromDate":"2026-01-01","toDate":null},
  ],
  subscriptions: [
    {"userId":"usr_spectator_001","objectTypeCode":"TEAM","objectId":"team_002","subscribedAt":"2026-04-15"},
    {"userId":"usr_player_001","objectTypeCode":"TEAM","objectId":"team_002","subscribedAt":"2026-03-20"},
    {"userId":"usr_coach_001","objectTypeCode":"EVENT","objectId":"evt_001","subscribedAt":"2026-04-01"},
    {"userId":"usr_admin_001","objectTypeCode":"PLAYER","objectId":"ply_004","subscribedAt":"2026-04-10"},
  ],
  teamCoaches: [
    {"teamId":"team_001","userId":"usr_coach_001","coachRoleCode":"HEAD"},
    {"teamId":"team_001","userId":"usr_coach_002","coachRoleCode":"ASSISTANT"},
    {"teamId":"team_002","userId":"usr_coach_002","coachRoleCode":"HEAD"},
    {"teamId":"team_003","userId":"usr_coach_003","coachRoleCode":"HEAD"},
    {"teamId":"team_004","userId":"usr_coach_001","coachRoleCode":"HEAD"},
    {"teamId":"team_002","userId":"usr_coach_003","coachRoleCode":"MANAGER"},
  ],
  userNotificationChannels: [
    {"userId":"usr_admin_001","channelCode":"EMAIL","address":"admin@remysport.test","addressLabel":"primary","isEnabled":true,"verifiedAt":"2026-01-15"},
    {"userId":"usr_admin_001","channelCode":"LINE","address":"remy_admin","addressLabel":"primary","isEnabled":true,"verifiedAt":"2026-01-15"},
    {"userId":"usr_org_001","channelCode":"LINE","address":"somchai_ad","addressLabel":"primary","isEnabled":true,"verifiedAt":"2026-02-10"},
    {"userId":"usr_org_001","channelCode":"EMAIL","address":"somchai.p@assumption.test","addressLabel":"primary","isEnabled":true,"verifiedAt":"2026-02-10"},
    {"userId":"usr_coach_001","channelCode":"LINE","address":"coach_wichai","addressLabel":"primary","isEnabled":true,"verifiedAt":"2026-03-01"},
    {"userId":"usr_coach_001","channelCode":"EMAIL","address":"wichai.s@assumption.test","addressLabel":"primary","isEnabled":false,"verifiedAt":"2026-03-01"},
    {"userId":"usr_player_001","channelCode":"LINE","address":"thanakorn_b","addressLabel":"primary","isEnabled":true,"verifiedAt":"2026-03-15"},
    {"userId":"usr_player_002","channelCode":"LINE","address":"kanya_g","addressLabel":"primary","isEnabled":true,"verifiedAt":"2026-03-20"},
    {"userId":"usr_spectator_001","channelCode":"LINE","address":"pim_mom","addressLabel":"primary","isEnabled":true,"verifiedAt":"2026-04-01"},
    {"userId":"usr_spectator_001","channelCode":"LINE","address":"suksai_family_group","addressLabel":"family_group","isEnabled":true,"verifiedAt":"2026-04-05"},
    {"userId":"usr_spectator_001","channelCode":"EMAIL","address":"pim.s@example.test","addressLabel":"primary","isEnabled":true,"verifiedAt":"2026-04-01"},
    {"userId":"usr_referee_001","channelCode":"LINE","address":"ref_adisorn","addressLabel":"primary","isEnabled":true,"verifiedAt":"2026-03-10"},
    {"userId":"usr_referee_002","channelCode":"LINE","address":"ref_waraporn","addressLabel":"primary","isEnabled":true,"verifiedAt":null},
  ],
  userNotificationPreferences: [
    {"userId":"usr_spectator_001","notificationTypeCode":"SCORE_UPDATE","channelCode":"LINE","isEnabled":true},
    {"userId":"usr_spectator_001","notificationTypeCode":"SCORE_UPDATE","channelCode":"EMAIL","isEnabled":false},
    {"userId":"usr_spectator_001","notificationTypeCode":"WEEKLY_DIGEST","channelCode":"LINE","isEnabled":false},
    {"userId":"usr_spectator_001","notificationTypeCode":"WEEKLY_DIGEST","channelCode":"EMAIL","isEnabled":true},
    {"userId":"usr_coach_001","notificationTypeCode":"APPROVAL_REQUEST","channelCode":"LINE","isEnabled":true},
    {"userId":"usr_coach_001","notificationTypeCode":"ROSTER_CHANGE","channelCode":"LINE","isEnabled":true},
    {"userId":"usr_player_001","notificationTypeCode":"MATCH_START","channelCode":"LINE","isEnabled":true},
    {"userId":"usr_player_001","notificationTypeCode":"DAILY_DIGEST","channelCode":"LINE","isEnabled":false},
  ],
} as const

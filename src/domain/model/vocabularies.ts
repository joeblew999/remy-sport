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


/**
 * Every language declared, released or not.
 *
 * Ten were added on 2026-09-09 as drafts — the Product Owner's list of the most
 * spoken, adjusted for a product in Thailand and ordered by what each costs.
 * Eleven of the fifteen are free: `latin` and `latin-ext` are downloaded
 * unconditionally so a Latin-script language adds no bytes, and CJK is drawn by
 * the reader's own system font. docs/2026-09-09-15-language-picker-at-fifteen.md.
 */
export const ALL_LOCALES = ["th", "en", "ja", "zh", "es", "pt", "id", "fr", "tl", "vi", "ko", "de", "ru"] as const

/**
 * The languages a reader is offered.
 *
 * Drafts are declared and compiled in so they can be exercised, but showing a
 * reader a half-translated interface is worse than showing them English. A
 * language moves here when its messages are complete — which
 * `tests/repo/messages.test.ts` then enforces, so this list cannot run ahead of
 * the translation.
 *
 * `names` names each language in the released ones only, which caps it at
 * fifteen by three rather than fifteen by fifteen. The picker reads `endonym`
 * and needs no matrix at all.
 */
export const LOCALES = ["th", "en", "ja", "es"] as const

export type Locale = (typeof ALL_LOCALES)[number]

/** A language actually on offer. Narrower than `Locale`. */
export type ReleasedLocale = (typeof LOCALES)[number]

/** 5 rows, from object_types.jsonl. */
export const OBJECT_TYPE = [
  { code: "EVENT", tableName: "events", parentTypeCode: null, parentColumn: null, names: {"th":"อีเวนต์","en":"Event","ja":"イベント", "es":"Event"}, descriptions: {"th":"ทัวร์นาเมนต์ ลีก ค่ายฝึก และกิจกรรมแสดงผลงาน โดยประเภทย่อยอยู่ใน events.type_code","en":"Tournaments leagues camps showcases — subtype lives in events.type_code","ja":"大会・リーグ・キャンプ・ショーケース — 種別は events.type_code", "es":"Tournaments leagues camps showcases — subtype lives in events.type_code"} },
  { code: "TEAM", tableName: "teams", parentTypeCode: null, parentColumn: null, names: {"th":"ทีม","en":"Team","ja":"チーム", "es":"Equipo"}, descriptions: {"th":"โปรไฟล์ทีมและรายชื่อผู้เล่น","en":"Team profile and roster","ja":"チームのプロフィールとロースター", "es":"Team profile and roster"} },
  { code: "PLAYER", tableName: "players", parentTypeCode: null, parentColumn: null, names: {"th":"ผู้เล่น","en":"Player","ja":"選手", "es":"Jugador"}, descriptions: {"th":"โปรไฟล์ผู้เล่นรายบุคคล","en":"Individual player profile","ja":"選手個人のプロフィール", "es":"Individual player profile"} },
  { code: "MEETING", tableName: "meetings", parentTypeCode: null, parentColumn: null, names: {"th":"การประชุม","en":"Meeting","ja":"ミーティング", "es":"Reunión"}, descriptions: {"th":"การพูดคุยด้วยเสียงและวิดีโอระหว่างผู้ใช้","en":"A voice and video call between people on the platform","ja":"プラットフォーム上の人どうしの音声・ビデオ通話", "es":"A voice and video call between people on the platform"} },
  { code: "ORG", tableName: "orgs", parentTypeCode: null, parentColumn: null, names: {"th":"องค์กร","en":"Organisation","ja":"団体", "es":"Organisation"}, descriptions: {"th":"โรงเรียน สโมสร และสหพันธ์","en":"Schools clubs federations","ja":"学校・クラブ・連盟", "es":"Schools clubs federations"} },
  { code: "GAME", tableName: "games", parentTypeCode: "EVENT", parentColumn: "event_id", names: {"th":"เกม","en":"Game","ja":"試合", "es":"Game"}, descriptions: {"th":"การแข่งขันหนึ่งนัดภายในอีเวนต์ — มีสองทีม เวลา สนาม และผลการแข่งขัน","en":"One match inside an event — two teams, a time, a court and a result","ja":"イベント内の1試合 — 2チーム、時刻、コート、結果", "es":"One match inside an event — two teams, a time, a court and a result"} },
  { code: "PLATFORM", tableName: null, parentTypeCode: null, parentColumn: null, names: {"th":"แพลตฟอร์ม","en":"Platform","ja":"プラットフォーム", "es":"Platform"}, descriptions: {"th":"การดำเนินการทั่วทั้งระบบที่ไม่ผูกกับออบเจ็กต์ใดโดยเฉพาะ","en":"Global actions not tied to a specific object","ja":"特定の対象に紐づかない全体的な操作", "es":"Global actions not tied to a specific object"} },
] as const

export const OBJECT_TYPE_CODES = OBJECT_TYPE.map((t) => t.code) as unknown as [
  "EVENT",
  "TEAM",
  "PLAYER",
  "ORG",
  "GAME",
  "PLATFORM",
]

export type ObjectTypeCode = (typeof OBJECT_TYPE_CODES)[number]

/** 73 rows, from actions.jsonl. */
export const ACTION = [
  { code: "SIGN_IN_OUT", objectTypeCode: "PLATFORM", category: "Auth", names: {"th":"ลงชื่อเข้า / ออก","en":"Sign in / Sign out","ja":"ログイン / ログアウト", "es":"Iniciar o cerrar sesión"} },
  { code: "SIGN_UP_AS_SPECTATOR", objectTypeCode: "PLATFORM", category: "Auth", names: {"th":"สมัครเป็นผู้ชม","en":"Sign up as Spectator","ja":"観戦者として登録", "es":"Registrarse como espectador"} },
  { code: "SIGN_UP_AS_PLAYER", objectTypeCode: "PLATFORM", category: "Auth", names: {"th":"สมัครเป็นผู้เล่น (ผู้ใหญ่)","en":"Sign up as Player (adult)","ja":"選手として登録（成人）", "es":"Registrarse como jugador (adulto)"} },
  { code: "SIGN_UP_AS_COACH", objectTypeCode: "PLATFORM", category: "Auth", names: {"th":"สมัครเป็นโค้ช","en":"Sign up as Coach","ja":"コーチとして登録", "es":"Registrarse como entrenador"} },
  { code: "SIGN_UP_AS_ORGANIZER", objectTypeCode: "PLATFORM", category: "Auth", names: {"th":"สมัครเป็นผู้จัดการแข่งขัน","en":"Sign up as Organizer","ja":"主催者として登録", "es":"Registrarse como organizador"} },
  { code: "SIGN_UP_PLAYER_AS_GUARDIAN", objectTypeCode: "PLATFORM", category: "Auth", names: {"th":"สมัครผู้เล่น (เด็กในความดูแล)","en":"Sign up minor Player as Guardian","ja":"保護者として未成年の選手を登録", "es":"Registrar a un jugador menor como tutor"} },
  { code: "SIGN_UP_AS_REFEREE_REQUEST", objectTypeCode: "PLATFORM", category: "Auth", names: {"th":"ส่งคำขอสมัครเป็นผู้ตัดสิน","en":"Submit Referee signup request","ja":"審判登録を申請", "es":"Enviar una solicitud de alta como árbitro"} },
  { code: "APPROVE_REFEREE", objectTypeCode: "PLATFORM", category: "Admin", names: {"th":"อนุมัติผู้ตัดสิน","en":"Approve pending Referee account","ja":"審判アカウントの申請を承認", "es":"Aprobar una cuenta de árbitro pendiente"} },
  { code: "CREATE_USER_ACCOUNT", objectTypeCode: "PLATFORM", category: "Admin", names: {"th":"สร้างบัญชีผู้ใช้ (ใดๆ)","en":"Create any user account (admin-only minting)","ja":"任意のユーザーアカウントを作成（管理者のみ）", "es":"Crear cualquier cuenta de usuario (solo administradores)"} },
  { code: "INVITE_CO_ORGANIZER", objectTypeCode: "EVENT", category: "Events", names: {"th":"เชิญผู้ร่วมจัด","en":"Invite Co-organizer to event","ja":"共同主催者をイベントに招待", "es":"Invitar a un coorganizador al evento"} },
  { code: "ACCEPT_CO_ORGANIZER_INVITE", objectTypeCode: "EVENT", category: "Events", names: {"th":"ตอบรับเป็นผู้ร่วมจัด","en":"Accept Co-organizer invite","ja":"共同主催者の招待を承認", "es":"Aceptar invitación de coorganizador"} },
  { code: "INSTALL_APP", objectTypeCode: "PLATFORM", category: "Live", names: {"th":"ติดตั้งแอป (PWA)","en":"Install app (PWA)","ja":"アプリをインストール（PWA）", "es":"Instalar la aplicación (PWA)"} },
  { code: "MANAGE_ALL_USERS", objectTypeCode: "PLATFORM", category: "Admin", names: {"th":"จัดการผู้ใช้ทั้งหมด","en":"Manage all users","ja":"全ユーザーを管理", "es":"Gestionar todos los usuarios"} },
  { code: "MODERATE_LISTINGS", objectTypeCode: "PLATFORM", category: "Admin", names: {"th":"ตรวจสอบและจัดการรายการ","en":"Moderate listings","ja":"掲載内容を管理", "es":"Moderar publicaciones"} },
  { code: "BROWSE_EVENTS", objectTypeCode: "PLATFORM", category: "Events", names: {"th":"เรียกดูอีเวนต์","en":"Browse events (list)","ja":"イベントを閲覧（一覧）", "es":"Explorar eventos (lista)"} },
  { code: "BROWSE_TEAMS", objectTypeCode: "PLATFORM", category: "Teams", names: {"th":"ค้นหาทีม","en":"Browse / find a team","ja":"チームを探す", "es":"Explorar o buscar un equipo"} },
  { code: "CREATE_EVENT", objectTypeCode: "PLATFORM", category: "Events", names: {"th":"สร้างอีเวนต์","en":"Create event","ja":"イベントを作成", "es":"Crear evento"} },
  { code: "VIEW_EVENT", objectTypeCode: "EVENT", category: "Events", names: {"th":"ดูอีเวนต์","en":"View event detail","ja":"イベント詳細を表示", "es":"Ver el detalle del evento"} },
  { code: "EDIT_EVENT", objectTypeCode: "EVENT", category: "Events", names: {"th":"แก้ไขอีเวนต์","en":"Edit event","ja":"イベントを編集", "es":"Editar evento"} },
  { code: "DELETE_EVENT", objectTypeCode: "EVENT", category: "Events", names: {"th":"ลบอีเวนต์","en":"Delete event","ja":"イベントを削除", "es":"Eliminar evento"} },
  { code: "MANAGE_DIVISIONS", objectTypeCode: "EVENT", category: "Events", names: {"th":"จัดการดิวิชั่น","en":"Manage event divisions","ja":"イベントのディビジョンを管理", "es":"Gestionar las categorías del evento"} },
  { code: "REGISTER_TEAM_FOR_EVENT", objectTypeCode: "TEAM", category: "Events", names: {"th":"ลงทะเบียนทีมเข้าอีเวนต์","en":"Register team for event","ja":"チームをイベントに登録", "es":"Inscribir a un equipo en un evento"} },
  { code: "REGISTER_PLAYER_FOR_EVENT", objectTypeCode: "PLAYER", category: "Events", names: {"th":"ลงทะเบียนผู้เล่นเข้าอีเวนต์","en":"Register player for event","ja":"選手をイベントに登録", "es":"Inscribir a un jugador en un evento"} },
  { code: "CREATE_TEAM", objectTypeCode: "PLATFORM", category: "Teams", names: {"th":"สร้างทีม","en":"Create team","ja":"チームを作成", "es":"Crear equipo"} },
  { code: "VIEW_TEAM", objectTypeCode: "TEAM", category: "Teams", names: {"th":"ดูโปรไฟล์ทีม","en":"View team profile","ja":"チームのプロフィールを表示", "es":"Ver el perfil del equipo"} },
  { code: "EDIT_TEAM_PROFILE", objectTypeCode: "TEAM", category: "Teams", names: {"th":"แก้ไขโปรไฟล์ทีม","en":"Edit team profile","ja":"チームのプロフィールを編集", "es":"Editar el perfil del equipo"} },
  { code: "DELETE_TEAM", objectTypeCode: "TEAM", category: "Teams", names: {"th":"ลบทีม","en":"Delete team","ja":"チームを削除", "es":"Eliminar equipo"} },
  { code: "MANAGE_ROSTER", objectTypeCode: "TEAM", category: "Teams", names: {"th":"จัดการรายชื่อผู้เล่น","en":"Manage team roster","ja":"チームのロースターを管理", "es":"Gestionar la plantilla del equipo"} },
  { code: "CREATE_PLAYER", objectTypeCode: "PLATFORM", category: "Players", names: {"th":"สร้างโปรไฟล์ผู้เล่น","en":"Create player profile","ja":"選手プロフィールを作成", "es":"Crear ficha de jugador"} },
  { code: "VIEW_PLAYER", objectTypeCode: "PLAYER", category: "Players", names: {"th":"ดูโปรไฟล์ผู้เล่น","en":"View player profile","ja":"選手プロフィールを表示", "es":"Ver la ficha del jugador"} },
  { code: "EDIT_PLAYER_PROFILE", objectTypeCode: "PLAYER", category: "Players", names: {"th":"แก้ไขโปรไฟล์ผู้เล่น","en":"Edit player profile","ja":"選手プロフィールを編集", "es":"Editar la ficha del jugador"} },
  { code: "DELETE_PLAYER", objectTypeCode: "PLAYER", category: "Players", names: {"th":"ลบโปรไฟล์ผู้เล่น","en":"Delete player profile","ja":"選手プロフィールを削除", "es":"Eliminar ficha de jugador"} },
  { code: "VIEW_PLAYER_STATS", objectTypeCode: "PLAYER", category: "Rankings", names: {"th":"ดูสถิติผู้เล่น","en":"View player stats","ja":"選手のスタッツを表示", "es":"Ver las estadísticas del jugador"} },
  { code: "FOLLOW_PLAYER", objectTypeCode: "PLAYER", category: "Players", names: {"th":"ติดตามผู้เล่น","en":"Follow player","ja":"選手をフォロー", "es":"Seguir jugador"} },
  { code: "UNFOLLOW_PLAYER", objectTypeCode: "PLAYER", category: "Players", names: {"th":"เลิกติดตามผู้เล่น","en":"Unfollow player","ja":"選手のフォローを解除", "es":"Dejar de seguir al jugador"} },
  { code: "RECEIVE_PLAYER_NOTIFICATIONS", objectTypeCode: "PLAYER", category: "Live", names: {"th":"รับการแจ้งเตือนผู้เล่น","en":"Receive player notifications","ja":"選手の通知を受け取る", "es":"Recibir notificaciones del jugador"} },
  { code: "CREATE_MEETING", objectTypeCode: "PLATFORM", category: "Live", names: {"th":"สร้างการประชุม","en":"Create a meeting","ja":"ミーティングを作成", "es":"Crear una reunión"} },
  { code: "RESPOND_TO_MEETING_INVITE", objectTypeCode: "MEETING", category: "Live", names: {"th":"ตอบรับคำเชิญประชุม","en":"Accept or decline a meeting invitation","ja":"ミーティングの招待に応答", "es":"Aceptar o rechazar una invitación a una reunión"} },
  { code: "FOLLOW_TEAM", objectTypeCode: "TEAM", category: "Teams", names: {"th":"ติดตามทีม","en":"Follow team","ja":"チームをフォロー", "es":"Seguir equipo"} },
  { code: "UNFOLLOW_TEAM", objectTypeCode: "TEAM", category: "Teams", names: {"th":"เลิกติดตามทีม","en":"Unfollow team","ja":"チームのフォローを解除", "es":"Dejar de seguir el equipo"} },
  { code: "RECEIVE_TEAM_NOTIFICATIONS", objectTypeCode: "TEAM", category: "Live", names: {"th":"รับการแจ้งเตือนทีม","en":"Receive team notifications","ja":"チームの通知を受け取る", "es":"Recibir notificaciones del equipo"} },
  { code: "FOLLOW_EVENT", objectTypeCode: "EVENT", category: "Events", names: {"th":"ติดตามอีเวนต์","en":"Follow event","ja":"イベントをフォロー", "es":"Seguir evento"} },
  { code: "UNFOLLOW_EVENT", objectTypeCode: "EVENT", category: "Events", names: {"th":"เลิกติดตามอีเวนต์","en":"Unfollow event","ja":"イベントのフォローを解除", "es":"Dejar de seguir el evento"} },
  { code: "RECEIVE_EVENT_NOTIFICATIONS", objectTypeCode: "EVENT", category: "Live", names: {"th":"รับการแจ้งเตือนอีเวนต์","en":"Receive event notifications","ja":"イベントの通知を受け取る", "es":"Recibir notificaciones del evento"} },
  { code: "VIEW_BRACKET", objectTypeCode: "EVENT", category: "Schedules", names: {"th":"ดูสายแข่งขัน","en":"View bracket","ja":"トーナメント表を表示", "es":"Ver el cuadro"} },
  { code: "VIEW_FIXTURE_SCHEDULE", objectTypeCode: "EVENT", category: "Schedules", names: {"th":"ดูตารางแข่งขัน","en":"View fixture schedule","ja":"試合日程を表示", "es":"Ver el calendario"} },
  { code: "VIEW_COURT_ASSIGNMENTS", objectTypeCode: "EVENT", category: "Schedules", names: {"th":"ดูการจัดสนาม","en":"View court assignments","ja":"コート割当を表示", "es":"Ver las asignaciones de pista"} },
  { code: "MANAGE_FIXTURES", objectTypeCode: "EVENT", category: "Schedules", names: {"th":"จัดการตารางแข่งขัน","en":"Add, edit and remove fixtures","ja":"試合の追加・編集・削除", "es":"Añadir, editar y eliminar partidos"}, descriptions: {"th":"สร้างหรือแก้ไขการแข่งขันทีละนัด ต่างจากการสร้างอัตโนมัติทั้งตาราง","en":"Create or change one game at a time — as distinct from generating a whole schedule at once","ja":"1試合ずつ作成・変更する — 日程全体を一括生成するのとは別", "es":"Create or change one game at a time — as distinct from generating a whole schedule at once"} },
  { code: "ASSIGN_REFEREE", objectTypeCode: "GAME", category: "Schedules", names: {"th":"มอบหมายผู้ตัดสิน","en":"Assign a referee to a game","ja":"試合に審判を割り当てる", "es":"Asignar un árbitro a un partido"}, descriptions: {"th":"เลือกผู้ตัดสินสำหรับการแข่งขันนัดหนึ่ง ซึ่งเป็นสิ่งที่ทำให้การบันทึกคะแนนปลอดภัย","en":"Choose who officiates one game — the assignment that makes score entry safe","ja":"1試合の担当審判を選ぶ — スコア入力を安全にする割当", "es":"Elegir quién arbitra un partido: la designación que hace segura la introducción del resultado"} },
  { code: "GENERATE_BRACKETS", objectTypeCode: "EVENT", category: "Schedules", names: {"th":"สร้างสายแข่งขัน","en":"Generate brackets","ja":"トーナメント表を生成", "es":"Generar cuadros"} },
  { code: "GENERATE_FIXTURES", objectTypeCode: "EVENT", category: "Schedules", names: {"th":"สร้างตารางแข่งขัน","en":"Generate fixtures","ja":"試合日程を生成", "es":"Generar calendario"} },
  { code: "DEFINE_SESSION_SCHEDULE", objectTypeCode: "EVENT", category: "Schedules", names: {"th":"กำหนดตารางเซสชัน","en":"Define session schedule","ja":"セッション日程を設定", "es":"Define session schedule"} },
  { code: "ASSIGN_COURTS", objectTypeCode: "EVENT", category: "Schedules", names: {"th":"กำหนดสนาม","en":"Assign courts","ja":"コートを割り当てる", "es":"Asignar pistas"} },
  { code: "BROADCAST_GAME", objectTypeCode: "GAME", category: "Live", names: {"th":"ถ่ายทอดสดเกม","en":"Broadcast a game","ja":"試合を配信する", "es":"Retransmitir un partido"}, descriptions: {"th":"เปิดกล้องถ่ายทอดสดเกมนี้","en":"Point a camera at this game and publish it live","ja":"この試合をカメラで撮影して配信する", "es":"Apuntar una cámara a este partido y retransmitirlo en directo"} },
  { code: "ENTER_SCORES", objectTypeCode: "GAME", category: "Scores", names: {"th":"บันทึกคะแนน","en":"Enter scores","ja":"スコアを入力", "es":"Introducir resultados"} },
  { code: "CONFIRM_MATCH_STATUS", objectTypeCode: "GAME", category: "Scores", names: {"th":"ยืนยันสถานะการแข่งขัน","en":"Confirm match status","ja":"試合状況を確定", "es":"Confirmar el estado del partido"} },
  { code: "RECORD_ATTENDANCE", objectTypeCode: "EVENT", category: "Scores", names: {"th":"บันทึกการเข้าร่วม","en":"Record attendance","ja":"出席を記録", "es":"Registrar asistencia"} },
  { code: "VIEW_GAME_RESULTS", objectTypeCode: "GAME", category: "Scores", names: {"th":"ดูผลการแข่งขัน","en":"View game results","ja":"試合結果を表示", "es":"Ver los resultados"} },
  { code: "VIEW_MATCH_STATUS", objectTypeCode: "GAME", category: "Scores", names: {"th":"ดูสถานะการแข่งขัน","en":"View match status","ja":"試合状況を表示", "es":"Ver el estado del partido"} },
  { code: "SPOILER_MODE", objectTypeCode: "PLATFORM", category: "Scores", names: {"th":"โหมดซ่อนสปอยล์","en":"Spoiler mode preference","ja":"ネタバレ防止の設定", "es":"Preferencia de modo sin resultados"} },
  { code: "VIEW_RESULTS_ARCHIVE", objectTypeCode: "PLATFORM", category: "Scores", names: {"th":"ดูประวัติผลการแข่งขัน","en":"View results archive","ja":"過去の結果を表示", "es":"Ver el archivo de resultados"} },
  { code: "VIEW_STANDINGS", objectTypeCode: "EVENT", category: "Rankings", names: {"th":"ดูตารางคะแนน","en":"View standings","ja":"順位表を表示", "es":"Ver la clasificación"} },
  { code: "VIEW_RANK_MOVEMENT", objectTypeCode: "EVENT", category: "Rankings", names: {"th":"ดูการเปลี่ยนอันดับ","en":"View rank movement","ja":"順位の変動を表示", "es":"Ver el movimiento en la clasificación"} },
  { code: "VIEW_RANKINGS_HISTORY", objectTypeCode: "PLATFORM", category: "Rankings", names: {"th":"ดูประวัติอันดับ","en":"View rankings history","ja":"順位の履歴を表示", "es":"Ver el histórico de clasificaciones"} },
  { code: "VIEW_SEASON_RECORDS", objectTypeCode: "EVENT", category: "Rankings", names: {"th":"ดูสถิติประจำฤดูกาล","en":"View season records","ja":"シーズン戦績を表示", "es":"Ver los registros de la temporada"} },
  { code: "VIEW_LIVE_SCORES", objectTypeCode: "EVENT", category: "Live", names: {"th":"ดูคะแนนสด","en":"View live scores","ja":"ライブスコアを表示", "es":"Ver los resultados en directo"} },
  { code: "RECEIVE_NOTIFICATIONS", objectTypeCode: "PLATFORM", category: "Live", names: {"th":"รับการแจ้งเตือน","en":"Receive push notifications","ja":"プッシュ通知を受け取る", "es":"Recibir notificaciones push"} },
  { code: "MANAGE_OWN_NOTIFICATION_CHANNELS", objectTypeCode: "PLATFORM", category: "Live", names: {"th":"จัดการช่องทางการแจ้งเตือนของตัวเอง","en":"Manage own notification channels (add / remove / verify / enable / disable)","ja":"自分の通知チャネルを管理（追加 / 削除 / 確認 / 有効化 / 無効化）", "es":"Gestionar los propios canales de notificación (añadir, quitar, verificar, activar o desactivar)"} },
  { code: "MANAGE_OWN_NOTIFICATION_PREFERENCES", objectTypeCode: "PLATFORM", category: "Live", names: {"th":"จัดการการตั้งค่าการแจ้งเตือนของตัวเอง","en":"Manage own per-type notification preferences (which type via which channel)","ja":"通知種別ごとの設定を管理（どの種別をどのチャネルで受け取るか）", "es":"Gestionar las propias preferencias por tipo de notificación (qué tipo por qué canal)"} },
  { code: "VIEW_LIVE_STREAM", objectTypeCode: "EVENT", category: "Live", names: {"th":"ดูถ่ายทอดสด","en":"View live stream links","ja":"ライブ配信リンクを表示", "es":"Ver los enlaces de la retransmisión"} },
  { code: "VIEW_COURT_STATUS_BOARD", objectTypeCode: "EVENT", category: "Live", names: {"th":"ดูกระดานสถานะสนาม","en":"View court status board","ja":"コート状況ボードを表示", "es":"Ver el panel de estado de las pistas"} },
  { code: "AI_BRACKET_SUGGESTIONS", objectTypeCode: "EVENT", category: "AI", names: {"th":"คำแนะนำสายแข่งขัน","en":"AI bracket suggestions","ja":"AIによるトーナメント表の提案", "es":"Sugerencias de cuadro con IA"} },
  { code: "VIEW_ORG", objectTypeCode: "ORG", category: "Organisation", names: {"th":"ดูโปรไฟล์องค์กร","en":"View organisation profile","ja":"団体プロフィールを表示", "es":"Ver el perfil de la organización"} },
  { code: "EDIT_ORG_PROFILE", objectTypeCode: "ORG", category: "Organisation", names: {"th":"แก้ไขโปรไฟล์องค์กร","en":"Edit organisation profile","ja":"団体プロフィールを編集", "es":"Editar el perfil de la organización"} },
  { code: "INVITE_ORG_MEMBER", objectTypeCode: "ORG", category: "Organisation", names: {"th":"เชิญสมาชิกเข้าองค์กร","en":"Invite someone to an organisation","ja":"団体にメンバーを招待", "es":"Invitar a alguien a una organización"} },
  { code: "REMOVE_ORG_MEMBER", objectTypeCode: "ORG", category: "Organisation", names: {"th":"นำสมาชิกออกจากองค์กร","en":"Remove someone from an organisation","ja":"団体からメンバーを削除", "es":"Quitar a alguien de una organización"} },
] as const

export const ACTION_CODES = ACTION.map((t) => t.code) as unknown as [
  "BROADCAST_GAME",
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
  "MANAGE_FIXTURES",
  "ASSIGN_REFEREE",
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
  "AI_BRACKET_SUGGESTIONS",
  "VIEW_ORG",
  "EDIT_ORG_PROFILE",
  "INVITE_ORG_MEMBER",
  "REMOVE_ORG_MEMBER",
]

export type ActionCode = (typeof ACTION_CODES)[number]

/** 8 rows, from age_groups.jsonl. */
export const AGE_GROUP = [
  { code: "U10", minAge: null, maxAge: 10, names: {"th":"อายุไม่เกิน 10 ปี","en":"Under 10","ja":"10歳以下", "es":"Sub-10"} },
  { code: "U12", minAge: null, maxAge: 12, names: {"th":"อายุไม่เกิน 12 ปี","en":"Under 12","ja":"12歳以下", "es":"Sub-12"} },
  { code: "U14", minAge: null, maxAge: 14, names: {"th":"อายุไม่เกิน 14 ปี","en":"Under 14","ja":"14歳以下", "es":"Sub-14"} },
  { code: "U16", minAge: null, maxAge: 16, names: {"th":"อายุไม่เกิน 16 ปี","en":"Under 16","ja":"16歳以下", "es":"Sub-16"} },
  { code: "U18", minAge: null, maxAge: 18, names: {"th":"อายุไม่เกิน 18 ปี","en":"Under 18","ja":"18歳以下", "es":"Sub-18"} },
  { code: "U21", minAge: null, maxAge: 21, names: {"th":"อายุไม่เกิน 21 ปี","en":"Under 21","ja":"21歳以下", "es":"Sub-21"} },
  { code: "OPEN", minAge: null, maxAge: null, names: {"th":"เปิดอายุ","en":"Open Age","ja":"年齢制限なし", "es":"Absoluta"} },
  { code: "SENIOR", minAge: 30, maxAge: null, names: {"th":"อาวุโส","en":"Senior","ja":"シニア", "es":"Absoluta"} },
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

/**
 * All 77 provinces of Thailand.
 *
 * This was a curated list of 15, grown a province at a time as events turned
 * up — one research note literally reads "Nong Khai. New province in the
 * dataset." That is a rule someone has to remember, and the 66 events in
 * research/events-raw are spread across roughly 25 provinces, so the list was
 * already behind the data it exists to describe.
 *
 * Thailand's provinces are a closed official set, so the whole set is here and
 * there is no longer a rule. The first 15 keep their exact codes and strings:
 * they are referenced by seed rows and by remy-sport's database, and this is an
 * addition, not a re-spelling.
 */
export const PROVINCE = [
  { code: "BKK", names: {"th":"กรุงเทพมหานคร","en":"Bangkok","ja":"バンコク", "es":"Bangkok"} },
  { code: "NBI", names: {"th":"นนทบุรี","en":"Nonthaburi","ja":"ノンタブリー", "es":"Nonthaburi"} },
  { code: "CMI", names: {"th":"เชียงใหม่","en":"Chiang Mai","ja":"チェンマイ", "es":"Chiang Mai"} },
  { code: "CRI", names: {"th":"เชียงราย","en":"Chiang Rai","ja":"チェンライ", "es":"Chiang Rai"} },
  { code: "NMA", names: {"th":"นครราชสีมา","en":"Nakhon Ratchasima","ja":"ナコンラーチャシーマー", "es":"Nakhon Ratchasima"} },
  { code: "KKN", names: {"th":"ขอนแก่น","en":"Khon Kaen","ja":"コーンケン", "es":"Khon Kaen"} },
  { code: "UBN", names: {"th":"อุบลราชธานี","en":"Ubon Ratchathani","ja":"ウボンラーチャターニー", "es":"Ubon Ratchathani"} },
  { code: "UDN", names: {"th":"อุดรธานี","en":"Udon Thani","ja":"ウドンターニー", "es":"Udon Thani"} },
  { code: "CBI", names: {"th":"ชลบุรี","en":"Chonburi","ja":"チョンブリー", "es":"Chonburi"} },
  { code: "PHK", names: {"th":"ภูเก็ต","en":"Phuket","ja":"プーケット", "es":"Phuket"} },
  { code: "SKA", names: {"th":"สงขลา","en":"Songkhla","ja":"ソンクラー", "es":"Songkhla"} },
  { code: "NST", names: {"th":"นครศรีธรรมราช","en":"Nakhon Si Thammarat","ja":"ナコンシータンマラート", "es":"Nakhon Si Thammarat"} },
  { code: "SNI", names: {"th":"สุราษฎร์ธานี","en":"Surat Thani","ja":"スラートターニー", "es":"Surat Thani"} },
  { code: "RBR", names: {"th":"ราชบุรี","en":"Ratchaburi","ja":"ラーチャブリー", "es":"Ratchaburi"} },
  { code: "PTE", names: {"th":"ปทุมธานี","en":"Pathum Thani","ja":"パトゥムターニー", "es":"Pathum Thani"} },
  { code: "ACR", names: {"th":"อำนาจเจริญ","en":"Amnat Charoen","ja":"アムナートチャルーン", "es":"Amnat Charoen"} },
  { code: "ATG", names: {"th":"อ่างทอง","en":"Ang Thong","ja":"アーントーン", "es":"Ang Thong"} },
  { code: "AYA", names: {"th":"พระนครศรีอยุธยา","en":"Phra Nakhon Si Ayutthaya","ja":"アユタヤ", "es":"Phra Nakhon Si Ayutthaya"} },
  { code: "BKN", names: {"th":"บึงกาฬ","en":"Bueng Kan","ja":"ブンカーン", "es":"Bueng Kan"} },
  { code: "BRM", names: {"th":"บุรีรัมย์","en":"Buriram","ja":"ブリーラム", "es":"Buriram"} },
  { code: "CCO", names: {"th":"ฉะเชิงเทรา","en":"Chachoengsao","ja":"チャチューンサオ", "es":"Chachoengsao"} },
  { code: "CNT", names: {"th":"ชัยนาท","en":"Chai Nat","ja":"チャイナート", "es":"Chai Nat"} },
  { code: "CPM", names: {"th":"ชัยภูมิ","en":"Chaiyaphum","ja":"チャイヤプーム", "es":"Chaiyaphum"} },
  { code: "CPN", names: {"th":"ชุมพร","en":"Chumphon","ja":"チュムポーン", "es":"Chumphon"} },
  { code: "CTI", names: {"th":"จันทบุรี","en":"Chanthaburi","ja":"チャンタブリー", "es":"Chanthaburi"} },
  { code: "KBI", names: {"th":"กระบี่","en":"Krabi","ja":"クラビー", "es":"Krabi"} },
  { code: "KPT", names: {"th":"กำแพงเพชร","en":"Kamphaeng Phet","ja":"カムペーンペット", "es":"Kamphaeng Phet"} },
  { code: "KRI", names: {"th":"กาญจนบุรี","en":"Kanchanaburi","ja":"カーンチャナブリー", "es":"Kanchanaburi"} },
  { code: "KSN", names: {"th":"กาฬสินธุ์","en":"Kalasin","ja":"カーラシン", "es":"Kalasin"} },
  { code: "LEI", names: {"th":"เลย","en":"Loei","ja":"ルーイ", "es":"Loei"} },
  { code: "LPG", names: {"th":"ลำปาง","en":"Lampang","ja":"ランパーン", "es":"Lampang"} },
  { code: "LPN", names: {"th":"ลำพูน","en":"Lamphun","ja":"ランプーン", "es":"Lamphun"} },
  { code: "LRI", names: {"th":"ลพบุรี","en":"Lopburi","ja":"ロッブリー", "es":"Lopburi"} },
  { code: "MDH", names: {"th":"มุกดาหาร","en":"Mukdahan","ja":"ムクダーハーン", "es":"Mukdahan"} },
  { code: "MKM", names: {"th":"มหาสารคาม","en":"Maha Sarakham","ja":"マハーサーラカーム", "es":"Maha Sarakham"} },
  { code: "MSN", names: {"th":"แม่ฮ่องสอน","en":"Mae Hong Son","ja":"メーホンソーン", "es":"Mae Hong Son"} },
  { code: "NAN", names: {"th":"น่าน","en":"Nan","ja":"ナーン", "es":"Nan"} },
  { code: "NBP", names: {"th":"หนองบัวลำภู","en":"Nong Bua Lamphu","ja":"ノーンブアラムプー", "es":"Nong Bua Lamphu"} },
  { code: "NKI", names: {"th":"หนองคาย","en":"Nong Khai","ja":"ノーンカーイ", "es":"Nong Khai"} },
  { code: "NPM", names: {"th":"นครพนม","en":"Nakhon Phanom","ja":"ナコンパノム", "es":"Nakhon Phanom"} },
  { code: "NPT", names: {"th":"นครปฐม","en":"Nakhon Pathom","ja":"ナコンパトム", "es":"Nakhon Pathom"} },
  { code: "NSN", names: {"th":"นครสวรรค์","en":"Nakhon Sawan","ja":"ナコンサワン", "es":"Nakhon Sawan"} },
  { code: "NWT", names: {"th":"นราธิวาส","en":"Narathiwat","ja":"ナラーティワート", "es":"Narathiwat"} },
  { code: "NYK", names: {"th":"นครนายก","en":"Nakhon Nayok","ja":"ナコンナーヨック", "es":"Nakhon Nayok"} },
  { code: "PBI", names: {"th":"เพชรบุรี","en":"Phetchaburi","ja":"ペッチャブリー", "es":"Phetchaburi"} },
  { code: "PCT", names: {"th":"พิจิตร","en":"Phichit","ja":"ピチット", "es":"Phichit"} },
  { code: "PLG", names: {"th":"พัทลุง","en":"Phatthalung","ja":"パッタルン", "es":"Phatthalung"} },
  { code: "PLK", names: {"th":"พิษณุโลก","en":"Phitsanulok","ja":"ピサヌローク", "es":"Phitsanulok"} },
  { code: "PNA", names: {"th":"พังงา","en":"Phang Nga","ja":"パンガー", "es":"Phang Nga"} },
  { code: "PNB", names: {"th":"เพชรบูรณ์","en":"Phetchabun","ja":"ペッチャブーン", "es":"Phetchabun"} },
  { code: "PRE", names: {"th":"แพร่","en":"Phrae","ja":"プレー", "es":"Phrae"} },
  { code: "PRI", names: {"th":"ปราจีนบุรี","en":"Prachinburi","ja":"プラーチーンブリー", "es":"Prachinburi"} },
  { code: "PKN", names: {"th":"ประจวบคีรีขันธ์","en":"Prachuap Khiri Khan","ja":"プラチュワップキーリーカン", "es":"Prachuap Khiri Khan"} },
  { code: "PTN", names: {"th":"ปัตตานี","en":"Pattani","ja":"パッタニー", "es":"Pattani"} },
  { code: "PYO", names: {"th":"พะเยา","en":"Phayao","ja":"パヤオ", "es":"Phayao"} },
  { code: "RET", names: {"th":"ร้อยเอ็ด","en":"Roi Et","ja":"ローイエット", "es":"Roi Et"} },
  { code: "RNG", names: {"th":"ระนอง","en":"Ranong","ja":"ラノーン", "es":"Ranong"} },
  { code: "RYG", names: {"th":"ระยอง","en":"Rayong","ja":"ラヨーン", "es":"Rayong"} },
  { code: "SBR", names: {"th":"สิงห์บุรี","en":"Sing Buri","ja":"シンブリー", "es":"Sing Buri"} },
  { code: "SKM", names: {"th":"สมุทรสงคราม","en":"Samut Songkhram","ja":"サムットソンクラーム", "es":"Samut Songkhram"} },
  { code: "SKN", names: {"th":"สมุทรสาคร","en":"Samut Sakhon","ja":"サムットサーコーン", "es":"Samut Sakhon"} },
  { code: "SKW", names: {"th":"สระแก้ว","en":"Sa Kaeo","ja":"サケーオ", "es":"Sa Kaeo"} },
  { code: "SNK", names: {"th":"สกลนคร","en":"Sakon Nakhon","ja":"サコンナコン", "es":"Sakon Nakhon"} },
  { code: "SPB", names: {"th":"สุพรรณบุรี","en":"Suphan Buri","ja":"スパンブリー", "es":"Suphan Buri"} },
  { code: "SPK", names: {"th":"สมุทรปราการ","en":"Samut Prakan","ja":"サムットプラーカーン", "es":"Samut Prakan"} },
  { code: "SRI", names: {"th":"สระบุรี","en":"Saraburi","ja":"サラブリー", "es":"Saraburi"} },
  { code: "SRN", names: {"th":"สุรินทร์","en":"Surin","ja":"スリン", "es":"Surin"} },
  { code: "SSK", names: {"th":"ศรีสะเกษ","en":"Sisaket","ja":"シーサケート", "es":"Sisaket"} },
  { code: "STI", names: {"th":"สุโขทัย","en":"Sukhothai","ja":"スコータイ", "es":"Sukhothai"} },
  { code: "STN", names: {"th":"สตูล","en":"Satun","ja":"サトゥーン", "es":"Satun"} },
  { code: "TAK", names: {"th":"ตาก","en":"Tak","ja":"ターク", "es":"Tak"} },
  { code: "TRG", names: {"th":"ตรัง","en":"Trang","ja":"トラン", "es":"Trang"} },
  { code: "TRT", names: {"th":"ตราด","en":"Trat","ja":"トラート", "es":"Trat"} },
  { code: "UTI", names: {"th":"อุทัยธานี","en":"Uthai Thani","ja":"ウタイターニー", "es":"Uthai Thani"} },
  { code: "UTT", names: {"th":"อุตรดิตถ์","en":"Uttaradit","ja":"ウッタラディット", "es":"Uttaradit"} },
  { code: "YLA", names: {"th":"ยะลา","en":"Yala","ja":"ヤラー", "es":"Yala"} },
  { code: "YST", names: {"th":"ยโสธร","en":"Yasothon","ja":"ヤソートーン", "es":"Yasothon"} },
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
  "ACR",
  "ATG",
  "AYA",
  "BKN",
  "BRM",
  "CCO",
  "CNT",
  "CPM",
  "CPN",
  "CTI",
  "KBI",
  "KPT",
  "KRI",
  "KSN",
  "LEI",
  "LPG",
  "LPN",
  "LRI",
  "MDH",
  "MKM",
  "MSN",
  "NAN",
  "NBP",
  "NKI",
  "NPM",
  "NPT",
  "NSN",
  "NWT",
  "NYK",
  "PBI",
  "PCT",
  "PLG",
  "PLK",
  "PNA",
  "PNB",
  "PRE",
  "PRI",
  "PKN",
  "PTN",
  "PYO",
  "RET",
  "RNG",
  "RYG",
  "SBR",
  "SKM",
  "SKN",
  "SKW",
  "SNK",
  "SPB",
  "SPK",
  "SRI",
  "SRN",
  "SSK",
  "STI",
  "STN",
  "TAK",
  "TRG",
  "TRT",
  "UTI",
  "UTT",
  "YLA",
  "YST",
]

export type ProvinceCode = (typeof PROVINCE_CODES)[number]

/** 2 rows, from cities.jsonl. */
export const CITY = [
  { code: "BANGKOK", provinceCode: "BKK", names: {"th":"กรุงเทพมหานคร","en":"Bangkok","ja":"バンコク", "es":"Bangkok"} },
  { code: "CHIANG_MAI", provinceCode: "CMI", names: {"th":"เชียงใหม่","en":"Chiang Mai","ja":"チェンマイ", "es":"Chiang Mai"} },
] as const

export const CITY_CODES = CITY.map((t) => t.code) as unknown as [
  "BANGKOK",
  "CHIANG_MAI",
]

export type CityCode = (typeof CITY_CODES)[number]

/** 3 rows, from coach_roles.jsonl. */
export const COACH_ROLE = [
  { code: "HEAD", names: {"th":"หัวหน้าผู้ฝึกสอน","en":"Head Coach","ja":"ヘッドコーチ", "es":"Primer entrenador"} },
  { code: "ASSISTANT", names: {"th":"ผู้ช่วยผู้ฝึกสอน","en":"Assistant Coach","ja":"アシスタントコーチ", "es":"Entrenador ayudante"} },
  { code: "MANAGER", names: {"th":"ผู้จัดการทีม","en":"Team Manager","ja":"チームマネージャー", "es":"Delegado del equipo"} },
] as const

export const COACH_ROLE_CODES = COACH_ROLE.map((t) => t.code) as unknown as [
  "HEAD",
  "ASSISTANT",
  "MANAGER",
]

export type CoachRoleCode = (typeof COACH_ROLE_CODES)[number]

/** 2 rows, from event_formats.jsonl. */
export const EVENT_FORMAT = [
  { code: "5x5", names: {"th":"5 ต่อ 5","en":"5-on-5","ja":"5人制", "es":"5 contra 5"} },
  { code: "3x3", names: {"th":"3 ต่อ 3","en":"3x3","ja":"3x3", "es":"3x3"} },
] as const

export const EVENT_FORMAT_CODES = EVENT_FORMAT.map((t) => t.code) as unknown as [
  "5x5",
  "3x3",
]

export type EventFormatCode = (typeof EVENT_FORMAT_CODES)[number]

/** 4 rows, from event_types.jsonl. */
export const EVENT_TYPE = [
  { code: "TOURNAMENT", names: {"th":"การแข่งขันแบบทัวร์นาเมนต์","en":"Tournament","ja":"トーナメント", "es":"Torneo"}, descriptions: {"th":"การแข่งขันแบบแบ่งสายและคัดออกจนได้ผู้ชนะที่ประกาศอย่างเป็นทางการ","en":"Bracketed competition with elimination rounds and a declared winner","ja":"勝ち抜き形式で優勝者を決める大会", "es":"Competición por cuadro con rondas eliminatorias y un ganador"} },
  { code: "LEAGUE", names: {"th":"ลีก","en":"League","ja":"リーグ", "es":"Liga"}, descriptions: {"th":"ฤดูกาลแข่งขันต่อเนื่อง ทีมแข่งขันตามรอบที่กำหนดและสะสมคะแนน","en":"Recurring season — teams play scheduled rounds and accumulate points","ja":"シーズン制 — 各チームが節ごとに対戦し勝点を積み上げる", "es":"Temporada regular: los equipos juegan jornadas programadas y suman puntos"} },
  { code: "CAMP", names: {"th":"ค่ายฝึก","en":"Camp / Clinic","ja":"キャンプ / クリニック", "es":"Campus / clínic"}, descriptions: {"th":"กิจกรรมฝึกทักษะเพื่อพัฒนาความสามารถ ไม่ใช่การแข่งขัน","en":"Training event — skill development not competition","ja":"練習イベント — 競技ではなく技術の向上が目的", "es":"Evento de formación: desarrollo técnico, no competición"} },
  { code: "SHOWCASE", names: {"th":"การโชว์ผู้เล่น","en":"Showcase","ja":"ショーケース", "es":"Exhibición"}, descriptions: {"th":"กิจกรรมแสดงผลงานเพื่อสร้างโอกาสให้แมวมอง ผู้สรรหา และสื่อเห็นผู้เล่น","en":"Exhibition event for visibility — scouts recruiters media","ja":"露出のためのエキシビション — スカウト・リクルーター・メディア向け", "es":"Evento de exhibición para dar visibilidad: ojeadores, reclutadores y medios"} },
] as const

export const EVENT_TYPE_CODES = EVENT_TYPE.map((t) => t.code) as unknown as [
  "TOURNAMENT",
  "LEAGUE",
  "CAMP",
  "SHOWCASE",
]

export type EventTypeCode = (typeof EVENT_TYPE_CODES)[number]

/** 3 rows, from genders.jsonl. */
/**
 * 4 rows. The states a game moves through.
 *
 * Taken from the roadmap's own wording — "Upcoming / live / half-time /
 * finished" — rather than invented here, so the feature table and the model say
 * the same thing. There is deliberately no POSTPONED or CANCELLED: the roadmap
 * does not promise either, and a status nothing can set is a column that is
 * always wrong in the same way.
 */
/**
 * How a league table is scored.
 *
 * Basketball has no draw, so there are two outcomes and two numbers. Two points
 * for a win is what the roadmap means by a "points-based table", and it is what
 * the product has always displayed — it was simply hardcoded in a fixture
 * (five wins showed as ten points) where nobody could see it was a rule.
 *
 * A competition rule belongs to the Product Owner. If a league ever scores
 * differently this becomes per-event or per-format; today every event uses the
 * same one, and inventing that configurability before a league needs it would
 * be a column nothing sets.
 *
 * **Only FINISHED games count.** A game in progress has a score, but a table
 * that moves while people are still playing is a live scoreboard, not standings.
 */
export const STANDINGS_POINTS = {
  win: 2,
  loss: 0,
} as const

export const GAME_STATUS = [
  { code: "SCHEDULED", names: {"th":"รอแข่งขัน","en":"Upcoming","ja":"開始前", "es":"Próximo"} },
  { code: "LIVE", names: {"th":"กำลังแข่ง","en":"Live","ja":"試合中", "es":"En directo"} },
  { code: "HALF_TIME", names: {"th":"พักครึ่ง","en":"Half-time","ja":"ハーフタイム", "es":"Descanso"} },
  { code: "FINISHED", names: {"th":"จบการแข่งขัน","en":"Finished","ja":"終了", "es":"Finalizado"} },
] as const

export const GAME_STATUS_CODES = GAME_STATUS.map((t) => t.code) as unknown as [
  "SCHEDULED",
  "LIVE",
  "HALF_TIME",
  "FINISHED",
]

export type GameStatusCode = (typeof GAME_STATUS_CODES)[number]

export const GENDER = [
  { code: "M", names: {"th":"ชาย","en":"Boys","ja":"男子", "es":"Masculino"} },
  { code: "F", names: {"th":"หญิง","en":"Girls","ja":"女子", "es":"Femenino"} },
  { code: "COED", names: {"th":"ผสม","en":"Co-ed","ja":"混合", "es":"Mixto"} },
] as const

export const GENDER_CODES = GENDER.map((t) => t.code) as unknown as [
  "M",
  "F",
  "COED",
]

export type GenderCode = (typeof GENDER_CODES)[number]

/** 4 rows, from guardian_types.jsonl. */
export const GUARDIAN_TYPE = [
  { code: "PARENT", names: {"th":"ผู้ปกครอง","en":"Parent","ja":"親", "es":"Padre o madre"} },
  { code: "GRANDPARENT", names: {"th":"ปู่ย่าตายาย","en":"Grandparent","ja":"祖父母", "es":"Abuelo o abuela"} },
  { code: "LEGAL_GUARDIAN", names: {"th":"ผู้ดูแล","en":"Legal Guardian","ja":"法定後見人", "es":"Tutor legal"} },
  { code: "OTHER", names: {"th":"อื่นๆ","en":"Other","ja":"その他", "es":"Otro"} },
] as const

export const GUARDIAN_TYPE_CODES = GUARDIAN_TYPE.map((t) => t.code) as unknown as [
  "PARENT",
  "GRANDPARENT",
  "LEGAL_GUARDIAN",
  "OTHER",
]

export type GuardianTypeCode = (typeof GUARDIAN_TYPE_CODES)[number]

/** 3 rows, from locales.jsonl. */
/**
 * Whether an invitation is outstanding or taken up.
 *
 * `ACCEPT_CO_ORGANIZER_INVITE` is granted to `ANY_SIGNED_IN` and had nothing to
 * accept: `eventCoOrganizers` recorded a co-organizer or it did not. An invite
 * action and an accept action only mean something if there is a state between
 * them.
 */
export const INVITE_STATUS = [
  { code: "PENDING", names: {"th":"รอการตอบรับ","en":"Pending","ja":"保留中", "es":"Pendiente"} },
  { code: "ACCEPTED", names: {"th":"ตอบรับแล้ว","en":"Accepted","ja":"承認済み", "es":"Aceptada"} },
] as const

export const INVITE_STATUS_CODES = INVITE_STATUS.map((t) => t.code) as unknown as [
  "PENDING",
  "ACCEPTED",
]
export type InviteStatusCode = (typeof INVITE_STATUS_CODES)[number]

/**
 * The languages, each named in its own.
 *
 * `endonym` is what the picker shows, and it is the field that scales: one
 * string per language, written once. `names` is the older N×N shape — every
 * language named in every other — which is nine strings at three languages and
 * two hundred and twenty-five at fifteen, with every addition editing all the
 * existing entries. It stays for prose that genuinely needs "translated into
 * Japanese" in a sentence and is not extended for new languages.
 *
 * A picker naming languages in their own is also simply correct: somebody who
 * cannot read the current interface has to be able to find theirs, and nobody
 * looking for Japanese scans for "ญี่ปุ่น".
 *
 * docs/2026-09-09-15-language-picker-at-fifteen.md.
 */
export const LOCALE = [
  { code: "th", status: "released", endonym: "ไทย", names: {"th":"ไทย","en":"Thai","ja":"タイ語", "es":"Thai"} },
  { code: "en", status: "released", endonym: "English", names: {"th":"อังกฤษ","en":"English","ja":"英語", "es":"English"} },
  { code: "ja", status: "released", endonym: "日本語", names: {"th":"ญี่ปุ่น","en":"Japanese","ja":"日本語", "es":"Japanese"} },
  { code: "zh", status: "draft", endonym: "简体中文", names: {"th":"จีน","en":"Chinese","ja":"中国語", "es":"Chinese"} },
  { code: "es", status: "released", endonym: "Español", names: {"th":"สเปน","en":"Spanish","ja":"スペイン語", "es":"Spanish"} },
  { code: "pt", status: "draft", endonym: "Português", names: {"th":"โปรตุเกส","en":"Portuguese","ja":"ポルトガル語", "es":"Portuguese"} },
  { code: "id", status: "draft", endonym: "Bahasa Indonesia", names: {"th":"อินโดนีเซีย","en":"Indonesian","ja":"インドネシア語", "es":"Indonesian"} },
  { code: "fr", status: "draft", endonym: "Français", names: {"th":"ฝรั่งเศส","en":"French","ja":"フランス語", "es":"French"} },
  { code: "tl", status: "draft", endonym: "Filipino", names: {"th":"ฟิลิปปินส์","en":"Filipino","ja":"フィリピン語", "es":"Filipino"} },
  { code: "vi", status: "draft", endonym: "Tiếng Việt", names: {"th":"เวียดนาม","en":"Vietnamese","ja":"ベトナム語", "es":"Vietnamese"} },
  { code: "ko", status: "draft", endonym: "한국어", names: {"th":"เกาหลี","en":"Korean","ja":"韓国語", "es":"Korean"} },
  { code: "de", status: "draft", endonym: "Deutsch", names: {"th":"เยอรมัน","en":"German","ja":"ドイツ語", "es":"German"} },
  { code: "ru", status: "draft", endonym: "Русский", names: {"th":"รัสเซีย","en":"Russian","ja":"ロシア語", "es":"Russian"} },
] as const

export const LOCALE_CODES = LOCALE.map((t) => t.code) as unknown as [
  "th",
  "en",
  "ja",
]

export type LocaleCode = (typeof LOCALE_CODES)[number]

/** 8 rows, from notification_categories.jsonl. */
export const NOTIFICATION_CATEGORY = [
  { code: "LIVE", names: {"th":"สด","en":"Live","ja":"ライブ", "es":"En directo"} },
  { code: "REMINDER", names: {"th":"เตือนความจำ","en":"Reminder","ja":"リマインダー", "es":"Recordatorio"} },
  { code: "MEETING", names: {"th":"การประชุม","en":"Meeting","ja":"ミーティング", "es":"Reunión"} },
  { code: "DISCOVERY", names: {"th":"ค้นพบ","en":"Discovery","ja":"発見", "es":"Descubrimiento"} },
  { code: "TEAM", names: {"th":"ทีม","en":"Team","ja":"チーム", "es":"Equipo"} },
  { code: "REGISTRATION", names: {"th":"การสมัคร","en":"Registration","ja":"登録", "es":"Inscripción"} },
  { code: "DIGEST", names: {"th":"สรุป","en":"Digest","ja":"ダイジェスト", "es":"Resúmenes"} },
  { code: "ANNOUNCEMENT", names: {"th":"ประกาศ","en":"Announcement","ja":"お知らせ", "es":"Aviso"} },
  { code: "WORKFLOW", names: {"th":"ขั้นตอนดำเนินการ","en":"Workflow","ja":"ワークフロー", "es":"Flujo de trabajo"} },
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
  { code: "LINE", addressFormat: "LINE personal ID or LINE Official Account user ID", names: {"th":"ไลน์","en":"LINE","ja":"LINE", "es":"LINE"}, descriptions: {"th":"ช่องทางรับส่งข้อความหลักในประเทศไทย มีการใช้งานมากกว่า 90 เปอร์เซ็นต์และมีการมีส่วนร่วมสูงสุด","en":"Dominant messaging channel in Thailand (90%+ penetration). Highest engagement.","ja":"タイで圧倒的に使われているメッセージ手段（普及率90%以上）。反応率が最も高い。", "es":"Canal de mensajería dominante en Tailandia (más del 90 % de penetración). La mayor interacción."} },
  { code: "EMAIL", addressFormat: "RFC 5322 email address", names: {"th":"อีเมล","en":"Email","ja":"メール", "es":"Correo"}, descriptions: {"th":"ใช้ได้ทั่วไปแต่มีการมีส่วนร่วมในไทยต่ำกว่า เหมาะสำหรับสรุปข้อมูลและใบเสร็จ","en":"Universal but lower engagement in Thailand. Good for digests and receipts.","ja":"誰でも使えるがタイでは反応率が低い。ダイジェストや控えの送付に適する。", "es":"Universal pero con menos interacción en Tailandia. Bueno para resúmenes y comprobantes."} },
  { code: "SMS", addressFormat: "E.164 phone number", names: {"th":"เอสเอ็มเอส","en":"SMS","ja":"SMS", "es":"SMS"}, descriptions: {"th":"ส่งถึงผู้รับได้อย่างน่าเชื่อถือ แต่มีค่าใช้จ่ายต่อข้อความ เหมาะสำหรับรหัส OTP และการแจ้งเตือนสำคัญ","en":"Reliable delivery; cost per message. Good for OTP and critical alerts.","ja":"確実に届くが1通ごとに費用がかかる。認証コードや重要な通知に適する。", "es":"Entrega fiable; coste por mensaje. Bueno para códigos de un solo uso y avisos críticos."} },
  { code: "PUSH", addressFormat: "Web Push subscription token (PWA)", names: {"th":"การแจ้งเตือนแบบ Push","en":"Push","ja":"プッシュ通知", "es":"Push"}, descriptions: {"th":"ต้องติดตั้ง PWA ไม่มีค่าใช้จ่ายเมื่อใช้งานในปริมาณมาก แต่การเข้าถึงยังจำกัดจนกว่าจะมีผู้ติดตั้งเพิ่ม","en":"Requires PWA installation. Free at scale; limited reach until adoption grows.","ja":"PWAのインストールが必要。大量配信でも無料だが、普及するまで届く範囲は限られる。", "es":"Requiere instalar la PWA. Gratis a gran escala; alcance limitado hasta que crezca su adopción."} },
  { code: "IN_APP", addressFormat: "Internal user ID (delivered when user opens app/site)", names: {"th":"การแจ้งเตือนในแอป","en":"In-app","ja":"アプリ内", "es":"En la aplicación"}, descriptions: {"th":"ใช้งานได้เสมอสำหรับผู้ที่ลงชื่อเข้าใช้ แต่จะแสดงเมื่อผู้ใช้กำลังใช้งานแอปหรือเว็บไซต์","en":"Always works for signed-in users; only seen when user is active.","ja":"ログイン中のユーザーには必ず届くが、利用中でなければ見られない。", "es":"Siempre funciona para quien ha iniciado sesión; solo se ve cuando la persona está activa."} },
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
  { code: "MATCH_START", categoryCode: "LIVE", names: {"th":"เริ่มแข่งขัน","en":"Match Start","ja":"試合開始", "es":"Inicio del partido"}, descriptions: {"th":"การแข่งขันกำลังจะเริ่มต้น","en":"A match is starting now","ja":"試合が始まります", "es":"Un partido empieza ahora"} },
  { code: "MATCH_END", categoryCode: "LIVE", names: {"th":"จบการแข่งขัน","en":"Match End","ja":"試合終了", "es":"Fin del partido"}, descriptions: {"th":"การแข่งขันจบลงแล้วและมีผลคะแนนสุดท้าย","en":"A match has ended (final score available)","ja":"試合が終了しました（最終スコアあり）", "es":"Un partido ha terminado (resultado final disponible)"} },
  { code: "SCORE_UPDATE", categoryCode: "LIVE", names: {"th":"คะแนนเปลี่ยนแปลง","en":"Score Update","ja":"スコア更新", "es":"Cambio en el marcador"}, descriptions: {"th":"คะแนนเปลี่ยนแปลงระหว่างการแข่งขันสด","en":"Score changed during a live match","ja":"試合中にスコアが変わりました", "es":"El marcador ha cambiado durante un partido en directo"} },
  { code: "MEETING_INVITE", categoryCode: "MEETING", names: {"th":"คำเชิญประชุม","en":"Meeting Invitation","ja":"ミーティングへの招待", "es":"Invitación a una reunión"}, descriptions: {"th":"มีคนเชิญคุณเข้าร่วมการประชุม","en":"Somebody invited you to a meeting","ja":"ミーティングに招待されました", "es":"Alguien te ha invitado a una reunión"} },
  { code: "EVENT_REMINDER", categoryCode: "REMINDER", names: {"th":"เตือนความจำอีเวนต์","en":"Event Reminder","ja":"イベントのリマインダー", "es":"Recordatorio de evento"}, descriptions: {"th":"อีเวนต์กำลังจะเริ่มในอีกไม่นาน ก่อนเริ่ม 24 ชั่วโมงหรือ 1 ชั่วโมง","en":"An event is starting soon (24h or 1h before)","ja":"まもなくイベントが始まります（24時間前または1時間前）", "es":"Un evento empieza pronto (24 h o 1 h antes)"} },
  { code: "EVENT_CREATED", categoryCode: "DISCOVERY", names: {"th":"อีเวนต์ใหม่","en":"Event Created","ja":"イベント作成", "es":"Evento creado"}, descriptions: {"th":"มีการเผยแพร่อีเวนต์ใหม่ในขอบเขตที่คุณติดตาม","en":"A new event was published in your followed scope","ja":"フォロー中の範囲で新しいイベントが公開されました", "es":"Se ha publicado un evento nuevo en lo que sigues"} },
  { code: "ROSTER_CHANGE", categoryCode: "TEAM", names: {"th":"เปลี่ยนแปลงรายชื่อผู้เล่น","en":"Roster Change","ja":"ロースター変更", "es":"Cambio de plantilla"}, descriptions: {"th":"รายชื่อผู้เล่นของทีมที่คุณติดตามมีการเปลี่ยนแปลง","en":"A followed team's roster changed","ja":"フォロー中のチームのロースターが変わりました", "es":"Ha cambiado la plantilla de un equipo que sigues"} },
  { code: "REGISTRATION_OPEN", categoryCode: "REGISTRATION", names: {"th":"เปิดลงทะเบียน","en":"Registration Open","ja":"参加受付開始", "es":"Inscripción abierta"}, descriptions: {"th":"เปิดรับลงทะเบียนอีเวนต์แล้ว","en":"Event registration is now open","ja":"イベントの参加受付が始まりました", "es":"La inscripción al evento ya está abierta"} },
  { code: "REGISTRATION_CLOSING", categoryCode: "REGISTRATION", names: {"th":"ปิดลงทะเบียนเร็วๆนี้","en":"Registration Closing Soon","ja":"受付間もなく終了", "es":"La inscripción cierra pronto"}, descriptions: {"th":"การลงทะเบียนอีเวนต์กำลังจะปิด","en":"Event registration is about to close","ja":"イベントの参加受付がまもなく締め切られます", "es":"La inscripción al evento está a punto de cerrarse"} },
  { code: "DAILY_DIGEST", categoryCode: "DIGEST", names: {"th":"สรุปประจำวัน","en":"Daily Digest","ja":"日次ダイジェスト", "es":"Resumen diario"}, descriptions: {"th":"สรุปกิจกรรมที่คุณติดตามประจำวัน","en":"Daily summary of activity you follow","ja":"フォロー中の動きの1日のまとめ", "es":"Resumen diario de la actividad que sigues"} },
  { code: "WEEKLY_DIGEST", categoryCode: "DIGEST", names: {"th":"สรุปประจำสัปดาห์","en":"Weekly Digest","ja":"週次ダイジェスト", "es":"Resumen semanal"}, descriptions: {"th":"สรุปกิจกรรมที่คุณติดตามประจำสัปดาห์","en":"Weekly summary of activity you follow","ja":"フォロー中の動きの1週間のまとめ", "es":"Resumen semanal de la actividad que sigues"} },
  { code: "ANNOUNCEMENT", categoryCode: "ANNOUNCEMENT", names: {"th":"ประกาศ","en":"Announcement","ja":"お知らせ", "es":"Aviso"}, descriptions: {"th":"ประกาศทั่วไปจากผู้จัดการแข่งขันหรือผู้ดูแลระบบ","en":"General announcement from an organizer or admin","ja":"主催者または管理者からのお知らせ", "es":"Aviso general de un organizador o administrador"} },
  { code: "APPROVAL_REQUEST", categoryCode: "WORKFLOW", names: {"th":"คำขออนุมัติ","en":"Approval Request","ja":"承認依頼", "es":"Solicitud de aprobación"}, descriptions: {"th":"ต้องดำเนินการโดยผู้ดูแลระบบ เช่น คำขอสมัครผู้ตัดสินที่รออนุมัติ","en":"Admin action needed (e.g. pending REFEREE signup)","ja":"管理者の対応が必要です（例：審判登録の申請）", "es":"Requiere acción de un administrador (por ejemplo, un alta de árbitro pendiente)"} },
  { code: "APPROVAL_GRANTED", categoryCode: "WORKFLOW", names: {"th":"ได้รับอนุมัติ","en":"Approval Granted","ja":"承認完了", "es":"Aprobación concedida"}, descriptions: {"th":"คำขอของคุณได้รับการอนุมัติแล้ว","en":"Your request was approved","ja":"申請が承認されました", "es":"Tu solicitud ha sido aprobada"} },
  { code: "INVITATION", categoryCode: "WORKFLOW", names: {"th":"คำเชิญ","en":"Invitation","ja":"招待", "es":"Invitación"}, descriptions: {"th":"คุณได้รับคำเชิญ เช่น คำเชิญเป็นผู้ร่วมจัด","en":"You were invited (co-organizer etc)","ja":"招待を受けました（共同主催者など）", "es":"Te han invitado (coorganizador, etc.)"} },
] as const

export const NOTIFICATION_TYPE_CODES = NOTIFICATION_TYPE.map((t) => t.code) as unknown as [
  "MEETING_INVITE",
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
  { code: "OWNER", names: {"th":"เจ้าขององค์กร","en":"Organisation Owner","ja":"団体オーナー", "es":"Propietario de la organización"} },
  { code: "ADMIN", names: {"th":"ผู้ดูแลองค์กร","en":"Organisation Admin","ja":"団体管理者", "es":"Administrador de la organización"} },
  { code: "MEMBER", names: {"th":"สมาชิกองค์กร","en":"Organisation Member","ja":"団体メンバー", "es":"Miembro de la organización"} },
] as const

export const ORG_ROLE_CODES = ORG_ROLE.map((t) => t.code) as unknown as [
  "OWNER",
  "ADMIN",
  "MEMBER",
]

export type OrgRoleCode = (typeof ORG_ROLE_CODES)[number]

/** 4 rows, from org_types.jsonl. */
export const ORG_TYPE = [
  { code: "SCHOOL", names: {"th":"โรงเรียน","en":"School","ja":"学校", "es":"Centro escolar"} },
  { code: "CLUB", names: {"th":"สโมสร","en":"Club","ja":"クラブ", "es":"Club"} },
  { code: "FEDERATION", names: {"th":"สหพันธ์","en":"Federation","ja":"連盟", "es":"Federación"} },
  { code: "GRASSROOTS", names: {"th":"ชุมชนรากหญ้า","en":"Grassroots","ja":"地域団体", "es":"Base"} },
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
  { code: "PG", names: {"th":"พอยต์การ์ด","en":"PG","ja":"PG", "es":"B"}, fullNames: {"th":"พอยต์การ์ด","en":"Point Guard","ja":"ポイントガード"} },
  { code: "SG", names: {"th":"ชู้ตติ้งการ์ด","en":"SG","ja":"SG", "es":"E"}, fullNames: {"th":"ชู้ตติ้งการ์ด","en":"Shooting Guard","ja":"シューティングガード"} },
  { code: "SF", names: {"th":"สมอลล์ฟอร์เวิร์ด","en":"SF","ja":"SF", "es":"AL"}, fullNames: {"th":"สมอลล์ฟอร์เวิร์ด","en":"Small Forward","ja":"スモールフォワード"} },
  { code: "PF", names: {"th":"พาวเวอร์ฟอร์เวิร์ด","en":"PF","ja":"PF", "es":"AP"}, fullNames: {"th":"พาวเวอร์ฟอร์เวิร์ด","en":"Power Forward","ja":"パワーフォワード"} },
  { code: "C", names: {"th":"เซ็นเตอร์","en":"C","ja":"C", "es":"P"}, fullNames: {"th":"เซ็นเตอร์","en":"Center","ja":"センター"} },
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
  { code: "ADMIN", names: {"th":"ผู้ดูแลระบบ","en":"Admin","ja":"管理者", "es":"Administración"}, descriptions: {"th":"เจ้าหน้าที่ภายในที่ดูแลแพลตฟอร์มและมีสิทธิ์เขียนข้อมูลทั้งหมด","en":"Internal staff managing the platform — full write access across all data","ja":"プラットフォームを運営する内部スタッフ — 全データへの書き込み権限", "es":"Personal interno que gestiona la plataforma: acceso de escritura a todos los datos"} },
  { code: "ORGANIZER", names: {"th":"ผู้จัดการแข่งขัน","en":"Organizer","ja":"主催者", "es":"Organizador"}, descriptions: {"th":"สร้างและจัดทัวร์นาเมนต์ ลีก ค่ายฝึก และกิจกรรมแสดงผลงาน","en":"Creates and runs tournaments leagues camps showcases","ja":"大会・リーグ・キャンプ・ショーケースを作成し運営する", "es":"Creates and runs tournaments leagues camps showcases"} },
  { code: "COACH", names: {"th":"โค้ช","en":"Coach","ja":"コーチ", "es":"Entrenador"}, descriptions: {"th":"จัดการทีม การลงทะเบียนรายชื่อผู้เล่น และการบันทึกการเข้าร่วม","en":"Manages a team — roster registration attendance","ja":"チームを管理する — ロースター・登録・出席", "es":"Gestiona un equipo: plantilla, inscripciones y asistencia"} },
  { code: "PLAYER", names: {"th":"ผู้เล่น","en":"Player","ja":"選手", "es":"Jugador"}, descriptions: {"th":"นักกีฬารายบุคคลที่จัดการโปรไฟล์ การลงทะเบียน และสถิติของตนเอง","en":"Individual athlete — own profile registrations stats","ja":"個人の競技者 — 自分のプロフィール・登録・スタッツ", "es":"Deportista individual: su ficha, inscripciones y estadísticas"} },
  { code: "SPECTATOR", names: {"th":"ผู้ชม","en":"Spectator","ja":"観戦者", "es":"Espectador"}, descriptions: {"th":"ผู้ติดตามที่อ่านข้อมูลได้อย่างเดียว เช่น ผู้ปกครอง แฟนกีฬา และผู้ชมทั่วไป","en":"Read-only follower — parents fans casual viewers","ja":"閲覧のみのフォロワー — 保護者・ファン・一般の視聴者", "es":"Seguidor de solo lectura: familias, aficionados y público ocasional"} },
  { code: "REFEREE", names: {"th":"ผู้ตัดสิน","en":"Referee","ja":"審判", "es":"Árbitro"}, descriptions: {"th":"เจ้าหน้าที่ผู้ได้รับการรับรองที่บันทึกคะแนนและสถานะการแข่งขัน","en":"Certified official — score entry match status","ja":"公認審判 — スコア入力と試合状況", "es":"Árbitro certificado: introduce el resultado y el estado del partido"} },
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
  { code: "OWNER", objectTypeCode: "EVENT", via: "table", sourceTable: "events", objectColumn: "id", userColumn: "organizer_user_id", filterColumn: null, filterValue: null, throughTable: null, throughColumn: null, activeFromColumn: null, activeToColumn: null, roleCode: null, parentRelation: null, names: {"th":"เจ้าของ","en":"Owner","ja":"オーナー", "es":"Propietario"} },
  { code: "CO_ORGANIZER", objectTypeCode: "EVENT", via: "table", sourceTable: "event_co_organizers", objectColumn: "event_id", userColumn: "user_id", filterColumn: "status_code", filterValue: "ACCEPTED", throughTable: null, throughColumn: null, activeFromColumn: null, activeToColumn: null, roleCode: null, parentRelation: null, names: {"th":"ผู้ร่วมจัด","en":"Co-organizer","ja":"共同主催者", "es":"Coorganizador"} },
  { code: "HEAD_COACH", objectTypeCode: "TEAM", via: "table", sourceTable: "team_coaches", objectColumn: "team_id", userColumn: "user_id", filterColumn: "coach_role_code", filterValue: "HEAD", throughTable: null, throughColumn: null, activeFromColumn: null, activeToColumn: null, roleCode: null, parentRelation: null, names: {"th":"หัวหน้าผู้ฝึกสอน","en":"Head Coach","ja":"ヘッドコーチ", "es":"Primer entrenador"} },
  { code: "ASSISTANT_COACH", objectTypeCode: "TEAM", via: "table", sourceTable: "team_coaches", objectColumn: "team_id", userColumn: "user_id", filterColumn: "coach_role_code", filterValue: "ASSISTANT", throughTable: null, throughColumn: null, activeFromColumn: null, activeToColumn: null, roleCode: null, parentRelation: null, names: {"th":"ผู้ช่วยผู้ฝึกสอน","en":"Assistant Coach","ja":"アシスタントコーチ", "es":"Entrenador ayudante"} },
  { code: "TEAM_MANAGER", objectTypeCode: "TEAM", via: "table", sourceTable: "team_coaches", objectColumn: "team_id", userColumn: "user_id", filterColumn: "coach_role_code", filterValue: "MANAGER", throughTable: null, throughColumn: null, activeFromColumn: null, activeToColumn: null, roleCode: null, parentRelation: null, names: {"th":"ผู้จัดการทีม","en":"Team Manager","ja":"チームマネージャー", "es":"Delegado del equipo"} },
  { code: "TEAM_PLAYER", objectTypeCode: "TEAM", via: "table", sourceTable: "player_teams", objectColumn: "team_id", userColumn: "user_id", filterColumn: null, filterValue: null, throughTable: "players", throughColumn: "player_id", activeFromColumn: "from_date", activeToColumn: "to_date", roleCode: null, parentRelation: null, names: {"th":"ผู้เล่นในทีม","en":"Team Player","ja":"チーム所属選手", "es":"Jugador del equipo"} },
  { code: "SELF", objectTypeCode: "PLAYER", via: "table", sourceTable: "players", objectColumn: "id", userColumn: "user_id", filterColumn: null, filterValue: null, throughTable: null, throughColumn: null, activeFromColumn: null, activeToColumn: null, roleCode: null, parentRelation: null, names: {"th":"ตัวเอง","en":"Self","ja":"本人", "es":"Uno mismo"} },
  { code: "GUARDIAN", objectTypeCode: "PLAYER", via: "table", sourceTable: "guardians", objectColumn: "player_id", userColumn: "user_id", filterColumn: null, filterValue: null, throughTable: null, throughColumn: null, activeFromColumn: null, activeToColumn: null, roleCode: null, parentRelation: null, names: {"th":"ผู้ปกครอง","en":"Guardian","ja":"保護者", "es":"Tutor"} },
  { code: "FOLLOWER_PLAYER", objectTypeCode: "PLAYER", via: "table", sourceTable: "subscriptions", objectColumn: "object_id", userColumn: "user_id", filterColumn: "object_type_code", filterValue: "PLAYER", throughTable: null, throughColumn: null, activeFromColumn: null, activeToColumn: null, roleCode: null, parentRelation: null, names: {"th":"ผู้ติดตาม (ผู้เล่น)","en":"Player Follower","ja":"選手のフォロワー", "es":"Seguidor del jugador"} },
  { code: "FOLLOWER_TEAM", objectTypeCode: "TEAM", via: "table", sourceTable: "subscriptions", objectColumn: "object_id", userColumn: "user_id", filterColumn: "object_type_code", filterValue: "TEAM", throughTable: null, throughColumn: null, activeFromColumn: null, activeToColumn: null, roleCode: null, parentRelation: null, names: {"th":"ผู้ติดตาม (ทีม)","en":"Team Follower","ja":"チームのフォロワー", "es":"Seguidor del equipo"} },
  { code: "ORG_OWNER", objectTypeCode: "ORG", via: "table", sourceTable: "org_members", objectColumn: "org_id", userColumn: "user_id", filterColumn: "org_role_code", filterValue: "OWNER", throughTable: null, throughColumn: null, activeFromColumn: null, activeToColumn: null, roleCode: null, parentRelation: null, names: {"th":"เจ้าขององค์กร","en":"Organisation Owner","ja":"団体オーナー", "es":"Propietario de la organización"} },
  { code: "ORG_ADMIN", objectTypeCode: "ORG", via: "table", sourceTable: "org_members", objectColumn: "org_id", userColumn: "user_id", filterColumn: "org_role_code", filterValue: "ADMIN", throughTable: null, throughColumn: null, activeFromColumn: null, activeToColumn: null, roleCode: null, parentRelation: null, names: {"th":"ผู้ดูแลองค์กร","en":"Organisation Admin","ja":"団体管理者", "es":"Administrador de la organización"} },
  { code: "ORG_MEMBER", objectTypeCode: "ORG", via: "table", sourceTable: "org_members", objectColumn: "org_id", userColumn: "user_id", filterColumn: "org_role_code", filterValue: "MEMBER", throughTable: null, throughColumn: null, activeFromColumn: null, activeToColumn: null, roleCode: null, parentRelation: null, names: {"th":"สมาชิกองค์กร","en":"Organisation Member","ja":"団体メンバー", "es":"Miembro de la organización"} },
  // A referee is assigned to a game, not to the platform. `ANY_REFEREE` — the
  // role — used to grant score entry, which meant every referee could score
  // every game in every event.
  { code: "GAME_REFEREE", objectTypeCode: "GAME", via: "table", sourceTable: "game_referees", objectColumn: "game_id", userColumn: "user_id", filterColumn: null, filterValue: null, throughTable: null, throughColumn: null, activeFromColumn: null, activeToColumn: null, roleCode: null, parentRelation: null, names: {"th":"ผู้ตัดสินของเกม","en":"Game Referee","ja":"試合の審判", "es":"Árbitro del partido"} },
  // Inherited from the event the game belongs to: whoever runs the event runs
  // its games. `via: "parent"` reads `games.event_id` for this game and then asks
  // the named relation about that event — so these two stay correct by
  // construction if OWNER or CO_ORGANIZER is ever redefined.
  { code: "GAME_EVENT_OWNER", objectTypeCode: "GAME", via: "parent", sourceTable: "games", objectColumn: "id", userColumn: null, filterColumn: null, filterValue: null, throughTable: null, throughColumn: "event_id", activeFromColumn: null, activeToColumn: null, roleCode: null, parentRelation: "OWNER", names: {"th":"เจ้าของอีเวนต์ของเกม","en":"Owner of the game's event","ja":"試合が属するイベントのオーナー", "es":"Propietario del evento del partido"} },
  { code: "GAME_EVENT_CO_ORGANIZER", objectTypeCode: "GAME", via: "parent", sourceTable: "games", objectColumn: "id", userColumn: null, filterColumn: null, filterValue: null, throughTable: null, throughColumn: "event_id", activeFromColumn: null, activeToColumn: null, roleCode: null, parentRelation: "CO_ORGANIZER", names: {"th":"ผู้ร่วมจัดอีเวนต์ของเกม","en":"Co-organizer of the game's event","ja":"試合が属するイベントの共同主催者", "es":"Coorganizador del evento del partido"} },
  { code: "FOLLOWER_EVENT", objectTypeCode: "EVENT", via: "table", sourceTable: "subscriptions", objectColumn: "object_id", userColumn: "user_id", filterColumn: "object_type_code", filterValue: "EVENT", throughTable: null, throughColumn: null, activeFromColumn: null, activeToColumn: null, roleCode: null, parentRelation: null, names: {"th":"ผู้ติดตาม (อีเวนต์)","en":"Event Follower","ja":"イベントのフォロワー", "es":"Seguidor del evento"} },
  { code: "PLATFORM_ADMIN", objectTypeCode: "PLATFORM", via: "role", sourceTable: null, objectColumn: null, userColumn: null, filterColumn: null, filterValue: null, throughTable: null, throughColumn: null, activeFromColumn: null, activeToColumn: null, roleCode: "ADMIN", parentRelation: null, names: {"th":"ผู้ดูแลแพลตฟอร์ม","en":"Platform Admin","ja":"プラットフォーム管理者", "es":"Administrador de la plataforma"} },
  { code: "ANY_ORGANIZER", objectTypeCode: "PLATFORM", via: "role", sourceTable: null, objectColumn: null, userColumn: null, filterColumn: null, filterValue: null, throughTable: null, throughColumn: null, activeFromColumn: null, activeToColumn: null, roleCode: "ORGANIZER", parentRelation: null, names: {"th":"ผู้จัดการแข่งขันใดๆ","en":"Any Organizer","ja":"主催者全員", "es":"Cualquier organizador"} },
  { code: "ANY_COACH", objectTypeCode: "PLATFORM", via: "role", sourceTable: null, objectColumn: null, userColumn: null, filterColumn: null, filterValue: null, throughTable: null, throughColumn: null, activeFromColumn: null, activeToColumn: null, roleCode: "COACH", parentRelation: null, names: {"th":"โค้ชใดๆ","en":"Any Coach","ja":"コーチ全員", "es":"Cualquier entrenador"} },
  { code: "ANY_PLAYER", objectTypeCode: "PLATFORM", via: "role", sourceTable: null, objectColumn: null, userColumn: null, filterColumn: null, filterValue: null, throughTable: null, throughColumn: null, activeFromColumn: null, activeToColumn: null, roleCode: "PLAYER", parentRelation: null, names: {"th":"ผู้เล่นใดๆ","en":"Any Player","ja":"選手全員", "es":"Cualquier jugador"} },
  { code: "ANY_REFEREE", objectTypeCode: "PLATFORM", via: "role", sourceTable: null, objectColumn: null, userColumn: null, filterColumn: null, filterValue: null, throughTable: null, throughColumn: null, activeFromColumn: null, activeToColumn: null, roleCode: "REFEREE", parentRelation: null, names: {"th":"ผู้ตัดสินใดๆ","en":"Any Referee","ja":"審判全員", "es":"Cualquier árbitro"} },
  { code: "ANY_SPECTATOR", objectTypeCode: "PLATFORM", via: "role", sourceTable: null, objectColumn: null, userColumn: null, filterColumn: null, filterValue: null, throughTable: null, throughColumn: null, activeFromColumn: null, activeToColumn: null, roleCode: "SPECTATOR", parentRelation: null, names: {"th":"ผู้ชมใดๆ","en":"Any Spectator","ja":"観戦者全員", "es":"Cualquier espectador"} },
  { code: "ANY_SIGNED_IN", objectTypeCode: "PLATFORM", via: "everyone", sourceTable: null, objectColumn: null, userColumn: null, filterColumn: null, filterValue: null, throughTable: null, throughColumn: null, activeFromColumn: null, activeToColumn: null, roleCode: null, parentRelation: null, names: {"th":"ผู้ที่เข้าสู่ระบบใดๆ","en":"Any Signed-in User","ja":"ログイン中の全ユーザー", "es":"Cualquier persona con sesión iniciada"} },
  { code: "PUBLIC", objectTypeCode: "PLATFORM", via: "everyone", sourceTable: null, objectColumn: null, userColumn: null, filterColumn: null, filterValue: null, throughTable: null, throughColumn: null, activeFromColumn: null, activeToColumn: null, roleCode: null, parentRelation: null, names: {"th":"สาธารณะ","en":"Public","ja":"一般公開", "es":"Público"} },
  // Decision 006: any current squad may establish coach access; UTC dates, inclusive.
  { code: "PLAYER_HEAD_COACH", objectTypeCode: "PLAYER", via: "parent", sourceTable: "player_teams", objectColumn: "player_id", userColumn: null, filterColumn: null, filterValue: null, throughTable: null, throughColumn: "team_id", activeFromColumn: "from_date", activeToColumn: "to_date", roleCode: null, parentRelation: "HEAD_COACH", names: {"th": "หัวหน้าผู้ฝึกสอนของผู้เล่นปัจจุบัน", "en": "Current player's head coach", "ja": "現在所属するチームのヘッドコーチ"} },
  { code: "PLAYER_ASSISTANT_COACH", objectTypeCode: "PLAYER", via: "parent", sourceTable: "player_teams", objectColumn: "player_id", userColumn: null, filterColumn: null, filterValue: null, throughTable: null, throughColumn: "team_id", activeFromColumn: "from_date", activeToColumn: "to_date", roleCode: null, parentRelation: "ASSISTANT_COACH", names: {"th": "ผู้ช่วยผู้ฝึกสอนของผู้เล่นปัจจุบัน", "en": "Current player's assistant coach", "ja": "現在所属するチームのアシスタントコーチ"} },
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
  "GAME_REFEREE",
  "GAME_EVENT_OWNER",
  "GAME_EVENT_CO_ORGANIZER",
  "FOLLOWER_EVENT",
  "PLATFORM_ADMIN",
  "ANY_ORGANIZER",
  "ANY_COACH",
  "ANY_PLAYER",
  "ANY_REFEREE",
  "ANY_SPECTATOR",
  "ANY_SIGNED_IN",
  "PUBLIC",
  "PLAYER_HEAD_COACH",
  "PLAYER_ASSISTANT_COACH",
]

export type RelationCode = (typeof RELATION_CODES)[number]

/** 1 rows, from skill_tiers.jsonl. */
export const SKILL_TIER = [
  { code: "PREMIER", names: {"th":"พรีเมียร์","en":"Premier","ja":"プレミア", "es":"Élite"} },
] as const

export const SKILL_TIER_CODES = SKILL_TIER.map((t) => t.code) as unknown as [
  "PREMIER",
]

export type SkillTierCode = (typeof SKILL_TIER_CODES)[number]

/** 4 rows, from user_statuses.jsonl. */
export const USER_STATUS = [
  { code: "ACTIVE", names: {"th":"ใช้งานอยู่","en":"Active","ja":"有効", "es":"Activa"}, descriptions: {"th":"บัญชีเปิดใช้งานเต็มรูปแบบและสามารถใช้แพลตฟอร์มได้","en":"Account is fully active and can use the platform","ja":"アカウントは有効で、プラットフォームを利用できます", "es":"La cuenta está plenamente activa y puede usar la plataforma"} },
  { code: "PENDING_APPROVAL", names: {"th":"รออนุมัติ","en":"Pending Approval","ja":"承認待ち", "es":"Pendiente de aprobación"}, descriptions: {"th":"มีบัญชีแล้วแต่กำลังรอการอนุมัติจากผู้ดูแลระบบ เช่น ผู้ตัดสินที่รอการตรวจสอบการรับรอง BAT","en":"Account exists but is waiting for admin approval (e.g. REFEREE awaiting BAT certification verification)","ja":"アカウントは存在するが管理者の承認待ち（例：BAT認定の確認を待つ審判）", "es":"La cuenta existe pero espera la aprobación de un administrador (por ejemplo, un árbitro pendiente de verificar su certificación de la BAT)"} },
  { code: "SUSPENDED", names: {"th":"ระงับชั่วคราว","en":"Suspended","ja":"一時停止", "es":"Suspendida"}, descriptions: {"th":"บัญชีถูกระงับชั่วคราวโดยผู้ดูแลระบบ","en":"Account is temporarily suspended by admin","ja":"管理者により一時的に停止されています", "es":"Un administrador ha suspendido temporalmente la cuenta"} },
  { code: "DEACTIVATED", names: {"th":"ปิดใช้งาน","en":"Deactivated","ja":"無効化", "es":"Desactivada"}, descriptions: {"th":"บัญชีถูกปิดใช้งานถาวร","en":"Account is permanently deactivated","ja":"アカウントは永久に無効化されています", "es":"La cuenta está desactivada de forma permanente"} },
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
  // Scoped to the TEAM, because that is what HEAD_COACH and TEAM_MANAGER are
  // about. It said EVENT, which meant the check looked for
  // `team_coaches.team_id = <an event id>` — matching nothing, so it failed
  // closed and only a platform admin could register a team.
  //
  // `eventTypes` still narrows by the event being entered. Registration is an
  // action about a *pair* — are you this team's coach, and is this event one you
  // may enter — and the two halves are answered against different objects.
  REGISTER_TEAM_FOR_EVENT: [
    { relation: "HEAD_COACH", eventTypes: ["TOURNAMENT", "LEAGUE", "SHOWCASE"] },
    { relation: "TEAM_MANAGER", eventTypes: ["TOURNAMENT", "LEAGUE", "SHOWCASE"] },
    { relation: "PLATFORM_ADMIN", eventTypes: ["TOURNAMENT", "LEAGUE", "SHOWCASE"] },
  ],
  // Scoped to the PLAYER, for the same reason: SELF and GUARDIAN are about a
  // player, not about the event they are entering.
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
    { relation: "PLAYER_HEAD_COACH", eventTypes: [] },
    { relation: "PLAYER_ASSISTANT_COACH", eventTypes: [] },
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
  // One fixture at a time — what an organiser does before any generator exists,
  // and what they fall back to when a generated schedule needs a change. Mirrors
  // GENERATE_FIXTURES, plus SHOWCASE: a showcase has games and no draw.
  MANAGE_FIXTURES: [
    { relation: "OWNER", eventTypes: ["TOURNAMENT", "LEAGUE", "SHOWCASE"] },
    { relation: "CO_ORGANIZER", eventTypes: ["TOURNAMENT", "LEAGUE", "SHOWCASE"] },
    { relation: "PLATFORM_ADMIN", eventTypes: ["TOURNAMENT", "LEAGUE", "SHOWCASE"] },
  ],
  // Scoped to the GAME, like ENTER_SCORES, and granted to whoever runs the event
  // above it. Deliberately NOT granted to referees: choosing who officiates is
  // not a referee's decision, and a referee who could assign themselves would
  // undo the point of assigning anyone.
  ASSIGN_REFEREE: [
    { relation: "GAME_EVENT_OWNER", eventTypes: ["TOURNAMENT", "LEAGUE", "SHOWCASE"] },
    { relation: "GAME_EVENT_CO_ORGANIZER", eventTypes: ["TOURNAMENT", "LEAGUE", "SHOWCASE"] },
    { relation: "PLATFORM_ADMIN", eventTypes: ["TOURNAMENT", "LEAGUE", "SHOWCASE"] },
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
  // Scoped to the game, not the event. `ANY_REFEREE` is the platform role, so
  // granting it here let every referee on the platform enter a score for every
  // game in every event. A referee now needs to be assigned to *this* game;
  // organisers and co-organisers keep access to every game in events they run,
  // inherited rather than restated.
  //
  // `eventTypes` still narrows by the parent event's subtype — a camp has no
  // games to score.
  BROADCAST_GAME: [
    { relation: "GAME_EVENT_OWNER", eventTypes: ["TOURNAMENT", "LEAGUE", "SHOWCASE"] },
    { relation: "GAME_EVENT_CO_ORGANIZER", eventTypes: ["TOURNAMENT", "LEAGUE", "SHOWCASE"] },
    { relation: "GAME_REFEREE", eventTypes: ["TOURNAMENT", "LEAGUE", "SHOWCASE"] },
    { relation: "PLATFORM_ADMIN", eventTypes: ["TOURNAMENT", "LEAGUE", "SHOWCASE"] },
  ],
  ENTER_SCORES: [
    { relation: "GAME_EVENT_OWNER", eventTypes: ["TOURNAMENT", "LEAGUE", "SHOWCASE"] },
    { relation: "GAME_EVENT_CO_ORGANIZER", eventTypes: ["TOURNAMENT", "LEAGUE", "SHOWCASE"] },
    { relation: "GAME_REFEREE", eventTypes: ["TOURNAMENT", "LEAGUE", "SHOWCASE"] },
    { relation: "PLATFORM_ADMIN", eventTypes: ["TOURNAMENT", "LEAGUE", "SHOWCASE"] },
  ],
  CONFIRM_MATCH_STATUS: [
    { relation: "GAME_EVENT_OWNER", eventTypes: ["TOURNAMENT", "LEAGUE", "SHOWCASE"] },
    { relation: "GAME_EVENT_CO_ORGANIZER", eventTypes: ["TOURNAMENT", "LEAGUE", "SHOWCASE"] },
    { relation: "GAME_REFEREE", eventTypes: ["TOURNAMENT", "LEAGUE", "SHOWCASE"] },
    { relation: "PLATFORM_ADMIN", eventTypes: ["TOURNAMENT", "LEAGUE", "SHOWCASE"] },
  ],
  RECORD_ATTENDANCE: [
    { relation: "OWNER", eventTypes: ["CAMP"] },
    { relation: "CO_ORGANIZER", eventTypes: ["CAMP"] },
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
  AI_BRACKET_SUGGESTIONS: [
    { relation: "OWNER", eventTypes: ["TOURNAMENT", "SHOWCASE"] },
    { relation: "CO_ORGANIZER", eventTypes: ["TOURNAMENT", "SHOWCASE"] },
    { relation: "PLATFORM_ADMIN", eventTypes: ["TOURNAMENT", "SHOWCASE"] },
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
  /**
   * Deliberately unrestricted, at the Product Owner's instruction: anyone may
   * ask anyone for a meeting. The protection is the invitation rather than the
   * gate — nothing happens to the invitee until they accept, and declining is
   * one press. `RESPOND_TO_MEETING_INVITE` is equally open because the row it
   * writes is the caller's own; the handler scopes it to them, the way every
   * other preference write in this app does.
   */
  CREATE_MEETING: [
    { relation: "ANY_SIGNED_IN", eventTypes: [] },
  ],
  RESPOND_TO_MEETING_INVITE: [
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

/**
 * What the pilot actually runs.
 *
 * The vocabularies above describe Thai school basketball: eight age groups,
 * fifteen provinces, two competition formats. That is the sport. This is the
 * product — which of it the platform is deployed for today.
 *
 * The distinction has to live here rather than in remy-sport, because it is a
 * business decision and not an implementation one. Without it, a tool counting
 * which codes the fixtures exercise cannot tell a **hole** (a feature is built
 * and its data is missing) from **scope** (the model describes more sport than
 * the product runs) — and the only way to make the numbers go green is to
 * invent teams in provinces nobody sells to. `mise run data:coverage` in
 * remy-sport reads this and reports the two separately.
 *
 * Widening the pilot is an edit here, and the fixtures then have somewhere to
 * grow into. Anything absent from a list below is deliberately not served yet;
 * anything present must have fixtures, or it is a hole.
 *
 * `LOCALE` is not listed: it already carries `status` per term, which says the
 * same thing in the place a locale needs it.
 */
export const PILOT_SCOPE = {
  /** U16 and U18 boys and girls — the age groups the launch competitions use. */
  ageGroups: ["U16", "U18"],
  /** Bangkok and Chiang Mai. CITY only defines these two, and they move together. */
  provinces: ["BKK", "CMI"],
  cities: ["BANGKOK", "CHIANG_MAI"],
  /** 5x5 only. 3x3 is a different competition, not a missing fixture. */
  eventFormats: ["5x5"],
  /** Coed competitions need a coed division to exist first. */
  genders: ["M", "F"],
  /** Schools, clubs and the federation. Grassroots clubs are not onboarded. */
  orgTypes: ["SCHOOL", "CLUB", "FEDERATION"],
} as const satisfies Record<string, readonly string[]>

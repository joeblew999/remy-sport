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
export const LOCALES = ["th", "en", "ja", "es", "pt", "fr", "de"] as const

export type Locale = (typeof ALL_LOCALES)[number]

/** A language actually on offer. Narrower than `Locale`. */
export type ReleasedLocale = (typeof LOCALES)[number]

/** 5 rows, from object_types.jsonl. */
export const OBJECT_TYPE = [
  { code: "EVENT", tableName: "events", parentTypeCode: null, parentColumn: null, names: {"th":"อีเวนต์","en":"Event","ja":"イベント", "es":"Event", "pt":"Event", "fr":"Event", "de":"Event"}, descriptions: {"th":"ทัวร์นาเมนต์ ลีก ค่ายฝึก และกิจกรรมแสดงผลงาน โดยประเภทย่อยอยู่ใน events.type_code","en":"Tournaments leagues camps showcases — subtype lives in events.type_code","ja":"大会・リーグ・キャンプ・ショーケース — 種別は events.type_code", "es":"Tournaments leagues camps showcases — subtype lives in events.type_code", "pt":"Tournaments leagues camps showcases — subtype lives in events.type_code", "fr":"Tournaments leagues camps showcases — subtype lives in events.type_code", "de":"Tournaments leagues camps showcases — subtype lives in events.type_code"} },
  { code: "TEAM", tableName: "teams", parentTypeCode: null, parentColumn: null, names: {"th":"ทีม","en":"Team","ja":"チーム", "es":"Equipo", "pt":"Time", "fr":"Équipe", "de":"Team"}, descriptions: {"th":"โปรไฟล์ทีมและรายชื่อผู้เล่น","en":"Team profile and roster","ja":"チームのプロフィールとロースター", "es":"Team profile and roster", "pt":"Team profile and roster", "fr":"Team profile and roster", "de":"Team profile and roster"} },
  { code: "PLAYER", tableName: "players", parentTypeCode: null, parentColumn: null, names: {"th":"ผู้เล่น","en":"Player","ja":"選手", "es":"Jugador", "pt":"Jogador", "fr":"Joueur", "de":"Spieler"}, descriptions: {"th":"โปรไฟล์ผู้เล่นรายบุคคล","en":"Individual player profile","ja":"選手個人のプロフィール", "es":"Individual player profile", "pt":"Individual player profile", "fr":"Individual player profile", "de":"Individual player profile"} },
  { code: "MEETING", tableName: "meetings", parentTypeCode: null, parentColumn: null, names: {"th":"การประชุม","en":"Meeting","ja":"ミーティング", "es":"Reunión", "pt":"Reunião", "fr":"Réunion", "de":"Meeting"}, descriptions: {"th":"การพูดคุยด้วยเสียงและวิดีโอระหว่างผู้ใช้","en":"A voice and video call between people on the platform","ja":"プラットフォーム上の人どうしの音声・ビデオ通話", "es":"A voice and video call between people on the platform", "pt":"A voice and video call between people on the platform", "fr":"A voice and video call between people on the platform", "de":"A voice and video call between people on the platform"} },
  { code: "ORG", tableName: "orgs", parentTypeCode: null, parentColumn: null, names: {"th":"องค์กร","en":"Organisation","ja":"団体", "es":"Organisation", "pt":"Organisation", "fr":"Organisation", "de":"Organisation"}, descriptions: {"th":"โรงเรียน สโมสร และสหพันธ์","en":"Schools clubs federations","ja":"学校・クラブ・連盟", "es":"Schools clubs federations", "pt":"Schools clubs federations", "fr":"Schools clubs federations", "de":"Schools clubs federations"} },
  { code: "GAME", tableName: "games", parentTypeCode: "EVENT", parentColumn: "event_id", names: {"th":"เกม","en":"Game","ja":"試合", "es":"Game", "pt":"Game", "fr":"Game", "de":"Game"}, descriptions: {"th":"การแข่งขันหนึ่งนัดภายในอีเวนต์ — มีสองทีม เวลา สนาม และผลการแข่งขัน","en":"One match inside an event — two teams, a time, a court and a result","ja":"イベント内の1試合 — 2チーム、時刻、コート、結果", "es":"One match inside an event — two teams, a time, a court and a result", "pt":"One match inside an event — two teams, a time, a court and a result", "fr":"One match inside an event — two teams, a time, a court and a result", "de":"One match inside an event — two teams, a time, a court and a result"} },
  { code: "PLATFORM", tableName: null, parentTypeCode: null, parentColumn: null, names: {"th":"แพลตฟอร์ม","en":"Platform","ja":"プラットフォーム", "es":"Platform", "pt":"Platform", "fr":"Platform", "de":"Platform"}, descriptions: {"th":"การดำเนินการทั่วทั้งระบบที่ไม่ผูกกับออบเจ็กต์ใดโดยเฉพาะ","en":"Global actions not tied to a specific object","ja":"特定の対象に紐づかない全体的な操作", "es":"Global actions not tied to a specific object", "pt":"Global actions not tied to a specific object", "fr":"Global actions not tied to a specific object", "de":"Global actions not tied to a specific object"} },
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
  { code: "SIGN_IN_OUT", objectTypeCode: "PLATFORM", category: "Auth", names: {"th":"ลงชื่อเข้า / ออก","en":"Sign in / Sign out","ja":"ログイン / ログアウト", "es":"Iniciar o cerrar sesión", "pt":"Entrar ou sair", "fr":"Se connecter ou se déconnecter", "de":"An- und abmelden"} },
  { code: "SIGN_UP_AS_SPECTATOR", objectTypeCode: "PLATFORM", category: "Auth", names: {"th":"สมัครเป็นผู้ชม","en":"Sign up as Spectator","ja":"観戦者として登録", "es":"Registrarse como espectador", "pt":"Cadastrar-se como espectador", "fr":"S’inscrire comme spectateur", "de":"Als Zuschauer registrieren"} },
  { code: "SIGN_UP_AS_PLAYER", objectTypeCode: "PLATFORM", category: "Auth", names: {"th":"สมัครเป็นผู้เล่น (ผู้ใหญ่)","en":"Sign up as Player (adult)","ja":"選手として登録（成人）", "es":"Registrarse como jugador (adulto)", "pt":"Cadastrar-se como jogador (adulto)", "fr":"S’inscrire comme joueur (adulte)", "de":"Als Spieler registrieren (erwachsen)"} },
  { code: "SIGN_UP_AS_COACH", objectTypeCode: "PLATFORM", category: "Auth", names: {"th":"สมัครเป็นโค้ช","en":"Sign up as Coach","ja":"コーチとして登録", "es":"Registrarse como entrenador", "pt":"Cadastrar-se como técnico", "fr":"S’inscrire comme entraîneur", "de":"Als Trainer registrieren"} },
  { code: "SIGN_UP_AS_ORGANIZER", objectTypeCode: "PLATFORM", category: "Auth", names: {"th":"สมัครเป็นผู้จัดการแข่งขัน","en":"Sign up as Organizer","ja":"主催者として登録", "es":"Registrarse como organizador", "pt":"Cadastrar-se como organizador", "fr":"S’inscrire comme organisateur", "de":"Als Veranstalter registrieren"} },
  { code: "SIGN_UP_PLAYER_AS_GUARDIAN", objectTypeCode: "PLATFORM", category: "Auth", names: {"th":"สมัครผู้เล่น (เด็กในความดูแล)","en":"Sign up minor Player as Guardian","ja":"保護者として未成年の選手を登録", "es":"Registrar a un jugador menor como tutor", "pt":"Cadastrar um jogador menor como responsável", "fr":"Inscrire un joueur mineur en tant que tuteur", "de":"Einen minderjährigen Spieler als Erziehungsberechtigter anmelden"} },
  { code: "SIGN_UP_AS_REFEREE_REQUEST", objectTypeCode: "PLATFORM", category: "Auth", names: {"th":"ส่งคำขอสมัครเป็นผู้ตัดสิน","en":"Submit Referee signup request","ja":"審判登録を申請", "es":"Enviar una solicitud de alta como árbitro", "pt":"Enviar um pedido de cadastro como árbitro", "fr":"Envoyer une demande d’inscription comme arbitre", "de":"Anfrage zur Schiedsrichteranmeldung senden"} },
  { code: "APPROVE_REFEREE", objectTypeCode: "PLATFORM", category: "Admin", names: {"th":"อนุมัติผู้ตัดสิน","en":"Approve pending Referee account","ja":"審判アカウントの申請を承認", "es":"Aprobar una cuenta de árbitro pendiente", "pt":"Aprovar uma conta de árbitro pendente", "fr":"Approuver un compte d’arbitre en attente", "de":"Offenes Schiedsrichterkonto freigeben"} },
  { code: "CREATE_USER_ACCOUNT", objectTypeCode: "PLATFORM", category: "Admin", names: {"th":"สร้างบัญชีผู้ใช้ (ใดๆ)","en":"Create any user account (admin-only minting)","ja":"任意のユーザーアカウントを作成（管理者のみ）", "es":"Crear cualquier cuenta de usuario (solo administradores)", "pt":"Criar qualquer conta de usuário (somente administradores)", "fr":"Créer n’importe quel compte utilisateur (administrateurs uniquement)", "de":"Beliebige Benutzerkonten anlegen (nur Administratoren)"} },
  { code: "INVITE_CO_ORGANIZER", objectTypeCode: "EVENT", category: "Events", names: {"th":"เชิญผู้ร่วมจัด","en":"Invite Co-organizer to event","ja":"共同主催者をイベントに招待", "es":"Invitar a un coorganizador al evento", "pt":"Convidar um coorganizador para o evento", "fr":"Inviter un coorganisateur à l’événement", "de":"Mitveranstalter zum Event einladen"} },
  { code: "ACCEPT_CO_ORGANIZER_INVITE", objectTypeCode: "EVENT", category: "Events", names: {"th":"ตอบรับเป็นผู้ร่วมจัด","en":"Accept Co-organizer invite","ja":"共同主催者の招待を承認", "es":"Aceptar invitación de coorganizador", "pt":"Aceitar convite de coorganizador", "fr":"Accepter une invitation de coorganisateur", "de":"Einladung als Mitveranstalter annehmen"} },
  { code: "INSTALL_APP", objectTypeCode: "PLATFORM", category: "Live", names: {"th":"ติดตั้งแอป (PWA)","en":"Install app (PWA)","ja":"アプリをインストール（PWA）", "es":"Instalar la aplicación (PWA)", "pt":"Instalar o aplicativo (PWA)", "fr":"Installer l’application (PWA)", "de":"App installieren (PWA)"} },
  { code: "MANAGE_ALL_USERS", objectTypeCode: "PLATFORM", category: "Admin", names: {"th":"จัดการผู้ใช้ทั้งหมด","en":"Manage all users","ja":"全ユーザーを管理", "es":"Gestionar todos los usuarios", "pt":"Gerenciar todos os usuários", "fr":"Gérer tous les utilisateurs", "de":"Alle Benutzer verwalten"} },
  { code: "MODERATE_LISTINGS", objectTypeCode: "PLATFORM", category: "Admin", names: {"th":"ตรวจสอบและจัดการรายการ","en":"Moderate listings","ja":"掲載内容を管理", "es":"Moderar publicaciones", "pt":"Moderar publicações", "fr":"Modérer les annonces", "de":"Einträge moderieren"} },
  { code: "BROWSE_EVENTS", objectTypeCode: "PLATFORM", category: "Events", names: {"th":"เรียกดูอีเวนต์","en":"Browse events (list)","ja":"イベントを閲覧（一覧）", "es":"Explorar eventos (lista)", "pt":"Explorar eventos (lista)", "fr":"Explorer les événements (liste)", "de":"Events durchsuchen (Liste)"} },
  { code: "BROWSE_TEAMS", objectTypeCode: "PLATFORM", category: "Teams", names: {"th":"ค้นหาทีม","en":"Browse / find a team","ja":"チームを探す", "es":"Explorar o buscar un equipo", "pt":"Explorar ou encontrar um time", "fr":"Explorer ou trouver une équipe", "de":"Ein Team suchen oder finden"} },
  { code: "CREATE_EVENT", objectTypeCode: "PLATFORM", category: "Events", names: {"th":"สร้างอีเวนต์","en":"Create event","ja":"イベントを作成", "es":"Crear evento", "pt":"Criar evento", "fr":"Créer un événement", "de":"Event anlegen"} },
  { code: "VIEW_EVENT", objectTypeCode: "EVENT", category: "Events", names: {"th":"ดูอีเวนต์","en":"View event detail","ja":"イベント詳細を表示", "es":"Ver el detalle del evento", "pt":"Ver o detalhe do evento", "fr":"Voir le détail de l’événement", "de":"Event-Details ansehen"} },
  { code: "EDIT_EVENT", objectTypeCode: "EVENT", category: "Events", names: {"th":"แก้ไขอีเวนต์","en":"Edit event","ja":"イベントを編集", "es":"Editar evento", "pt":"Editar evento", "fr":"Modifier un événement", "de":"Event bearbeiten"} },
  { code: "DELETE_EVENT", objectTypeCode: "EVENT", category: "Events", names: {"th":"ลบอีเวนต์","en":"Delete event","ja":"イベントを削除", "es":"Eliminar evento", "pt":"Excluir evento", "fr":"Supprimer un événement", "de":"Event löschen"} },
  { code: "MANAGE_DIVISIONS", objectTypeCode: "EVENT", category: "Events", names: {"th":"จัดการดิวิชั่น","en":"Manage event divisions","ja":"イベントのディビジョンを管理", "es":"Gestionar las categorías del evento", "pt":"Gerenciar as categorias do evento", "fr":"Gérer les catégories de l’événement", "de":"Klassen des Events verwalten"} },
  { code: "REGISTER_TEAM_FOR_EVENT", objectTypeCode: "TEAM", category: "Events", names: {"th":"ลงทะเบียนทีมเข้าอีเวนต์","en":"Register team for event","ja":"チームをイベントに登録", "es":"Inscribir a un equipo en un evento", "pt":"Inscrever um time em um evento", "fr":"Inscrire une équipe à un événement", "de":"Team für ein Event melden"} },
  { code: "REGISTER_PLAYER_FOR_EVENT", objectTypeCode: "PLAYER", category: "Events", names: {"th":"ลงทะเบียนผู้เล่นเข้าอีเวนต์","en":"Register player for event","ja":"選手をイベントに登録", "es":"Inscribir a un jugador en un evento", "pt":"Inscrever um jogador em um evento", "fr":"Inscrire un joueur à un événement", "de":"Spieler für ein Event melden"} },
  { code: "CREATE_TEAM", objectTypeCode: "PLATFORM", category: "Teams", names: {"th":"สร้างทีม","en":"Create team","ja":"チームを作成", "es":"Crear equipo", "pt":"Criar time", "fr":"Créer une équipe", "de":"Team anlegen"} },
  { code: "VIEW_TEAM", objectTypeCode: "TEAM", category: "Teams", names: {"th":"ดูโปรไฟล์ทีม","en":"View team profile","ja":"チームのプロフィールを表示", "es":"Ver el perfil del equipo", "pt":"Ver o perfil do time", "fr":"Voir le profil de l’équipe", "de":"Teamprofil ansehen"} },
  { code: "EDIT_TEAM_PROFILE", objectTypeCode: "TEAM", category: "Teams", names: {"th":"แก้ไขโปรไฟล์ทีม","en":"Edit team profile","ja":"チームのプロフィールを編集", "es":"Editar el perfil del equipo", "pt":"Editar o perfil do time", "fr":"Modifier le profil de l’équipe", "de":"Teamprofil bearbeiten"} },
  { code: "DELETE_TEAM", objectTypeCode: "TEAM", category: "Teams", names: {"th":"ลบทีม","en":"Delete team","ja":"チームを削除", "es":"Eliminar equipo", "pt":"Excluir time", "fr":"Supprimer une équipe", "de":"Team löschen"} },
  { code: "MANAGE_ROSTER", objectTypeCode: "TEAM", category: "Teams", names: {"th":"จัดการรายชื่อผู้เล่น","en":"Manage team roster","ja":"チームのロースターを管理", "es":"Gestionar la plantilla del equipo", "pt":"Gerenciar o elenco do time", "fr":"Gérer l’effectif de l’équipe", "de":"Teamkader verwalten"} },
  { code: "CREATE_PLAYER", objectTypeCode: "PLATFORM", category: "Players", names: {"th":"สร้างโปรไฟล์ผู้เล่น","en":"Create player profile","ja":"選手プロフィールを作成", "es":"Crear ficha de jugador", "pt":"Criar ficha de jogador", "fr":"Créer une fiche de joueur", "de":"Spielerprofil anlegen"} },
  { code: "VIEW_PLAYER", objectTypeCode: "PLAYER", category: "Players", names: {"th":"ดูโปรไฟล์ผู้เล่น","en":"View player profile","ja":"選手プロフィールを表示", "es":"Ver la ficha del jugador", "pt":"Ver a ficha do jogador", "fr":"Voir la fiche du joueur", "de":"Spielerprofil ansehen"} },
  { code: "EDIT_PLAYER_PROFILE", objectTypeCode: "PLAYER", category: "Players", names: {"th":"แก้ไขโปรไฟล์ผู้เล่น","en":"Edit player profile","ja":"選手プロフィールを編集", "es":"Editar la ficha del jugador", "pt":"Editar a ficha do jogador", "fr":"Modifier la fiche du joueur", "de":"Spielerprofil bearbeiten"} },
  { code: "DELETE_PLAYER", objectTypeCode: "PLAYER", category: "Players", names: {"th":"ลบโปรไฟล์ผู้เล่น","en":"Delete player profile","ja":"選手プロフィールを削除", "es":"Eliminar ficha de jugador", "pt":"Excluir ficha de jogador", "fr":"Supprimer une fiche de joueur", "de":"Spielerprofil löschen"} },
  { code: "VIEW_PLAYER_STATS", objectTypeCode: "PLAYER", category: "Rankings", names: {"th":"ดูสถิติผู้เล่น","en":"View player stats","ja":"選手のスタッツを表示", "es":"Ver las estadísticas del jugador", "pt":"Ver as estatísticas do jogador", "fr":"Voir les statistiques du joueur", "de":"Spielerstatistiken ansehen"} },
  { code: "FOLLOW_PLAYER", objectTypeCode: "PLAYER", category: "Players", names: {"th":"ติดตามผู้เล่น","en":"Follow player","ja":"選手をフォロー", "es":"Seguir jugador", "pt":"Seguir jogador", "fr":"Suivre un joueur", "de":"Spieler folgen"} },
  { code: "UNFOLLOW_PLAYER", objectTypeCode: "PLAYER", category: "Players", names: {"th":"เลิกติดตามผู้เล่น","en":"Unfollow player","ja":"選手のフォローを解除", "es":"Dejar de seguir al jugador", "pt":"Deixar de seguir o jogador", "fr":"Ne plus suivre le joueur", "de":"Spieler nicht mehr folgen"} },
  { code: "RECEIVE_PLAYER_NOTIFICATIONS", objectTypeCode: "PLAYER", category: "Live", names: {"th":"รับการแจ้งเตือนผู้เล่น","en":"Receive player notifications","ja":"選手の通知を受け取る", "es":"Recibir notificaciones del jugador", "pt":"Receber notificações do jogador", "fr":"Recevoir les notifications du joueur", "de":"Spieler-Benachrichtigungen erhalten"} },
  { code: "CREATE_MEETING", objectTypeCode: "PLATFORM", category: "Live", names: {"th":"สร้างการประชุม","en":"Create a meeting","ja":"ミーティングを作成", "es":"Crear una reunión", "pt":"Criar uma reunião", "fr":"Créer une réunion", "de":"Ein Meeting anlegen"} },
  { code: "RESPOND_TO_MEETING_INVITE", objectTypeCode: "MEETING", category: "Live", names: {"th":"ตอบรับคำเชิญประชุม","en":"Accept or decline a meeting invitation","ja":"ミーティングの招待に応答", "es":"Aceptar o rechazar una invitación a una reunión", "pt":"Aceitar ou recusar um convite de reunião", "fr":"Accepter ou refuser une invitation à une réunion", "de":"Eine Meeting-Einladung annehmen oder ablehnen"} },
  { code: "FOLLOW_TEAM", objectTypeCode: "TEAM", category: "Teams", names: {"th":"ติดตามทีม","en":"Follow team","ja":"チームをフォロー", "es":"Seguir equipo", "pt":"Seguir time", "fr":"Suivre une équipe", "de":"Team folgen"} },
  { code: "UNFOLLOW_TEAM", objectTypeCode: "TEAM", category: "Teams", names: {"th":"เลิกติดตามทีม","en":"Unfollow team","ja":"チームのフォローを解除", "es":"Dejar de seguir el equipo", "pt":"Deixar de seguir o time", "fr":"Ne plus suivre l’équipe", "de":"Team nicht mehr folgen"} },
  { code: "RECEIVE_TEAM_NOTIFICATIONS", objectTypeCode: "TEAM", category: "Live", names: {"th":"รับการแจ้งเตือนทีม","en":"Receive team notifications","ja":"チームの通知を受け取る", "es":"Recibir notificaciones del equipo", "pt":"Receber notificações do time", "fr":"Recevoir les notifications de l’équipe", "de":"Team-Benachrichtigungen erhalten"} },
  { code: "FOLLOW_EVENT", objectTypeCode: "EVENT", category: "Events", names: {"th":"ติดตามอีเวนต์","en":"Follow event","ja":"イベントをフォロー", "es":"Seguir evento", "pt":"Seguir evento", "fr":"Suivre un événement", "de":"Event folgen"} },
  { code: "UNFOLLOW_EVENT", objectTypeCode: "EVENT", category: "Events", names: {"th":"เลิกติดตามอีเวนต์","en":"Unfollow event","ja":"イベントのフォローを解除", "es":"Dejar de seguir el evento", "pt":"Deixar de seguir o evento", "fr":"Ne plus suivre l’événement", "de":"Event nicht mehr folgen"} },
  { code: "RECEIVE_EVENT_NOTIFICATIONS", objectTypeCode: "EVENT", category: "Live", names: {"th":"รับการแจ้งเตือนอีเวนต์","en":"Receive event notifications","ja":"イベントの通知を受け取る", "es":"Recibir notificaciones del evento", "pt":"Receber notificações do evento", "fr":"Recevoir les notifications de l’événement", "de":"Event-Benachrichtigungen erhalten"} },
  { code: "VIEW_BRACKET", objectTypeCode: "EVENT", category: "Schedules", names: {"th":"ดูสายแข่งขัน","en":"View bracket","ja":"トーナメント表を表示", "es":"Ver el cuadro", "pt":"Ver o chaveamento", "fr":"Voir le tableau", "de":"Turnierbaum ansehen"} },
  { code: "VIEW_FIXTURE_SCHEDULE", objectTypeCode: "EVENT", category: "Schedules", names: {"th":"ดูตารางแข่งขัน","en":"View fixture schedule","ja":"試合日程を表示", "es":"Ver el calendario", "pt":"Ver o calendário", "fr":"Voir le calendrier", "de":"Spielplan ansehen"} },
  { code: "VIEW_COURT_ASSIGNMENTS", objectTypeCode: "EVENT", category: "Schedules", names: {"th":"ดูการจัดสนาม","en":"View court assignments","ja":"コート割当を表示", "es":"Ver las asignaciones de pista", "pt":"Ver as definições de quadra", "fr":"Voir l’attribution des terrains", "de":"Feldzuweisungen ansehen"} },
  { code: "MANAGE_FIXTURES", objectTypeCode: "EVENT", category: "Schedules", names: {"th":"จัดการตารางแข่งขัน","en":"Add, edit and remove fixtures","ja":"試合の追加・編集・削除", "es":"Añadir, editar y eliminar partidos", "pt":"Adicionar, editar e remover jogos", "fr":"Ajouter, modifier et supprimer des matchs", "de":"Spiele hinzufügen, bearbeiten und entfernen"}, descriptions: {"th":"สร้างหรือแก้ไขการแข่งขันทีละนัด ต่างจากการสร้างอัตโนมัติทั้งตาราง","en":"Create or change one game at a time — as distinct from generating a whole schedule at once","ja":"1試合ずつ作成・変更する — 日程全体を一括生成するのとは別", "es":"Create or change one game at a time — as distinct from generating a whole schedule at once", "pt":"Create or change one game at a time — as distinct from generating a whole schedule at once", "fr":"Create or change one game at a time — as distinct from generating a whole schedule at once", "de":"Create or change one game at a time — as distinct from generating a whole schedule at once"} },
  { code: "ASSIGN_REFEREE", objectTypeCode: "GAME", category: "Schedules", names: {"th":"มอบหมายผู้ตัดสิน","en":"Assign a referee to a game","ja":"試合に審判を割り当てる", "es":"Asignar un árbitro a un partido", "pt":"Escalar um árbitro para um jogo", "fr":"Désigner un arbitre pour un match", "de":"Einen Schiedsrichter für ein Spiel ansetzen"}, descriptions: {"th":"เลือกผู้ตัดสินสำหรับการแข่งขันนัดหนึ่ง ซึ่งเป็นสิ่งที่ทำให้การบันทึกคะแนนปลอดภัย","en":"Choose who officiates one game — the assignment that makes score entry safe","ja":"1試合の担当審判を選ぶ — スコア入力を安全にする割当", "es":"Elegir quién arbitra un partido: la designación que hace segura la introducción del resultado", "pt":"Escolher quem apita um jogo — a escalação que torna o lançamento do placar seguro", "fr":"Choisir qui arbitre un match — la désignation qui sécurise la saisie du score", "de":"Festlegen, wer ein Spiel pfeift — die Ansetzung, die die Ergebniseingabe absichert"} },
  { code: "GENERATE_BRACKETS", objectTypeCode: "EVENT", category: "Schedules", names: {"th":"สร้างสายแข่งขัน","en":"Generate brackets","ja":"トーナメント表を生成", "es":"Generar cuadros", "pt":"Gerar chaveamento", "fr":"Générer les tableaux", "de":"Turnierbäume erzeugen"} },
  { code: "GENERATE_FIXTURES", objectTypeCode: "EVENT", category: "Schedules", names: {"th":"สร้างตารางแข่งขัน","en":"Generate fixtures","ja":"試合日程を生成", "es":"Generar calendario", "pt":"Gerar tabela", "fr":"Générer le calendrier", "de":"Spielplan erzeugen"} },
  { code: "DEFINE_SESSION_SCHEDULE", objectTypeCode: "EVENT", category: "Schedules", names: {"th":"กำหนดตารางเซสชัน","en":"Define session schedule","ja":"セッション日程を設定", "es":"Define session schedule", "pt":"Define session schedule", "fr":"Define session schedule", "de":"Define session schedule"} },
  { code: "ASSIGN_COURTS", objectTypeCode: "EVENT", category: "Schedules", names: {"th":"กำหนดสนาม","en":"Assign courts","ja":"コートを割り当てる", "es":"Asignar pistas", "pt":"Definir quadras", "fr":"Attribuer les terrains", "de":"Felder zuweisen"} },
  { code: "BROADCAST_GAME", objectTypeCode: "GAME", category: "Live", names: {"th":"ถ่ายทอดสดเกม","en":"Broadcast a game","ja":"試合を配信する", "es":"Retransmitir un partido", "pt":"Transmitir um jogo", "fr":"Diffuser un match", "de":"Ein Spiel übertragen"}, descriptions: {"th":"เปิดกล้องถ่ายทอดสดเกมนี้","en":"Point a camera at this game and publish it live","ja":"この試合をカメラで撮影して配信する", "es":"Apuntar una cámara a este partido y retransmitirlo en directo", "pt":"Apontar uma câmera para este jogo e transmiti-lo ao vivo", "fr":"Pointer une caméra sur ce match et le diffuser en direct", "de":"Eine Kamera auf dieses Spiel richten und es live übertragen"} },
  { code: "ENTER_SCORES", objectTypeCode: "GAME", category: "Scores", names: {"th":"บันทึกคะแนน","en":"Enter scores","ja":"スコアを入力", "es":"Introducir resultados", "pt":"Lançar placares", "fr":"Saisir les scores", "de":"Ergebnisse eintragen"} },
  { code: "CONFIRM_MATCH_STATUS", objectTypeCode: "GAME", category: "Scores", names: {"th":"ยืนยันสถานะการแข่งขัน","en":"Confirm match status","ja":"試合状況を確定", "es":"Confirmar el estado del partido", "pt":"Confirmar a situação do jogo", "fr":"Confirmer le statut du match", "de":"Spielstatus bestätigen"} },
  { code: "RECORD_ATTENDANCE", objectTypeCode: "EVENT", category: "Scores", names: {"th":"บันทึกการเข้าร่วม","en":"Record attendance","ja":"出席を記録", "es":"Registrar asistencia", "pt":"Registrar presença", "fr":"Enregistrer les présences", "de":"Anwesenheit erfassen"} },
  { code: "VIEW_GAME_RESULTS", objectTypeCode: "GAME", category: "Scores", names: {"th":"ดูผลการแข่งขัน","en":"View game results","ja":"試合結果を表示", "es":"Ver los resultados", "pt":"Ver os resultados", "fr":"Voir les résultats", "de":"Ergebnisse ansehen"} },
  { code: "VIEW_MATCH_STATUS", objectTypeCode: "GAME", category: "Scores", names: {"th":"ดูสถานะการแข่งขัน","en":"View match status","ja":"試合状況を表示", "es":"Ver el estado del partido", "pt":"Ver a situação do jogo", "fr":"Voir le statut du match", "de":"Spielstatus ansehen"} },
  { code: "SPOILER_MODE", objectTypeCode: "PLATFORM", category: "Scores", names: {"th":"โหมดซ่อนสปอยล์","en":"Spoiler mode preference","ja":"ネタバレ防止の設定", "es":"Preferencia de modo sin resultados", "pt":"Preferência de modo sem spoiler", "fr":"Préférence de mode sans spoiler", "de":"Einstellung für den spoilerfreien Modus"} },
  { code: "VIEW_RESULTS_ARCHIVE", objectTypeCode: "PLATFORM", category: "Scores", names: {"th":"ดูประวัติผลการแข่งขัน","en":"View results archive","ja":"過去の結果を表示", "es":"Ver el archivo de resultados", "pt":"Ver o arquivo de resultados", "fr":"Voir les archives de résultats", "de":"Ergebnisarchiv ansehen"} },
  { code: "VIEW_STANDINGS", objectTypeCode: "EVENT", category: "Rankings", names: {"th":"ดูตารางคะแนน","en":"View standings","ja":"順位表を表示", "es":"Ver la clasificación", "pt":"Ver a classificação", "fr":"Voir le classement", "de":"Tabelle ansehen"} },
  { code: "VIEW_RANK_MOVEMENT", objectTypeCode: "EVENT", category: "Rankings", names: {"th":"ดูการเปลี่ยนอันดับ","en":"View rank movement","ja":"順位の変動を表示", "es":"Ver el movimiento en la clasificación", "pt":"Ver a variação na classificação", "fr":"Voir l’évolution au classement", "de":"Veränderung in der Tabelle ansehen"} },
  { code: "VIEW_RANKINGS_HISTORY", objectTypeCode: "PLATFORM", category: "Rankings", names: {"th":"ดูประวัติอันดับ","en":"View rankings history","ja":"順位の履歴を表示", "es":"Ver el histórico de clasificaciones", "pt":"Ver o histórico de classificações", "fr":"Voir l’historique des classements", "de":"Tabellenverlauf ansehen"} },
  { code: "VIEW_SEASON_RECORDS", objectTypeCode: "EVENT", category: "Rankings", names: {"th":"ดูสถิติประจำฤดูกาล","en":"View season records","ja":"シーズン戦績を表示", "es":"Ver los registros de la temporada", "pt":"Ver os registros da temporada", "fr":"Voir les records de la saison", "de":"Saisonrekorde ansehen"} },
  { code: "VIEW_LIVE_SCORES", objectTypeCode: "EVENT", category: "Live", names: {"th":"ดูคะแนนสด","en":"View live scores","ja":"ライブスコアを表示", "es":"Ver los resultados en directo", "pt":"Ver os placares ao vivo", "fr":"Voir les scores en direct", "de":"Live-Ergebnisse ansehen"} },
  { code: "RECEIVE_NOTIFICATIONS", objectTypeCode: "PLATFORM", category: "Live", names: {"th":"รับการแจ้งเตือน","en":"Receive push notifications","ja":"プッシュ通知を受け取る", "es":"Recibir notificaciones push", "pt":"Receber notificações push", "fr":"Recevoir les notifications push", "de":"Push-Benachrichtigungen erhalten"} },
  { code: "MANAGE_OWN_NOTIFICATION_CHANNELS", objectTypeCode: "PLATFORM", category: "Live", names: {"th":"จัดการช่องทางการแจ้งเตือนของตัวเอง","en":"Manage own notification channels (add / remove / verify / enable / disable)","ja":"自分の通知チャネルを管理（追加 / 削除 / 確認 / 有効化 / 無効化）", "es":"Gestionar los propios canales de notificación (añadir, quitar, verificar, activar o desactivar)", "pt":"Gerenciar os próprios canais de notificação (adicionar, remover, verificar, ligar ou desligar)", "fr":"Gérer ses propres canaux de notification (ajouter, retirer, vérifier, activer ou désactiver)", "de":"Eigene Benachrichtigungskanäle verwalten (hinzufügen, entfernen, bestätigen, ein- oder ausschalten)"} },
  { code: "MANAGE_OWN_NOTIFICATION_PREFERENCES", objectTypeCode: "PLATFORM", category: "Live", names: {"th":"จัดการการตั้งค่าการแจ้งเตือนของตัวเอง","en":"Manage own per-type notification preferences (which type via which channel)","ja":"通知種別ごとの設定を管理（どの種別をどのチャネルで受け取るか）", "es":"Gestionar las propias preferencias por tipo de notificación (qué tipo por qué canal)", "pt":"Gerenciar as próprias preferências por tipo de notificação (qual tipo por qual canal)", "fr":"Gérer ses propres préférences par type de notification (quel type par quel canal)", "de":"Eigene Einstellungen je Benachrichtigungstyp verwalten (welcher Typ über welchen Kanal)"} },
  { code: "VIEW_LIVE_STREAM", objectTypeCode: "EVENT", category: "Live", names: {"th":"ดูถ่ายทอดสด","en":"View live stream links","ja":"ライブ配信リンクを表示", "es":"Ver los enlaces de la retransmisión", "pt":"Ver os links da transmissão", "fr":"Voir les liens de diffusion", "de":"Links zur Live-Übertragung ansehen"} },
  { code: "VIEW_COURT_STATUS_BOARD", objectTypeCode: "EVENT", category: "Live", names: {"th":"ดูกระดานสถานะสนาม","en":"View court status board","ja":"コート状況ボードを表示", "es":"Ver el panel de estado de las pistas", "pt":"Ver o painel de situação das quadras", "fr":"Voir le tableau d’état des terrains", "de":"Feldstatus-Tafel ansehen"} },
  { code: "AI_BRACKET_SUGGESTIONS", objectTypeCode: "EVENT", category: "AI", names: {"th":"คำแนะนำสายแข่งขัน","en":"AI bracket suggestions","ja":"AIによるトーナメント表の提案", "es":"Sugerencias de cuadro con IA", "pt":"Sugestões de chaveamento com IA", "fr":"Suggestions de tableau par IA", "de":"KI-Vorschläge für den Turnierbaum"} },
  { code: "VIEW_ORG", objectTypeCode: "ORG", category: "Organisation", names: {"th":"ดูโปรไฟล์องค์กร","en":"View organisation profile","ja":"団体プロフィールを表示", "es":"Ver el perfil de la organización", "pt":"Ver o perfil da organização", "fr":"Voir le profil de l’organisation", "de":"Organisationsprofil ansehen"} },
  { code: "EDIT_ORG_PROFILE", objectTypeCode: "ORG", category: "Organisation", names: {"th":"แก้ไขโปรไฟล์องค์กร","en":"Edit organisation profile","ja":"団体プロフィールを編集", "es":"Editar el perfil de la organización", "pt":"Editar o perfil da organização", "fr":"Modifier le profil de l’organisation", "de":"Organisationsprofil bearbeiten"} },
  { code: "INVITE_ORG_MEMBER", objectTypeCode: "ORG", category: "Organisation", names: {"th":"เชิญสมาชิกเข้าองค์กร","en":"Invite someone to an organisation","ja":"団体にメンバーを招待", "es":"Invitar a alguien a una organización", "pt":"Convidar alguém para uma organização", "fr":"Inviter quelqu’un dans une organisation", "de":"Jemanden in eine Organisation einladen"} },
  { code: "REMOVE_ORG_MEMBER", objectTypeCode: "ORG", category: "Organisation", names: {"th":"นำสมาชิกออกจากองค์กร","en":"Remove someone from an organisation","ja":"団体からメンバーを削除", "es":"Quitar a alguien de una organización", "pt":"Remover alguém de uma organização", "fr":"Retirer quelqu’un d’une organisation", "de":"Jemanden aus einer Organisation entfernen"} },
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
  { code: "U10", minAge: null, maxAge: 10, names: {"th":"อายุไม่เกิน 10 ปี","en":"Under 10","ja":"10歳以下", "es":"Sub-10", "pt":"Sub-10", "fr":"U10", "de":"U10"} },
  { code: "U12", minAge: null, maxAge: 12, names: {"th":"อายุไม่เกิน 12 ปี","en":"Under 12","ja":"12歳以下", "es":"Sub-12", "pt":"Sub-12", "fr":"U12", "de":"U12"} },
  { code: "U14", minAge: null, maxAge: 14, names: {"th":"อายุไม่เกิน 14 ปี","en":"Under 14","ja":"14歳以下", "es":"Sub-14", "pt":"Sub-14", "fr":"U14", "de":"U14"} },
  { code: "U16", minAge: null, maxAge: 16, names: {"th":"อายุไม่เกิน 16 ปี","en":"Under 16","ja":"16歳以下", "es":"Sub-16", "pt":"Sub-16", "fr":"U16", "de":"U16"} },
  { code: "U18", minAge: null, maxAge: 18, names: {"th":"อายุไม่เกิน 18 ปี","en":"Under 18","ja":"18歳以下", "es":"Sub-18", "pt":"Sub-18", "fr":"U18", "de":"U18"} },
  { code: "U21", minAge: null, maxAge: 21, names: {"th":"อายุไม่เกิน 21 ปี","en":"Under 21","ja":"21歳以下", "es":"Sub-21", "pt":"Sub-21", "fr":"U21", "de":"U21"} },
  { code: "OPEN", minAge: null, maxAge: null, names: {"th":"เปิดอายุ","en":"Open Age","ja":"年齢制限なし", "es":"Absoluta", "pt":"Adulto", "fr":"Senior", "de":"Aktive"} },
  { code: "SENIOR", minAge: 30, maxAge: null, names: {"th":"อาวุโส","en":"Senior","ja":"シニア", "es":"Absoluta", "pt":"Adulto", "fr":"Senior", "de":"Aktive"} },
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
  { code: "BKK", names: {"th":"กรุงเทพมหานคร","en":"Bangkok","ja":"バンコク", "es":"Bangkok", "pt":"Bangkok", "fr":"Bangkok", "de":"Bangkok"} },
  { code: "NBI", names: {"th":"นนทบุรี","en":"Nonthaburi","ja":"ノンタブリー", "es":"Nonthaburi", "pt":"Nonthaburi", "fr":"Nonthaburi", "de":"Nonthaburi"} },
  { code: "CMI", names: {"th":"เชียงใหม่","en":"Chiang Mai","ja":"チェンマイ", "es":"Chiang Mai", "pt":"Chiang Mai", "fr":"Chiang Mai", "de":"Chiang Mai"} },
  { code: "CRI", names: {"th":"เชียงราย","en":"Chiang Rai","ja":"チェンライ", "es":"Chiang Rai", "pt":"Chiang Rai", "fr":"Chiang Rai", "de":"Chiang Rai"} },
  { code: "NMA", names: {"th":"นครราชสีมา","en":"Nakhon Ratchasima","ja":"ナコンラーチャシーマー", "es":"Nakhon Ratchasima", "pt":"Nakhon Ratchasima", "fr":"Nakhon Ratchasima", "de":"Nakhon Ratchasima"} },
  { code: "KKN", names: {"th":"ขอนแก่น","en":"Khon Kaen","ja":"コーンケン", "es":"Khon Kaen", "pt":"Khon Kaen", "fr":"Khon Kaen", "de":"Khon Kaen"} },
  { code: "UBN", names: {"th":"อุบลราชธานี","en":"Ubon Ratchathani","ja":"ウボンラーチャターニー", "es":"Ubon Ratchathani", "pt":"Ubon Ratchathani", "fr":"Ubon Ratchathani", "de":"Ubon Ratchathani"} },
  { code: "UDN", names: {"th":"อุดรธานี","en":"Udon Thani","ja":"ウドンターニー", "es":"Udon Thani", "pt":"Udon Thani", "fr":"Udon Thani", "de":"Udon Thani"} },
  { code: "CBI", names: {"th":"ชลบุรี","en":"Chonburi","ja":"チョンブリー", "es":"Chonburi", "pt":"Chonburi", "fr":"Chonburi", "de":"Chonburi"} },
  { code: "PHK", names: {"th":"ภูเก็ต","en":"Phuket","ja":"プーケット", "es":"Phuket", "pt":"Phuket", "fr":"Phuket", "de":"Phuket"} },
  { code: "SKA", names: {"th":"สงขลา","en":"Songkhla","ja":"ソンクラー", "es":"Songkhla", "pt":"Songkhla", "fr":"Songkhla", "de":"Songkhla"} },
  { code: "NST", names: {"th":"นครศรีธรรมราช","en":"Nakhon Si Thammarat","ja":"ナコンシータンマラート", "es":"Nakhon Si Thammarat", "pt":"Nakhon Si Thammarat", "fr":"Nakhon Si Thammarat", "de":"Nakhon Si Thammarat"} },
  { code: "SNI", names: {"th":"สุราษฎร์ธานี","en":"Surat Thani","ja":"スラートターニー", "es":"Surat Thani", "pt":"Surat Thani", "fr":"Surat Thani", "de":"Surat Thani"} },
  { code: "RBR", names: {"th":"ราชบุรี","en":"Ratchaburi","ja":"ラーチャブリー", "es":"Ratchaburi", "pt":"Ratchaburi", "fr":"Ratchaburi", "de":"Ratchaburi"} },
  { code: "PTE", names: {"th":"ปทุมธานี","en":"Pathum Thani","ja":"パトゥムターニー", "es":"Pathum Thani", "pt":"Pathum Thani", "fr":"Pathum Thani", "de":"Pathum Thani"} },
  { code: "ACR", names: {"th":"อำนาจเจริญ","en":"Amnat Charoen","ja":"アムナートチャルーン", "es":"Amnat Charoen", "pt":"Amnat Charoen", "fr":"Amnat Charoen", "de":"Amnat Charoen"} },
  { code: "ATG", names: {"th":"อ่างทอง","en":"Ang Thong","ja":"アーントーン", "es":"Ang Thong", "pt":"Ang Thong", "fr":"Ang Thong", "de":"Ang Thong"} },
  { code: "AYA", names: {"th":"พระนครศรีอยุธยา","en":"Phra Nakhon Si Ayutthaya","ja":"アユタヤ", "es":"Phra Nakhon Si Ayutthaya", "pt":"Phra Nakhon Si Ayutthaya", "fr":"Phra Nakhon Si Ayutthaya", "de":"Phra Nakhon Si Ayutthaya"} },
  { code: "BKN", names: {"th":"บึงกาฬ","en":"Bueng Kan","ja":"ブンカーン", "es":"Bueng Kan", "pt":"Bueng Kan", "fr":"Bueng Kan", "de":"Bueng Kan"} },
  { code: "BRM", names: {"th":"บุรีรัมย์","en":"Buriram","ja":"ブリーラム", "es":"Buriram", "pt":"Buriram", "fr":"Buriram", "de":"Buriram"} },
  { code: "CCO", names: {"th":"ฉะเชิงเทรา","en":"Chachoengsao","ja":"チャチューンサオ", "es":"Chachoengsao", "pt":"Chachoengsao", "fr":"Chachoengsao", "de":"Chachoengsao"} },
  { code: "CNT", names: {"th":"ชัยนาท","en":"Chai Nat","ja":"チャイナート", "es":"Chai Nat", "pt":"Chai Nat", "fr":"Chai Nat", "de":"Chai Nat"} },
  { code: "CPM", names: {"th":"ชัยภูมิ","en":"Chaiyaphum","ja":"チャイヤプーム", "es":"Chaiyaphum", "pt":"Chaiyaphum", "fr":"Chaiyaphum", "de":"Chaiyaphum"} },
  { code: "CPN", names: {"th":"ชุมพร","en":"Chumphon","ja":"チュムポーン", "es":"Chumphon", "pt":"Chumphon", "fr":"Chumphon", "de":"Chumphon"} },
  { code: "CTI", names: {"th":"จันทบุรี","en":"Chanthaburi","ja":"チャンタブリー", "es":"Chanthaburi", "pt":"Chanthaburi", "fr":"Chanthaburi", "de":"Chanthaburi"} },
  { code: "KBI", names: {"th":"กระบี่","en":"Krabi","ja":"クラビー", "es":"Krabi", "pt":"Krabi", "fr":"Krabi", "de":"Krabi"} },
  { code: "KPT", names: {"th":"กำแพงเพชร","en":"Kamphaeng Phet","ja":"カムペーンペット", "es":"Kamphaeng Phet", "pt":"Kamphaeng Phet", "fr":"Kamphaeng Phet", "de":"Kamphaeng Phet"} },
  { code: "KRI", names: {"th":"กาญจนบุรี","en":"Kanchanaburi","ja":"カーンチャナブリー", "es":"Kanchanaburi", "pt":"Kanchanaburi", "fr":"Kanchanaburi", "de":"Kanchanaburi"} },
  { code: "KSN", names: {"th":"กาฬสินธุ์","en":"Kalasin","ja":"カーラシン", "es":"Kalasin", "pt":"Kalasin", "fr":"Kalasin", "de":"Kalasin"} },
  { code: "LEI", names: {"th":"เลย","en":"Loei","ja":"ルーイ", "es":"Loei", "pt":"Loei", "fr":"Loei", "de":"Loei"} },
  { code: "LPG", names: {"th":"ลำปาง","en":"Lampang","ja":"ランパーン", "es":"Lampang", "pt":"Lampang", "fr":"Lampang", "de":"Lampang"} },
  { code: "LPN", names: {"th":"ลำพูน","en":"Lamphun","ja":"ランプーン", "es":"Lamphun", "pt":"Lamphun", "fr":"Lamphun", "de":"Lamphun"} },
  { code: "LRI", names: {"th":"ลพบุรี","en":"Lopburi","ja":"ロッブリー", "es":"Lopburi", "pt":"Lopburi", "fr":"Lopburi", "de":"Lopburi"} },
  { code: "MDH", names: {"th":"มุกดาหาร","en":"Mukdahan","ja":"ムクダーハーン", "es":"Mukdahan", "pt":"Mukdahan", "fr":"Mukdahan", "de":"Mukdahan"} },
  { code: "MKM", names: {"th":"มหาสารคาม","en":"Maha Sarakham","ja":"マハーサーラカーム", "es":"Maha Sarakham", "pt":"Maha Sarakham", "fr":"Maha Sarakham", "de":"Maha Sarakham"} },
  { code: "MSN", names: {"th":"แม่ฮ่องสอน","en":"Mae Hong Son","ja":"メーホンソーン", "es":"Mae Hong Son", "pt":"Mae Hong Son", "fr":"Mae Hong Son", "de":"Mae Hong Son"} },
  { code: "NAN", names: {"th":"น่าน","en":"Nan","ja":"ナーン", "es":"Nan", "pt":"Nan", "fr":"Nan", "de":"Nan"} },
  { code: "NBP", names: {"th":"หนองบัวลำภู","en":"Nong Bua Lamphu","ja":"ノーンブアラムプー", "es":"Nong Bua Lamphu", "pt":"Nong Bua Lamphu", "fr":"Nong Bua Lamphu", "de":"Nong Bua Lamphu"} },
  { code: "NKI", names: {"th":"หนองคาย","en":"Nong Khai","ja":"ノーンカーイ", "es":"Nong Khai", "pt":"Nong Khai", "fr":"Nong Khai", "de":"Nong Khai"} },
  { code: "NPM", names: {"th":"นครพนม","en":"Nakhon Phanom","ja":"ナコンパノム", "es":"Nakhon Phanom", "pt":"Nakhon Phanom", "fr":"Nakhon Phanom", "de":"Nakhon Phanom"} },
  { code: "NPT", names: {"th":"นครปฐม","en":"Nakhon Pathom","ja":"ナコンパトム", "es":"Nakhon Pathom", "pt":"Nakhon Pathom", "fr":"Nakhon Pathom", "de":"Nakhon Pathom"} },
  { code: "NSN", names: {"th":"นครสวรรค์","en":"Nakhon Sawan","ja":"ナコンサワン", "es":"Nakhon Sawan", "pt":"Nakhon Sawan", "fr":"Nakhon Sawan", "de":"Nakhon Sawan"} },
  { code: "NWT", names: {"th":"นราธิวาส","en":"Narathiwat","ja":"ナラーティワート", "es":"Narathiwat", "pt":"Narathiwat", "fr":"Narathiwat", "de":"Narathiwat"} },
  { code: "NYK", names: {"th":"นครนายก","en":"Nakhon Nayok","ja":"ナコンナーヨック", "es":"Nakhon Nayok", "pt":"Nakhon Nayok", "fr":"Nakhon Nayok", "de":"Nakhon Nayok"} },
  { code: "PBI", names: {"th":"เพชรบุรี","en":"Phetchaburi","ja":"ペッチャブリー", "es":"Phetchaburi", "pt":"Phetchaburi", "fr":"Phetchaburi", "de":"Phetchaburi"} },
  { code: "PCT", names: {"th":"พิจิตร","en":"Phichit","ja":"ピチット", "es":"Phichit", "pt":"Phichit", "fr":"Phichit", "de":"Phichit"} },
  { code: "PLG", names: {"th":"พัทลุง","en":"Phatthalung","ja":"パッタルン", "es":"Phatthalung", "pt":"Phatthalung", "fr":"Phatthalung", "de":"Phatthalung"} },
  { code: "PLK", names: {"th":"พิษณุโลก","en":"Phitsanulok","ja":"ピサヌローク", "es":"Phitsanulok", "pt":"Phitsanulok", "fr":"Phitsanulok", "de":"Phitsanulok"} },
  { code: "PNA", names: {"th":"พังงา","en":"Phang Nga","ja":"パンガー", "es":"Phang Nga", "pt":"Phang Nga", "fr":"Phang Nga", "de":"Phang Nga"} },
  { code: "PNB", names: {"th":"เพชรบูรณ์","en":"Phetchabun","ja":"ペッチャブーン", "es":"Phetchabun", "pt":"Phetchabun", "fr":"Phetchabun", "de":"Phetchabun"} },
  { code: "PRE", names: {"th":"แพร่","en":"Phrae","ja":"プレー", "es":"Phrae", "pt":"Phrae", "fr":"Phrae", "de":"Phrae"} },
  { code: "PRI", names: {"th":"ปราจีนบุรี","en":"Prachinburi","ja":"プラーチーンブリー", "es":"Prachinburi", "pt":"Prachinburi", "fr":"Prachinburi", "de":"Prachinburi"} },
  { code: "PKN", names: {"th":"ประจวบคีรีขันธ์","en":"Prachuap Khiri Khan","ja":"プラチュワップキーリーカン", "es":"Prachuap Khiri Khan", "pt":"Prachuap Khiri Khan", "fr":"Prachuap Khiri Khan", "de":"Prachuap Khiri Khan"} },
  { code: "PTN", names: {"th":"ปัตตานี","en":"Pattani","ja":"パッタニー", "es":"Pattani", "pt":"Pattani", "fr":"Pattani", "de":"Pattani"} },
  { code: "PYO", names: {"th":"พะเยา","en":"Phayao","ja":"パヤオ", "es":"Phayao", "pt":"Phayao", "fr":"Phayao", "de":"Phayao"} },
  { code: "RET", names: {"th":"ร้อยเอ็ด","en":"Roi Et","ja":"ローイエット", "es":"Roi Et", "pt":"Roi Et", "fr":"Roi Et", "de":"Roi Et"} },
  { code: "RNG", names: {"th":"ระนอง","en":"Ranong","ja":"ラノーン", "es":"Ranong", "pt":"Ranong", "fr":"Ranong", "de":"Ranong"} },
  { code: "RYG", names: {"th":"ระยอง","en":"Rayong","ja":"ラヨーン", "es":"Rayong", "pt":"Rayong", "fr":"Rayong", "de":"Rayong"} },
  { code: "SBR", names: {"th":"สิงห์บุรี","en":"Sing Buri","ja":"シンブリー", "es":"Sing Buri", "pt":"Sing Buri", "fr":"Sing Buri", "de":"Sing Buri"} },
  { code: "SKM", names: {"th":"สมุทรสงคราม","en":"Samut Songkhram","ja":"サムットソンクラーム", "es":"Samut Songkhram", "pt":"Samut Songkhram", "fr":"Samut Songkhram", "de":"Samut Songkhram"} },
  { code: "SKN", names: {"th":"สมุทรสาคร","en":"Samut Sakhon","ja":"サムットサーコーン", "es":"Samut Sakhon", "pt":"Samut Sakhon", "fr":"Samut Sakhon", "de":"Samut Sakhon"} },
  { code: "SKW", names: {"th":"สระแก้ว","en":"Sa Kaeo","ja":"サケーオ", "es":"Sa Kaeo", "pt":"Sa Kaeo", "fr":"Sa Kaeo", "de":"Sa Kaeo"} },
  { code: "SNK", names: {"th":"สกลนคร","en":"Sakon Nakhon","ja":"サコンナコン", "es":"Sakon Nakhon", "pt":"Sakon Nakhon", "fr":"Sakon Nakhon", "de":"Sakon Nakhon"} },
  { code: "SPB", names: {"th":"สุพรรณบุรี","en":"Suphan Buri","ja":"スパンブリー", "es":"Suphan Buri", "pt":"Suphan Buri", "fr":"Suphan Buri", "de":"Suphan Buri"} },
  { code: "SPK", names: {"th":"สมุทรปราการ","en":"Samut Prakan","ja":"サムットプラーカーン", "es":"Samut Prakan", "pt":"Samut Prakan", "fr":"Samut Prakan", "de":"Samut Prakan"} },
  { code: "SRI", names: {"th":"สระบุรี","en":"Saraburi","ja":"サラブリー", "es":"Saraburi", "pt":"Saraburi", "fr":"Saraburi", "de":"Saraburi"} },
  { code: "SRN", names: {"th":"สุรินทร์","en":"Surin","ja":"スリン", "es":"Surin", "pt":"Surin", "fr":"Surin", "de":"Surin"} },
  { code: "SSK", names: {"th":"ศรีสะเกษ","en":"Sisaket","ja":"シーサケート", "es":"Sisaket", "pt":"Sisaket", "fr":"Sisaket", "de":"Sisaket"} },
  { code: "STI", names: {"th":"สุโขทัย","en":"Sukhothai","ja":"スコータイ", "es":"Sukhothai", "pt":"Sukhothai", "fr":"Sukhothai", "de":"Sukhothai"} },
  { code: "STN", names: {"th":"สตูล","en":"Satun","ja":"サトゥーン", "es":"Satun", "pt":"Satun", "fr":"Satun", "de":"Satun"} },
  { code: "TAK", names: {"th":"ตาก","en":"Tak","ja":"ターク", "es":"Tak", "pt":"Tak", "fr":"Tak", "de":"Tak"} },
  { code: "TRG", names: {"th":"ตรัง","en":"Trang","ja":"トラン", "es":"Trang", "pt":"Trang", "fr":"Trang", "de":"Trang"} },
  { code: "TRT", names: {"th":"ตราด","en":"Trat","ja":"トラート", "es":"Trat", "pt":"Trat", "fr":"Trat", "de":"Trat"} },
  { code: "UTI", names: {"th":"อุทัยธานี","en":"Uthai Thani","ja":"ウタイターニー", "es":"Uthai Thani", "pt":"Uthai Thani", "fr":"Uthai Thani", "de":"Uthai Thani"} },
  { code: "UTT", names: {"th":"อุตรดิตถ์","en":"Uttaradit","ja":"ウッタラディット", "es":"Uttaradit", "pt":"Uttaradit", "fr":"Uttaradit", "de":"Uttaradit"} },
  { code: "YLA", names: {"th":"ยะลา","en":"Yala","ja":"ヤラー", "es":"Yala", "pt":"Yala", "fr":"Yala", "de":"Yala"} },
  { code: "YST", names: {"th":"ยโสธร","en":"Yasothon","ja":"ヤソートーン", "es":"Yasothon", "pt":"Yasothon", "fr":"Yasothon", "de":"Yasothon"} },
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
  { code: "BANGKOK", provinceCode: "BKK", names: {"th":"กรุงเทพมหานคร","en":"Bangkok","ja":"バンコク", "es":"Bangkok", "pt":"Bangkok", "fr":"Bangkok", "de":"Bangkok"} },
  { code: "CHIANG_MAI", provinceCode: "CMI", names: {"th":"เชียงใหม่","en":"Chiang Mai","ja":"チェンマイ", "es":"Chiang Mai", "pt":"Chiang Mai", "fr":"Chiang Mai", "de":"Chiang Mai"} },
] as const

export const CITY_CODES = CITY.map((t) => t.code) as unknown as [
  "BANGKOK",
  "CHIANG_MAI",
]

export type CityCode = (typeof CITY_CODES)[number]

/** 3 rows, from coach_roles.jsonl. */
export const COACH_ROLE = [
  { code: "HEAD", names: {"th":"หัวหน้าผู้ฝึกสอน","en":"Head Coach","ja":"ヘッドコーチ", "es":"Primer entrenador", "pt":"Técnico principal", "fr":"Entraîneur principal", "de":"Cheftrainer"} },
  { code: "ASSISTANT", names: {"th":"ผู้ช่วยผู้ฝึกสอน","en":"Assistant Coach","ja":"アシスタントコーチ", "es":"Entrenador ayudante", "pt":"Técnico assistente", "fr":"Entraîneur adjoint", "de":"Co-Trainer"} },
  { code: "MANAGER", names: {"th":"ผู้จัดการทีม","en":"Team Manager","ja":"チームマネージャー", "es":"Delegado del equipo", "pt":"Gerente do time", "fr":"Responsable d’équipe", "de":"Teammanager"} },
] as const

export const COACH_ROLE_CODES = COACH_ROLE.map((t) => t.code) as unknown as [
  "HEAD",
  "ASSISTANT",
  "MANAGER",
]

export type CoachRoleCode = (typeof COACH_ROLE_CODES)[number]

/** 2 rows, from event_formats.jsonl. */
export const EVENT_FORMAT = [
  { code: "5x5", names: {"th":"5 ต่อ 5","en":"5-on-5","ja":"5人制", "es":"5 contra 5", "pt":"5 contra 5", "fr":"5 contre 5", "de":"5 gegen 5"} },
  { code: "3x3", names: {"th":"3 ต่อ 3","en":"3x3","ja":"3x3", "es":"3x3", "pt":"3x3", "fr":"3x3", "de":"3x3"} },
] as const

export const EVENT_FORMAT_CODES = EVENT_FORMAT.map((t) => t.code) as unknown as [
  "5x5",
  "3x3",
]

export type EventFormatCode = (typeof EVENT_FORMAT_CODES)[number]

/** 4 rows, from event_types.jsonl. */
export const EVENT_TYPE = [
  { code: "TOURNAMENT", names: {"th":"การแข่งขันแบบทัวร์นาเมนต์","en":"Tournament","ja":"トーナメント", "es":"Torneo", "pt":"Torneio", "fr":"Tournoi", "de":"Turnier"}, descriptions: {"th":"การแข่งขันแบบแบ่งสายและคัดออกจนได้ผู้ชนะที่ประกาศอย่างเป็นทางการ","en":"Bracketed competition with elimination rounds and a declared winner","ja":"勝ち抜き形式で優勝者を決める大会", "es":"Competición por cuadro con rondas eliminatorias y un ganador", "pt":"Competição em chaves com fases eliminatórias e um campeão", "fr":"Compétition à tableau avec tours à élimination et un vainqueur désigné", "de":"Wettbewerb im Turnierbaum mit K.-o.-Runden und einem Sieger"} },
  { code: "LEAGUE", names: {"th":"ลีก","en":"League","ja":"リーグ", "es":"Liga", "pt":"Liga", "fr":"Championnat", "de":"Liga"}, descriptions: {"th":"ฤดูกาลแข่งขันต่อเนื่อง ทีมแข่งขันตามรอบที่กำหนดและสะสมคะแนน","en":"Recurring season — teams play scheduled rounds and accumulate points","ja":"シーズン制 — 各チームが節ごとに対戦し勝点を積み上げる", "es":"Temporada regular: los equipos juegan jornadas programadas y suman puntos", "pt":"Temporada regular: os times jogam rodadas agendadas e somam pontos", "fr":"Saison régulière : les équipes jouent des journées programmées et cumulent des points", "de":"Laufende Saison: Teams spielen angesetzte Runden und sammeln Punkte"} },
  { code: "CAMP", names: {"th":"ค่ายฝึก","en":"Camp / Clinic","ja":"キャンプ / クリニック", "es":"Campus / clínic", "pt":"Clínica", "fr":"Stage", "de":"Camp"}, descriptions: {"th":"กิจกรรมฝึกทักษะเพื่อพัฒนาความสามารถ ไม่ใช่การแข่งขัน","en":"Training event — skill development not competition","ja":"練習イベント — 競技ではなく技術の向上が目的", "es":"Evento de formación: desarrollo técnico, no competición", "pt":"Evento de treinamento: desenvolvimento técnico, não competição", "fr":"Événement de formation : développement technique, pas compétition", "de":"Trainingsveranstaltung: technische Entwicklung, kein Wettbewerb"} },
  { code: "SHOWCASE", names: {"th":"การโชว์ผู้เล่น","en":"Showcase","ja":"ショーケース", "es":"Exhibición", "pt":"Showcase", "fr":"Showcase", "de":"Showcase"}, descriptions: {"th":"กิจกรรมแสดงผลงานเพื่อสร้างโอกาสให้แมวมอง ผู้สรรหา และสื่อเห็นผู้เล่น","en":"Exhibition event for visibility — scouts recruiters media","ja":"露出のためのエキシビション — スカウト・リクルーター・メディア向け", "es":"Evento de exhibición para dar visibilidad: ojeadores, reclutadores y medios", "pt":"Evento de exibição para dar visibilidade: olheiros, recrutadores e imprensa", "fr":"Événement d’exhibition pour la visibilité : recruteurs, scouts et médias", "de":"Showcase für Sichtbarkeit: Scouts, Recruiter und Medien"} },
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
  { code: "SCHEDULED", names: {"th":"รอแข่งขัน","en":"Upcoming","ja":"開始前", "es":"Próximo", "pt":"Em breve", "fr":"À venir", "de":"Bevorstehend"} },
  { code: "LIVE", names: {"th":"กำลังแข่ง","en":"Live","ja":"試合中", "es":"En directo", "pt":"Ao vivo", "fr":"En direct", "de":"Live"} },
  { code: "HALF_TIME", names: {"th":"พักครึ่ง","en":"Half-time","ja":"ハーフタイム", "es":"Descanso", "pt":"Intervalo", "fr":"Mi-temps", "de":"Halbzeit"} },
  { code: "FINISHED", names: {"th":"จบการแข่งขัน","en":"Finished","ja":"終了", "es":"Finalizado", "pt":"Encerrado", "fr":"Terminé", "de":"Beendet"} },
] as const

export const GAME_STATUS_CODES = GAME_STATUS.map((t) => t.code) as unknown as [
  "SCHEDULED",
  "LIVE",
  "HALF_TIME",
  "FINISHED",
]

export type GameStatusCode = (typeof GAME_STATUS_CODES)[number]

export const GENDER = [
  { code: "M", names: {"th":"ชาย","en":"Boys","ja":"男子", "es":"Masculino", "pt":"Masculino", "fr":"Masculin", "de":"Männlich"} },
  { code: "F", names: {"th":"หญิง","en":"Girls","ja":"女子", "es":"Femenino", "pt":"Feminino", "fr":"Féminin", "de":"Weiblich"} },
  { code: "COED", names: {"th":"ผสม","en":"Co-ed","ja":"混合", "es":"Mixto", "pt":"Misto", "fr":"Mixte", "de":"Gemischt"} },
] as const

export const GENDER_CODES = GENDER.map((t) => t.code) as unknown as [
  "M",
  "F",
  "COED",
]

export type GenderCode = (typeof GENDER_CODES)[number]

/** 4 rows, from guardian_types.jsonl. */
export const GUARDIAN_TYPE = [
  { code: "PARENT", names: {"th":"ผู้ปกครอง","en":"Parent","ja":"親", "es":"Padre o madre", "pt":"Pai ou mãe", "fr":"Parent", "de":"Elternteil"} },
  { code: "GRANDPARENT", names: {"th":"ปู่ย่าตายาย","en":"Grandparent","ja":"祖父母", "es":"Abuelo o abuela", "pt":"Avô ou avó", "fr":"Grand-parent", "de":"Großelternteil"} },
  { code: "LEGAL_GUARDIAN", names: {"th":"ผู้ดูแล","en":"Legal Guardian","ja":"法定後見人", "es":"Tutor legal", "pt":"Responsável legal", "fr":"Tuteur légal", "de":"Gesetzlicher Vormund"} },
  { code: "OTHER", names: {"th":"อื่นๆ","en":"Other","ja":"その他", "es":"Otro", "pt":"Outro", "fr":"Autre", "de":"Sonstige"} },
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
  { code: "PENDING", names: {"th":"รอการตอบรับ","en":"Pending","ja":"保留中", "es":"Pendiente", "pt":"Pendente", "fr":"En attente", "de":"Offen"} },
  { code: "ACCEPTED", names: {"th":"ตอบรับแล้ว","en":"Accepted","ja":"承認済み", "es":"Aceptada", "pt":"Aceito", "fr":"Acceptée", "de":"Angenommen"} },
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
  { code: "th", status: "released", endonym: "ไทย", names: {"th":"ไทย","en":"Thai","ja":"タイ語", "es":"Thai", "pt":"Thai", "fr":"Thai", "de":"Thai"} },
  { code: "en", status: "released", endonym: "English", names: {"th":"อังกฤษ","en":"English","ja":"英語", "es":"English", "pt":"English", "fr":"English", "de":"English"} },
  { code: "ja", status: "released", endonym: "日本語", names: {"th":"ญี่ปุ่น","en":"Japanese","ja":"日本語", "es":"Japanese", "pt":"Japanese", "fr":"Japanese", "de":"Japanese"} },
  { code: "zh", status: "draft", endonym: "简体中文", names: {"th":"จีน","en":"Chinese","ja":"中国語", "es":"Chinese", "pt":"Chinese", "fr":"Chinese", "de":"Chinese"} },
  { code: "es", status: "released", endonym: "Español", names: {"th":"สเปน","en":"Spanish","ja":"スペイン語", "es":"Spanish", "pt":"Spanish", "fr":"Spanish", "de":"Spanish"} },
  { code: "pt", status: "released", endonym: "Português", names: {"th":"โปรตุเกส","en":"Portuguese","ja":"ポルトガル語", "es":"Portuguese", "pt":"Portuguese", "fr":"Portuguese", "de":"Portuguese"} },
  { code: "id", status: "draft", endonym: "Bahasa Indonesia", names: {"th":"อินโดนีเซีย","en":"Indonesian","ja":"インドネシア語", "es":"Indonesian", "pt":"Indonesian", "fr":"Indonesian", "de":"Indonesian"} },
  { code: "fr", status: "released", endonym: "Français", names: {"th":"ฝรั่งเศส","en":"French","ja":"フランス語", "es":"French", "pt":"French", "fr":"French", "de":"French"} },
  { code: "tl", status: "draft", endonym: "Filipino", names: {"th":"ฟิลิปปินส์","en":"Filipino","ja":"フィリピン語", "es":"Filipino", "pt":"Filipino", "fr":"Filipino", "de":"Filipino"} },
  { code: "vi", status: "draft", endonym: "Tiếng Việt", names: {"th":"เวียดนาม","en":"Vietnamese","ja":"ベトナム語", "es":"Vietnamese", "pt":"Vietnamese", "fr":"Vietnamese", "de":"Vietnamese"} },
  { code: "ko", status: "draft", endonym: "한국어", names: {"th":"เกาหลี","en":"Korean","ja":"韓国語", "es":"Korean", "pt":"Korean", "fr":"Korean", "de":"Korean"} },
  { code: "de", status: "released", endonym: "Deutsch", names: {"th":"เยอรมัน","en":"German","ja":"ドイツ語", "es":"German", "pt":"German", "fr":"German", "de":"German"} },
  { code: "ru", status: "draft", endonym: "Русский", names: {"th":"รัสเซีย","en":"Russian","ja":"ロシア語", "es":"Russian", "pt":"Russian", "fr":"Russian", "de":"Russian"} },
] as const

export const LOCALE_CODES = LOCALE.map((t) => t.code) as unknown as [
  "th",
  "en",
  "ja",
]

export type LocaleCode = (typeof LOCALE_CODES)[number]

/** 8 rows, from notification_categories.jsonl. */
export const NOTIFICATION_CATEGORY = [
  { code: "LIVE", names: {"th":"สด","en":"Live","ja":"ライブ", "es":"En directo", "pt":"Ao vivo", "fr":"En direct", "de":"Live"} },
  { code: "REMINDER", names: {"th":"เตือนความจำ","en":"Reminder","ja":"リマインダー", "es":"Recordatorio", "pt":"Lembrete", "fr":"Rappel", "de":"Erinnerung"} },
  { code: "MEETING", names: {"th":"การประชุม","en":"Meeting","ja":"ミーティング", "es":"Reunión", "pt":"Reunião", "fr":"Réunion", "de":"Meeting"} },
  { code: "DISCOVERY", names: {"th":"ค้นพบ","en":"Discovery","ja":"発見", "es":"Descubrimiento", "pt":"Descoberta", "fr":"Découverte", "de":"Entdecken"} },
  { code: "TEAM", names: {"th":"ทีม","en":"Team","ja":"チーム", "es":"Equipo", "pt":"Time", "fr":"Équipe", "de":"Team"} },
  { code: "REGISTRATION", names: {"th":"การสมัคร","en":"Registration","ja":"登録", "es":"Inscripción", "pt":"Inscrição", "fr":"Inscription", "de":"Meldung"} },
  { code: "DIGEST", names: {"th":"สรุป","en":"Digest","ja":"ダイジェスト", "es":"Resúmenes", "pt":"Resumos", "fr":"Résumés", "de":"Zusammenfassungen"} },
  { code: "ANNOUNCEMENT", names: {"th":"ประกาศ","en":"Announcement","ja":"お知らせ", "es":"Aviso", "pt":"Aviso", "fr":"Annonce", "de":"Ankündigung"} },
  { code: "WORKFLOW", names: {"th":"ขั้นตอนดำเนินการ","en":"Workflow","ja":"ワークフロー", "es":"Flujo de trabajo", "pt":"Fluxo de trabalho", "fr":"Flux de travail", "de":"Ablauf"} },
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
  { code: "LINE", addressFormat: "LINE personal ID or LINE Official Account user ID", names: {"th":"ไลน์","en":"LINE","ja":"LINE", "es":"LINE", "pt":"LINE", "fr":"LINE", "de":"LINE"}, descriptions: {"th":"ช่องทางรับส่งข้อความหลักในประเทศไทย มีการใช้งานมากกว่า 90 เปอร์เซ็นต์และมีการมีส่วนร่วมสูงสุด","en":"Dominant messaging channel in Thailand (90%+ penetration). Highest engagement.","ja":"タイで圧倒的に使われているメッセージ手段（普及率90%以上）。反応率が最も高い。", "es":"Canal de mensajería dominante en Tailandia (más del 90 % de penetración). La mayor interacción.", "pt":"Canal de mensagens dominante na Tailândia (mais de 90 % de penetração). O maior engajamento.", "fr":"Canal de messagerie dominant en Thaïlande (plus de 90 % de pénétration). Le meilleur engagement.", "de":"Dominanter Messenger in Thailand (über 90 % Verbreitung). Höchste Beteiligung."} },
  { code: "EMAIL", addressFormat: "RFC 5322 email address", names: {"th":"อีเมล","en":"Email","ja":"メール", "es":"Correo", "pt":"E-mail", "fr":"E-mail", "de":"E-Mail"}, descriptions: {"th":"ใช้ได้ทั่วไปแต่มีการมีส่วนร่วมในไทยต่ำกว่า เหมาะสำหรับสรุปข้อมูลและใบเสร็จ","en":"Universal but lower engagement in Thailand. Good for digests and receipts.","ja":"誰でも使えるがタイでは反応率が低い。ダイジェストや控えの送付に適する。", "es":"Universal pero con menos interacción en Tailandia. Bueno para resúmenes y comprobantes.", "pt":"Universal mas com menos engajamento na Tailândia. Bom para resumos e comprovantes.", "fr":"Universel mais moins d’engagement en Thaïlande. Bien pour les résumés et les reçus.", "de":"Überall verfügbar, in Thailand aber mit geringerer Beteiligung. Gut für Zusammenfassungen und Belege."} },
  { code: "SMS", addressFormat: "E.164 phone number", names: {"th":"เอสเอ็มเอส","en":"SMS","ja":"SMS", "es":"SMS", "pt":"SMS", "fr":"SMS", "de":"SMS"}, descriptions: {"th":"ส่งถึงผู้รับได้อย่างน่าเชื่อถือ แต่มีค่าใช้จ่ายต่อข้อความ เหมาะสำหรับรหัส OTP และการแจ้งเตือนสำคัญ","en":"Reliable delivery; cost per message. Good for OTP and critical alerts.","ja":"確実に届くが1通ごとに費用がかかる。認証コードや重要な通知に適する。", "es":"Entrega fiable; coste por mensaje. Bueno para códigos de un solo uso y avisos críticos.", "pt":"Entrega confiável; custo por mensagem. Bom para códigos de uso único e avisos críticos.", "fr":"Remise fiable ; coût par message. Bien pour les codes à usage unique et les alertes critiques.", "de":"Zuverlässige Zustellung; Kosten pro Nachricht. Gut für Einmalcodes und kritische Hinweise."} },
  { code: "PUSH", addressFormat: "Web Push subscription token (PWA)", names: {"th":"การแจ้งเตือนแบบ Push","en":"Push","ja":"プッシュ通知", "es":"Push", "pt":"Push", "fr":"Push", "de":"Push"}, descriptions: {"th":"ต้องติดตั้ง PWA ไม่มีค่าใช้จ่ายเมื่อใช้งานในปริมาณมาก แต่การเข้าถึงยังจำกัดจนกว่าจะมีผู้ติดตั้งเพิ่ม","en":"Requires PWA installation. Free at scale; limited reach until adoption grows.","ja":"PWAのインストールが必要。大量配信でも無料だが、普及するまで届く範囲は限られる。", "es":"Requiere instalar la PWA. Gratis a gran escala; alcance limitado hasta que crezca su adopción.", "pt":"Exige instalar o PWA. Gratuito em escala; alcance limitado até a adoção crescer.", "fr":"Nécessite d’installer la PWA. Gratuit à grande échelle ; portée limitée tant que l’adoption reste faible.", "de":"Erfordert die Installation der PWA. In großem Umfang kostenlos; begrenzte Reichweite, solange die Verbreitung klein ist."} },
  { code: "IN_APP", addressFormat: "Internal user ID (delivered when user opens app/site)", names: {"th":"การแจ้งเตือนในแอป","en":"In-app","ja":"アプリ内", "es":"En la aplicación", "pt":"No aplicativo", "fr":"Dans l’application", "de":"In der App"}, descriptions: {"th":"ใช้งานได้เสมอสำหรับผู้ที่ลงชื่อเข้าใช้ แต่จะแสดงเมื่อผู้ใช้กำลังใช้งานแอปหรือเว็บไซต์","en":"Always works for signed-in users; only seen when user is active.","ja":"ログイン中のユーザーには必ず届くが、利用中でなければ見られない。", "es":"Siempre funciona para quien ha iniciado sesión; solo se ve cuando la persona está activa.", "pt":"Sempre funciona para quem está conectado; só aparece quando a pessoa está ativa.", "fr":"Fonctionne toujours pour les personnes connectées ; visible uniquement quand la personne est active.", "de":"Gilt immer für angemeldete Personen; sichtbar nur, solange das Konto aktiv ist."} },
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
  { code: "MATCH_START", categoryCode: "LIVE", names: {"th":"เริ่มแข่งขัน","en":"Match Start","ja":"試合開始", "es":"Inicio del partido", "pt":"Início do jogo", "fr":"Début du match", "de":"Spielbeginn"}, descriptions: {"th":"การแข่งขันกำลังจะเริ่มต้น","en":"A match is starting now","ja":"試合が始まります", "es":"Un partido empieza ahora", "pt":"Um jogo está começando agora", "fr":"Un match commence maintenant", "de":"Ein Spiel beginnt jetzt"} },
  { code: "MATCH_END", categoryCode: "LIVE", names: {"th":"จบการแข่งขัน","en":"Match End","ja":"試合終了", "es":"Fin del partido", "pt":"Fim do jogo", "fr":"Fin du match", "de":"Spielende"}, descriptions: {"th":"การแข่งขันจบลงแล้วและมีผลคะแนนสุดท้าย","en":"A match has ended (final score available)","ja":"試合が終了しました（最終スコアあり）", "es":"Un partido ha terminado (resultado final disponible)", "pt":"Um jogo terminou (placar final disponível)", "fr":"Un match est terminé (score final disponible)", "de":"Ein Spiel ist beendet (Endstand verfügbar)"} },
  { code: "SCORE_UPDATE", categoryCode: "LIVE", names: {"th":"คะแนนเปลี่ยนแปลง","en":"Score Update","ja":"スコア更新", "es":"Cambio en el marcador", "pt":"Mudança no placar", "fr":"Changement de score", "de":"Ergebnisänderung"}, descriptions: {"th":"คะแนนเปลี่ยนแปลงระหว่างการแข่งขันสด","en":"Score changed during a live match","ja":"試合中にスコアが変わりました", "es":"El marcador ha cambiado durante un partido en directo", "pt":"O placar mudou durante um jogo ao vivo", "fr":"Le score a changé pendant un match en direct", "de":"Das Ergebnis hat sich während eines Live-Spiels geändert"} },
  { code: "MEETING_INVITE", categoryCode: "MEETING", names: {"th":"คำเชิญประชุม","en":"Meeting Invitation","ja":"ミーティングへの招待", "es":"Invitación a una reunión", "pt":"Convite para uma reunião", "fr":"Invitation à une réunion", "de":"Meeting-Einladung"}, descriptions: {"th":"มีคนเชิญคุณเข้าร่วมการประชุม","en":"Somebody invited you to a meeting","ja":"ミーティングに招待されました", "es":"Alguien te ha invitado a una reunión", "pt":"Alguém convidou você para uma reunião", "fr":"Quelqu’un vous a invité à une réunion", "de":"Jemand hat dich zu einem Meeting eingeladen"} },
  { code: "EVENT_REMINDER", categoryCode: "REMINDER", names: {"th":"เตือนความจำอีเวนต์","en":"Event Reminder","ja":"イベントのリマインダー", "es":"Recordatorio de evento", "pt":"Lembrete de evento", "fr":"Rappel d’événement", "de":"Event-Erinnerung"}, descriptions: {"th":"อีเวนต์กำลังจะเริ่มในอีกไม่นาน ก่อนเริ่ม 24 ชั่วโมงหรือ 1 ชั่วโมง","en":"An event is starting soon (24h or 1h before)","ja":"まもなくイベントが始まります（24時間前または1時間前）", "es":"Un evento empieza pronto (24 h o 1 h antes)", "pt":"Um evento começa em breve (24 h ou 1 h antes)", "fr":"Un événement commence bientôt (24 h ou 1 h avant)", "de":"Ein Event beginnt bald (24 Std. oder 1 Std. vorher)"} },
  { code: "EVENT_CREATED", categoryCode: "DISCOVERY", names: {"th":"อีเวนต์ใหม่","en":"Event Created","ja":"イベント作成", "es":"Evento creado", "pt":"Evento criado", "fr":"Événement créé", "de":"Event angelegt"}, descriptions: {"th":"มีการเผยแพร่อีเวนต์ใหม่ในขอบเขตที่คุณติดตาม","en":"A new event was published in your followed scope","ja":"フォロー中の範囲で新しいイベントが公開されました", "es":"Se ha publicado un evento nuevo en lo que sigues", "pt":"Um novo evento foi publicado no que você segue", "fr":"Un nouvel événement a été publié dans ce que vous suivez", "de":"In deinem Bereich wurde ein neues Event veröffentlicht"} },
  { code: "ROSTER_CHANGE", categoryCode: "TEAM", names: {"th":"เปลี่ยนแปลงรายชื่อผู้เล่น","en":"Roster Change","ja":"ロースター変更", "es":"Cambio de plantilla", "pt":"Mudança de elenco", "fr":"Changement d’effectif", "de":"Kaderänderung"}, descriptions: {"th":"รายชื่อผู้เล่นของทีมที่คุณติดตามมีการเปลี่ยนแปลง","en":"A followed team's roster changed","ja":"フォロー中のチームのロースターが変わりました", "es":"Ha cambiado la plantilla de un equipo que sigues", "pt":"O elenco de um time que você segue mudou", "fr":"L’effectif d’une équipe que vous suivez a changé", "de":"Der Kader eines Teams, dem du folgst, hat sich geändert"} },
  { code: "REGISTRATION_OPEN", categoryCode: "REGISTRATION", names: {"th":"เปิดลงทะเบียน","en":"Registration Open","ja":"参加受付開始", "es":"Inscripción abierta", "pt":"Inscrições abertas", "fr":"Inscriptions ouvertes", "de":"Meldung offen"}, descriptions: {"th":"เปิดรับลงทะเบียนอีเวนต์แล้ว","en":"Event registration is now open","ja":"イベントの参加受付が始まりました", "es":"La inscripción al evento ya está abierta", "pt":"As inscrições do evento estão abertas", "fr":"Les inscriptions à l’événement sont ouvertes", "de":"Die Meldung zum Event ist offen"} },
  { code: "REGISTRATION_CLOSING", categoryCode: "REGISTRATION", names: {"th":"ปิดลงทะเบียนเร็วๆนี้","en":"Registration Closing Soon","ja":"受付間もなく終了", "es":"La inscripción cierra pronto", "pt":"Inscrições fechando em breve", "fr":"Inscriptions bientôt closes", "de":"Meldung schließt bald"}, descriptions: {"th":"การลงทะเบียนอีเวนต์กำลังจะปิด","en":"Event registration is about to close","ja":"イベントの参加受付がまもなく締め切られます", "es":"La inscripción al evento está a punto de cerrarse", "pt":"As inscrições do evento estão prestes a fechar", "fr":"Les inscriptions à l’événement vont fermer", "de":"Die Meldung zum Event schließt bald"} },
  { code: "DAILY_DIGEST", categoryCode: "DIGEST", names: {"th":"สรุปประจำวัน","en":"Daily Digest","ja":"日次ダイジェスト", "es":"Resumen diario", "pt":"Resumo diário", "fr":"Résumé quotidien", "de":"Tageszusammenfassung"}, descriptions: {"th":"สรุปกิจกรรมที่คุณติดตามประจำวัน","en":"Daily summary of activity you follow","ja":"フォロー中の動きの1日のまとめ", "es":"Resumen diario de la actividad que sigues", "pt":"Resumo diário da atividade que você segue", "fr":"Résumé quotidien de l’activité que vous suivez", "de":"Tägliche Zusammenfassung dessen, dem du folgst"} },
  { code: "WEEKLY_DIGEST", categoryCode: "DIGEST", names: {"th":"สรุปประจำสัปดาห์","en":"Weekly Digest","ja":"週次ダイジェスト", "es":"Resumen semanal", "pt":"Resumo semanal", "fr":"Résumé hebdomadaire", "de":"Wochenzusammenfassung"}, descriptions: {"th":"สรุปกิจกรรมที่คุณติดตามประจำสัปดาห์","en":"Weekly summary of activity you follow","ja":"フォロー中の動きの1週間のまとめ", "es":"Resumen semanal de la actividad que sigues", "pt":"Resumo semanal da atividade que você segue", "fr":"Résumé hebdomadaire de l’activité que vous suivez", "de":"Wöchentliche Zusammenfassung dessen, dem du folgst"} },
  { code: "ANNOUNCEMENT", categoryCode: "ANNOUNCEMENT", names: {"th":"ประกาศ","en":"Announcement","ja":"お知らせ", "es":"Aviso", "pt":"Aviso", "fr":"Annonce", "de":"Ankündigung"}, descriptions: {"th":"ประกาศทั่วไปจากผู้จัดการแข่งขันหรือผู้ดูแลระบบ","en":"General announcement from an organizer or admin","ja":"主催者または管理者からのお知らせ", "es":"Aviso general de un organizador o administrador", "pt":"Aviso geral de um organizador ou administrador", "fr":"Annonce générale d’un organisateur ou d’un administrateur", "de":"Allgemeine Ankündigung eines Veranstalters oder Administrators"} },
  { code: "APPROVAL_REQUEST", categoryCode: "WORKFLOW", names: {"th":"คำขออนุมัติ","en":"Approval Request","ja":"承認依頼", "es":"Solicitud de aprobación", "pt":"Pedido de aprovação", "fr":"Demande d’approbation", "de":"Freigabeanfrage"}, descriptions: {"th":"ต้องดำเนินการโดยผู้ดูแลระบบ เช่น คำขอสมัครผู้ตัดสินที่รออนุมัติ","en":"Admin action needed (e.g. pending REFEREE signup)","ja":"管理者の対応が必要です（例：審判登録の申請）", "es":"Requiere acción de un administrador (por ejemplo, un alta de árbitro pendiente)", "pt":"Exige ação de um administrador (por exemplo, um cadastro de árbitro pendente)", "fr":"Action d’un administrateur requise (par exemple une inscription d’arbitre en attente)", "de":"Eine Administratoraktion ist nötig (z. B. eine offene Schiedsrichteranmeldung)"} },
  { code: "APPROVAL_GRANTED", categoryCode: "WORKFLOW", names: {"th":"ได้รับอนุมัติ","en":"Approval Granted","ja":"承認完了", "es":"Aprobación concedida", "pt":"Aprovação concedida", "fr":"Approbation accordée", "de":"Freigabe erteilt"}, descriptions: {"th":"คำขอของคุณได้รับการอนุมัติแล้ว","en":"Your request was approved","ja":"申請が承認されました", "es":"Tu solicitud ha sido aprobada", "pt":"Seu pedido foi aprovado", "fr":"Votre demande a été approuvée", "de":"Deine Anfrage wurde freigegeben"} },
  { code: "INVITATION", categoryCode: "WORKFLOW", names: {"th":"คำเชิญ","en":"Invitation","ja":"招待", "es":"Invitación", "pt":"Convite", "fr":"Invitation", "de":"Einladung"}, descriptions: {"th":"คุณได้รับคำเชิญ เช่น คำเชิญเป็นผู้ร่วมจัด","en":"You were invited (co-organizer etc)","ja":"招待を受けました（共同主催者など）", "es":"Te han invitado (coorganizador, etc.)", "pt":"Você foi convidado (coorganizador etc.)", "fr":"Vous avez été invité (coorganisateur, etc.)", "de":"Du wurdest eingeladen (Mitveranstalter usw.)"} },
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
  { code: "OWNER", names: {"th":"เจ้าขององค์กร","en":"Organisation Owner","ja":"団体オーナー", "es":"Propietario de la organización", "pt":"Proprietário da organização", "fr":"Propriétaire de l’organisation", "de":"Organisationseigentümer"} },
  { code: "ADMIN", names: {"th":"ผู้ดูแลองค์กร","en":"Organisation Admin","ja":"団体管理者", "es":"Administrador de la organización", "pt":"Administrador da organização", "fr":"Administrateur de l’organisation", "de":"Organisationsadministrator"} },
  { code: "MEMBER", names: {"th":"สมาชิกองค์กร","en":"Organisation Member","ja":"団体メンバー", "es":"Miembro de la organización", "pt":"Membro da organização", "fr":"Membre de l’organisation", "de":"Organisationsmitglied"} },
] as const

export const ORG_ROLE_CODES = ORG_ROLE.map((t) => t.code) as unknown as [
  "OWNER",
  "ADMIN",
  "MEMBER",
]

export type OrgRoleCode = (typeof ORG_ROLE_CODES)[number]

/** 4 rows, from org_types.jsonl. */
export const ORG_TYPE = [
  { code: "SCHOOL", names: {"th":"โรงเรียน","en":"School","ja":"学校", "es":"Centro escolar", "pt":"Escola", "fr":"Établissement", "de":"Schule"} },
  { code: "CLUB", names: {"th":"สโมสร","en":"Club","ja":"クラブ", "es":"Club", "pt":"Clube", "fr":"Club", "de":"Verein"} },
  { code: "FEDERATION", names: {"th":"สหพันธ์","en":"Federation","ja":"連盟", "es":"Federación", "pt":"Federação", "fr":"Fédération", "de":"Verband"} },
  { code: "GRASSROOTS", names: {"th":"ชุมชนรากหญ้า","en":"Grassroots","ja":"地域団体", "es":"Base", "pt":"Base", "fr":"Base", "de":"Breitensport"} },
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
  { code: "PG", names: {"th":"พอยต์การ์ด","en":"PG","ja":"PG", "es":"B", "pt":"AR", "fr":"MJ", "de":"PG"}, fullNames: {"th":"พอยต์การ์ด","en":"Point Guard","ja":"ポイントガード"} },
  { code: "SG", names: {"th":"ชู้ตติ้งการ์ด","en":"SG","ja":"SG", "es":"E", "pt":"AD", "fr":"AR", "de":"SG"}, fullNames: {"th":"ชู้ตติ้งการ์ด","en":"Shooting Guard","ja":"シューティングガード"} },
  { code: "SF", names: {"th":"สมอลล์ฟอร์เวิร์ด","en":"SF","ja":"SF", "es":"AL", "pt":"AL", "fr":"AI", "de":"SF"}, fullNames: {"th":"สมอลล์ฟอร์เวิร์ด","en":"Small Forward","ja":"スモールフォワード"} },
  { code: "PF", names: {"th":"พาวเวอร์ฟอร์เวิร์ด","en":"PF","ja":"PF", "es":"AP", "pt":"AP", "fr":"AF", "de":"PF"}, fullNames: {"th":"พาวเวอร์ฟอร์เวิร์ด","en":"Power Forward","ja":"パワーフォワード"} },
  { code: "C", names: {"th":"เซ็นเตอร์","en":"C","ja":"C", "es":"P", "pt":"P", "fr":"P", "de":"C"}, fullNames: {"th":"เซ็นเตอร์","en":"Center","ja":"センター"} },
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
  { code: "ADMIN", names: {"th":"ผู้ดูแลระบบ","en":"Admin","ja":"管理者", "es":"Administración", "pt":"Administração", "fr":"Administration", "de":"Verwaltung"}, descriptions: {"th":"เจ้าหน้าที่ภายในที่ดูแลแพลตฟอร์มและมีสิทธิ์เขียนข้อมูลทั้งหมด","en":"Internal staff managing the platform — full write access across all data","ja":"プラットフォームを運営する内部スタッフ — 全データへの書き込み権限", "es":"Personal interno que gestiona la plataforma: acceso de escritura a todos los datos", "pt":"Equipe interna que administra a plataforma: acesso de escrita a todos os dados", "fr":"Équipe interne qui gère la plateforme : accès en écriture à toutes les données", "de":"Internes Team, das die Plattform betreibt: Schreibzugriff auf alle Daten"} },
  { code: "ORGANIZER", names: {"th":"ผู้จัดการแข่งขัน","en":"Organizer","ja":"主催者", "es":"Organizador", "pt":"Organizador", "fr":"Organisateur", "de":"Veranstalter"}, descriptions: {"th":"สร้างและจัดทัวร์นาเมนต์ ลีก ค่ายฝึก และกิจกรรมแสดงผลงาน","en":"Creates and runs tournaments leagues camps showcases","ja":"大会・リーグ・キャンプ・ショーケースを作成し運営する", "es":"Creates and runs tournaments leagues camps showcases", "pt":"Creates and runs tournaments leagues camps showcases", "fr":"Creates and runs tournaments leagues camps showcases", "de":"Creates and runs tournaments leagues camps showcases"} },
  { code: "COACH", names: {"th":"โค้ช","en":"Coach","ja":"コーチ", "es":"Entrenador", "pt":"Técnico", "fr":"Entraîneur", "de":"Trainer"}, descriptions: {"th":"จัดการทีม การลงทะเบียนรายชื่อผู้เล่น และการบันทึกการเข้าร่วม","en":"Manages a team — roster registration attendance","ja":"チームを管理する — ロースター・登録・出席", "es":"Gestiona un equipo: plantilla, inscripciones y asistencia", "pt":"Gerencia um time: elenco, inscrições e presença", "fr":"Gère une équipe : effectif, inscriptions et présences", "de":"Betreut ein Team: Kader, Meldungen und Anwesenheit"} },
  { code: "PLAYER", names: {"th":"ผู้เล่น","en":"Player","ja":"選手", "es":"Jugador", "pt":"Jogador", "fr":"Joueur", "de":"Spieler"}, descriptions: {"th":"นักกีฬารายบุคคลที่จัดการโปรไฟล์ การลงทะเบียน และสถิติของตนเอง","en":"Individual athlete — own profile registrations stats","ja":"個人の競技者 — 自分のプロフィール・登録・スタッツ", "es":"Deportista individual: su ficha, inscripciones y estadísticas", "pt":"Atleta individual: ficha própria, inscrições e estatísticas", "fr":"Athlète individuel : sa fiche, ses inscriptions et ses statistiques", "de":"Einzelsportler: eigenes Profil, Meldungen und Statistiken"} },
  { code: "SPECTATOR", names: {"th":"ผู้ชม","en":"Spectator","ja":"観戦者", "es":"Espectador", "pt":"Espectador", "fr":"Spectateur", "de":"Zuschauer"}, descriptions: {"th":"ผู้ติดตามที่อ่านข้อมูลได้อย่างเดียว เช่น ผู้ปกครอง แฟนกีฬา และผู้ชมทั่วไป","en":"Read-only follower — parents fans casual viewers","ja":"閲覧のみのフォロワー — 保護者・ファン・一般の視聴者", "es":"Seguidor de solo lectura: familias, aficionados y público ocasional", "pt":"Seguidor apenas de leitura: familiares, torcedores e público casual", "fr":"Abonné en lecture seule : parents, supporters et public occasionnel", "de":"Abonnent mit Lesezugriff: Eltern, Fans und Gelegenheitszuschauer"} },
  { code: "REFEREE", names: {"th":"ผู้ตัดสิน","en":"Referee","ja":"審判", "es":"Árbitro", "pt":"Árbitro", "fr":"Arbitre", "de":"Schiedsrichter"}, descriptions: {"th":"เจ้าหน้าที่ผู้ได้รับการรับรองที่บันทึกคะแนนและสถานะการแข่งขัน","en":"Certified official — score entry match status","ja":"公認審判 — スコア入力と試合状況", "es":"Árbitro certificado: introduce el resultado y el estado del partido", "pt":"Árbitro certificado: lança o placar e a situação do jogo", "fr":"Arbitre certifié : saisie du score et statut du match", "de":"Lizenzierter Schiedsrichter: Ergebniseingabe und Spielstatus"} },
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
  { code: "OWNER", objectTypeCode: "EVENT", via: "table", sourceTable: "events", objectColumn: "id", userColumn: "organizer_user_id", filterColumn: null, filterValue: null, throughTable: null, throughColumn: null, activeFromColumn: null, activeToColumn: null, roleCode: null, parentRelation: null, names: {"th":"เจ้าของ","en":"Owner","ja":"オーナー", "es":"Propietario", "pt":"Proprietário", "fr":"Propriétaire", "de":"Eigentümer"} },
  { code: "CO_ORGANIZER", objectTypeCode: "EVENT", via: "table", sourceTable: "event_co_organizers", objectColumn: "event_id", userColumn: "user_id", filterColumn: "status_code", filterValue: "ACCEPTED", throughTable: null, throughColumn: null, activeFromColumn: null, activeToColumn: null, roleCode: null, parentRelation: null, names: {"th":"ผู้ร่วมจัด","en":"Co-organizer","ja":"共同主催者", "es":"Coorganizador", "pt":"Coorganizador", "fr":"Coorganisateur", "de":"Mitveranstalter"} },
  { code: "HEAD_COACH", objectTypeCode: "TEAM", via: "table", sourceTable: "team_coaches", objectColumn: "team_id", userColumn: "user_id", filterColumn: "coach_role_code", filterValue: "HEAD", throughTable: null, throughColumn: null, activeFromColumn: null, activeToColumn: null, roleCode: null, parentRelation: null, names: {"th":"หัวหน้าผู้ฝึกสอน","en":"Head Coach","ja":"ヘッドコーチ", "es":"Primer entrenador", "pt":"Técnico principal", "fr":"Entraîneur principal", "de":"Cheftrainer"} },
  { code: "ASSISTANT_COACH", objectTypeCode: "TEAM", via: "table", sourceTable: "team_coaches", objectColumn: "team_id", userColumn: "user_id", filterColumn: "coach_role_code", filterValue: "ASSISTANT", throughTable: null, throughColumn: null, activeFromColumn: null, activeToColumn: null, roleCode: null, parentRelation: null, names: {"th":"ผู้ช่วยผู้ฝึกสอน","en":"Assistant Coach","ja":"アシスタントコーチ", "es":"Entrenador ayudante", "pt":"Técnico assistente", "fr":"Entraîneur adjoint", "de":"Co-Trainer"} },
  { code: "TEAM_MANAGER", objectTypeCode: "TEAM", via: "table", sourceTable: "team_coaches", objectColumn: "team_id", userColumn: "user_id", filterColumn: "coach_role_code", filterValue: "MANAGER", throughTable: null, throughColumn: null, activeFromColumn: null, activeToColumn: null, roleCode: null, parentRelation: null, names: {"th":"ผู้จัดการทีม","en":"Team Manager","ja":"チームマネージャー", "es":"Delegado del equipo", "pt":"Gerente do time", "fr":"Responsable d’équipe", "de":"Teammanager"} },
  { code: "TEAM_PLAYER", objectTypeCode: "TEAM", via: "table", sourceTable: "player_teams", objectColumn: "team_id", userColumn: "user_id", filterColumn: null, filterValue: null, throughTable: "players", throughColumn: "player_id", activeFromColumn: "from_date", activeToColumn: "to_date", roleCode: null, parentRelation: null, names: {"th":"ผู้เล่นในทีม","en":"Team Player","ja":"チーム所属選手", "es":"Jugador del equipo", "pt":"Jogador do time", "fr":"Joueur de l’équipe", "de":"Teamspieler"} },
  { code: "SELF", objectTypeCode: "PLAYER", via: "table", sourceTable: "players", objectColumn: "id", userColumn: "user_id", filterColumn: null, filterValue: null, throughTable: null, throughColumn: null, activeFromColumn: null, activeToColumn: null, roleCode: null, parentRelation: null, names: {"th":"ตัวเอง","en":"Self","ja":"本人", "es":"Uno mismo", "pt":"A própria pessoa", "fr":"Soi-même", "de":"Man selbst"} },
  { code: "GUARDIAN", objectTypeCode: "PLAYER", via: "table", sourceTable: "guardians", objectColumn: "player_id", userColumn: "user_id", filterColumn: null, filterValue: null, throughTable: null, throughColumn: null, activeFromColumn: null, activeToColumn: null, roleCode: null, parentRelation: null, names: {"th":"ผู้ปกครอง","en":"Guardian","ja":"保護者", "es":"Tutor", "pt":"Responsável", "fr":"Tuteur", "de":"Erziehungsberechtigt"} },
  { code: "FOLLOWER_PLAYER", objectTypeCode: "PLAYER", via: "table", sourceTable: "subscriptions", objectColumn: "object_id", userColumn: "user_id", filterColumn: "object_type_code", filterValue: "PLAYER", throughTable: null, throughColumn: null, activeFromColumn: null, activeToColumn: null, roleCode: null, parentRelation: null, names: {"th":"ผู้ติดตาม (ผู้เล่น)","en":"Player Follower","ja":"選手のフォロワー", "es":"Seguidor del jugador", "pt":"Seguidor do jogador", "fr":"Abonné au joueur", "de":"Spieler-Abonnent"} },
  { code: "FOLLOWER_TEAM", objectTypeCode: "TEAM", via: "table", sourceTable: "subscriptions", objectColumn: "object_id", userColumn: "user_id", filterColumn: "object_type_code", filterValue: "TEAM", throughTable: null, throughColumn: null, activeFromColumn: null, activeToColumn: null, roleCode: null, parentRelation: null, names: {"th":"ผู้ติดตาม (ทีม)","en":"Team Follower","ja":"チームのフォロワー", "es":"Seguidor del equipo", "pt":"Seguidor do time", "fr":"Abonné à l’équipe", "de":"Team-Abonnent"} },
  { code: "ORG_OWNER", objectTypeCode: "ORG", via: "table", sourceTable: "org_members", objectColumn: "org_id", userColumn: "user_id", filterColumn: "org_role_code", filterValue: "OWNER", throughTable: null, throughColumn: null, activeFromColumn: null, activeToColumn: null, roleCode: null, parentRelation: null, names: {"th":"เจ้าขององค์กร","en":"Organisation Owner","ja":"団体オーナー", "es":"Propietario de la organización", "pt":"Proprietário da organização", "fr":"Propriétaire de l’organisation", "de":"Organisationseigentümer"} },
  { code: "ORG_ADMIN", objectTypeCode: "ORG", via: "table", sourceTable: "org_members", objectColumn: "org_id", userColumn: "user_id", filterColumn: "org_role_code", filterValue: "ADMIN", throughTable: null, throughColumn: null, activeFromColumn: null, activeToColumn: null, roleCode: null, parentRelation: null, names: {"th":"ผู้ดูแลองค์กร","en":"Organisation Admin","ja":"団体管理者", "es":"Administrador de la organización", "pt":"Administrador da organização", "fr":"Administrateur de l’organisation", "de":"Organisationsadministrator"} },
  { code: "ORG_MEMBER", objectTypeCode: "ORG", via: "table", sourceTable: "org_members", objectColumn: "org_id", userColumn: "user_id", filterColumn: "org_role_code", filterValue: "MEMBER", throughTable: null, throughColumn: null, activeFromColumn: null, activeToColumn: null, roleCode: null, parentRelation: null, names: {"th":"สมาชิกองค์กร","en":"Organisation Member","ja":"団体メンバー", "es":"Miembro de la organización", "pt":"Membro da organização", "fr":"Membre de l’organisation", "de":"Organisationsmitglied"} },
  // A referee is assigned to a game, not to the platform. `ANY_REFEREE` — the
  // role — used to grant score entry, which meant every referee could score
  // every game in every event.
  { code: "GAME_REFEREE", objectTypeCode: "GAME", via: "table", sourceTable: "game_referees", objectColumn: "game_id", userColumn: "user_id", filterColumn: null, filterValue: null, throughTable: null, throughColumn: null, activeFromColumn: null, activeToColumn: null, roleCode: null, parentRelation: null, names: {"th":"ผู้ตัดสินของเกม","en":"Game Referee","ja":"試合の審判", "es":"Árbitro del partido", "pt":"Árbitro do jogo", "fr":"Arbitre du match", "de":"Schiedsrichter des Spiels"} },
  // Inherited from the event the game belongs to: whoever runs the event runs
  // its games. `via: "parent"` reads `games.event_id` for this game and then asks
  // the named relation about that event — so these two stay correct by
  // construction if OWNER or CO_ORGANIZER is ever redefined.
  { code: "GAME_EVENT_OWNER", objectTypeCode: "GAME", via: "parent", sourceTable: "games", objectColumn: "id", userColumn: null, filterColumn: null, filterValue: null, throughTable: null, throughColumn: "event_id", activeFromColumn: null, activeToColumn: null, roleCode: null, parentRelation: "OWNER", names: {"th":"เจ้าของอีเวนต์ของเกม","en":"Owner of the game's event","ja":"試合が属するイベントのオーナー", "es":"Propietario del evento del partido", "pt":"Proprietário do evento do jogo", "fr":"Propriétaire de l’événement du match", "de":"Eigentümer des Events zu diesem Spiel"} },
  { code: "GAME_EVENT_CO_ORGANIZER", objectTypeCode: "GAME", via: "parent", sourceTable: "games", objectColumn: "id", userColumn: null, filterColumn: null, filterValue: null, throughTable: null, throughColumn: "event_id", activeFromColumn: null, activeToColumn: null, roleCode: null, parentRelation: "CO_ORGANIZER", names: {"th":"ผู้ร่วมจัดอีเวนต์ของเกม","en":"Co-organizer of the game's event","ja":"試合が属するイベントの共同主催者", "es":"Coorganizador del evento del partido", "pt":"Coorganizador do evento do jogo", "fr":"Coorganisateur de l’événement du match", "de":"Mitveranstalter des Events zu diesem Spiel"} },
  { code: "FOLLOWER_EVENT", objectTypeCode: "EVENT", via: "table", sourceTable: "subscriptions", objectColumn: "object_id", userColumn: "user_id", filterColumn: "object_type_code", filterValue: "EVENT", throughTable: null, throughColumn: null, activeFromColumn: null, activeToColumn: null, roleCode: null, parentRelation: null, names: {"th":"ผู้ติดตาม (อีเวนต์)","en":"Event Follower","ja":"イベントのフォロワー", "es":"Seguidor del evento", "pt":"Seguidor do evento", "fr":"Abonné à l’événement", "de":"Event-Abonnent"} },
  { code: "PLATFORM_ADMIN", objectTypeCode: "PLATFORM", via: "role", sourceTable: null, objectColumn: null, userColumn: null, filterColumn: null, filterValue: null, throughTable: null, throughColumn: null, activeFromColumn: null, activeToColumn: null, roleCode: "ADMIN", parentRelation: null, names: {"th":"ผู้ดูแลแพลตฟอร์ม","en":"Platform Admin","ja":"プラットフォーム管理者", "es":"Administrador de la plataforma", "pt":"Administrador da plataforma", "fr":"Administrateur de la plateforme", "de":"Plattformadministrator"} },
  { code: "ANY_ORGANIZER", objectTypeCode: "PLATFORM", via: "role", sourceTable: null, objectColumn: null, userColumn: null, filterColumn: null, filterValue: null, throughTable: null, throughColumn: null, activeFromColumn: null, activeToColumn: null, roleCode: "ORGANIZER", parentRelation: null, names: {"th":"ผู้จัดการแข่งขันใดๆ","en":"Any Organizer","ja":"主催者全員", "es":"Cualquier organizador", "pt":"Qualquer organizador", "fr":"Tout organisateur", "de":"Jeder Veranstalter"} },
  { code: "ANY_COACH", objectTypeCode: "PLATFORM", via: "role", sourceTable: null, objectColumn: null, userColumn: null, filterColumn: null, filterValue: null, throughTable: null, throughColumn: null, activeFromColumn: null, activeToColumn: null, roleCode: "COACH", parentRelation: null, names: {"th":"โค้ชใดๆ","en":"Any Coach","ja":"コーチ全員", "es":"Cualquier entrenador", "pt":"Qualquer técnico", "fr":"Tout entraîneur", "de":"Jeder Trainer"} },
  { code: "ANY_PLAYER", objectTypeCode: "PLATFORM", via: "role", sourceTable: null, objectColumn: null, userColumn: null, filterColumn: null, filterValue: null, throughTable: null, throughColumn: null, activeFromColumn: null, activeToColumn: null, roleCode: "PLAYER", parentRelation: null, names: {"th":"ผู้เล่นใดๆ","en":"Any Player","ja":"選手全員", "es":"Cualquier jugador", "pt":"Qualquer jogador", "fr":"Tout joueur", "de":"Jeder Spieler"} },
  { code: "ANY_REFEREE", objectTypeCode: "PLATFORM", via: "role", sourceTable: null, objectColumn: null, userColumn: null, filterColumn: null, filterValue: null, throughTable: null, throughColumn: null, activeFromColumn: null, activeToColumn: null, roleCode: "REFEREE", parentRelation: null, names: {"th":"ผู้ตัดสินใดๆ","en":"Any Referee","ja":"審判全員", "es":"Cualquier árbitro", "pt":"Qualquer árbitro", "fr":"Tout arbitre", "de":"Jeder Schiedsrichter"} },
  { code: "ANY_SPECTATOR", objectTypeCode: "PLATFORM", via: "role", sourceTable: null, objectColumn: null, userColumn: null, filterColumn: null, filterValue: null, throughTable: null, throughColumn: null, activeFromColumn: null, activeToColumn: null, roleCode: "SPECTATOR", parentRelation: null, names: {"th":"ผู้ชมใดๆ","en":"Any Spectator","ja":"観戦者全員", "es":"Cualquier espectador", "pt":"Qualquer espectador", "fr":"Tout spectateur", "de":"Jeder Zuschauer"} },
  { code: "ANY_SIGNED_IN", objectTypeCode: "PLATFORM", via: "everyone", sourceTable: null, objectColumn: null, userColumn: null, filterColumn: null, filterValue: null, throughTable: null, throughColumn: null, activeFromColumn: null, activeToColumn: null, roleCode: null, parentRelation: null, names: {"th":"ผู้ที่เข้าสู่ระบบใดๆ","en":"Any Signed-in User","ja":"ログイン中の全ユーザー", "es":"Cualquier persona con sesión iniciada", "pt":"Qualquer pessoa conectada", "fr":"Toute personne connectée", "de":"Jede angemeldete Person"} },
  { code: "PUBLIC", objectTypeCode: "PLATFORM", via: "everyone", sourceTable: null, objectColumn: null, userColumn: null, filterColumn: null, filterValue: null, throughTable: null, throughColumn: null, activeFromColumn: null, activeToColumn: null, roleCode: null, parentRelation: null, names: {"th":"สาธารณะ","en":"Public","ja":"一般公開", "es":"Público", "pt":"Público", "fr":"Public", "de":"Öffentlich"} },
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
  { code: "PREMIER", names: {"th":"พรีเมียร์","en":"Premier","ja":"プレミア", "es":"Élite", "pt":"Elite", "fr":"Élite", "de":"Spitzensport"} },
] as const

export const SKILL_TIER_CODES = SKILL_TIER.map((t) => t.code) as unknown as [
  "PREMIER",
]

export type SkillTierCode = (typeof SKILL_TIER_CODES)[number]

/** 4 rows, from user_statuses.jsonl. */
export const USER_STATUS = [
  { code: "ACTIVE", names: {"th":"ใช้งานอยู่","en":"Active","ja":"有効", "es":"Activa", "pt":"Ativa", "fr":"Actif", "de":"Aktiv"}, descriptions: {"th":"บัญชีเปิดใช้งานเต็มรูปแบบและสามารถใช้แพลตฟอร์มได้","en":"Account is fully active and can use the platform","ja":"アカウントは有効で、プラットフォームを利用できます", "es":"La cuenta está plenamente activa y puede usar la plataforma", "pt":"A conta está totalmente ativa e pode usar a plataforma", "fr":"Le compte est pleinement actif et peut utiliser la plateforme", "de":"Das Konto ist voll aktiv und kann die Plattform nutzen"} },
  { code: "PENDING_APPROVAL", names: {"th":"รออนุมัติ","en":"Pending Approval","ja":"承認待ち", "es":"Pendiente de aprobación", "pt":"Aguardando aprovação", "fr":"En attente d’approbation", "de":"Wartet auf Freigabe"}, descriptions: {"th":"มีบัญชีแล้วแต่กำลังรอการอนุมัติจากผู้ดูแลระบบ เช่น ผู้ตัดสินที่รอการตรวจสอบการรับรอง BAT","en":"Account exists but is waiting for admin approval (e.g. REFEREE awaiting BAT certification verification)","ja":"アカウントは存在するが管理者の承認待ち（例：BAT認定の確認を待つ審判）", "es":"La cuenta existe pero espera la aprobación de un administrador (por ejemplo, un árbitro pendiente de verificar su certificación de la BAT)", "pt":"A conta existe mas aguarda aprovação de um administrador (por exemplo, um árbitro aguardando a verificação da certificação da BAT)", "fr":"Le compte existe mais attend l’approbation d’un administrateur (par exemple un arbitre en attente de vérification de sa certification BAT)", "de":"Das Konto existiert, wartet aber auf die Freigabe durch einen Administrator (z. B. ein Schiedsrichter, dessen BAT-Zertifizierung noch geprüft wird)"} },
  { code: "SUSPENDED", names: {"th":"ระงับชั่วคราว","en":"Suspended","ja":"一時停止", "es":"Suspendida", "pt":"Suspensa", "fr":"Suspendu", "de":"Gesperrt"}, descriptions: {"th":"บัญชีถูกระงับชั่วคราวโดยผู้ดูแลระบบ","en":"Account is temporarily suspended by admin","ja":"管理者により一時的に停止されています", "es":"Un administrador ha suspendido temporalmente la cuenta", "pt":"A conta foi suspensa temporariamente por um administrador", "fr":"Le compte est temporairement suspendu par un administrateur", "de":"Das Konto wurde von einem Administrator vorübergehend gesperrt"} },
  { code: "DEACTIVATED", names: {"th":"ปิดใช้งาน","en":"Deactivated","ja":"無効化", "es":"Desactivada", "pt":"Desativada", "fr":"Désactivé", "de":"Deaktiviert"}, descriptions: {"th":"บัญชีถูกปิดใช้งานถาวร","en":"Account is permanently deactivated","ja":"アカウントは永久に無効化されています", "es":"La cuenta está desactivada de forma permanente", "pt":"A conta está desativada permanentemente", "fr":"Le compte est définitivement désactivé", "de":"Das Konto ist dauerhaft deaktiviert"} },
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

// Mock data for Remy Sport.
// Production swap: replace each export with a react-query hook against the
// Workers API. Call-sites in lib/data.tsx already abstract the access pattern.

export type Crest = "a" | "b";
export type EventType = "tournament" | "league" | "camp" | "showcase";
export type EventStatus = "live" | "open" | "upcoming" | "closed";

export interface Team {
  id: string;
  name: string;
  nameTh?: string;
  short: string;
  crest: Crest;
  city: string;
  record?: string;
}

export interface Event {
  id: string;
  type: EventType;
  title: string;
  titleTh?: string;
  div: string;
  loc: string;
  city: string;
  day: number;
  mo: string;
  date: string;
  status: EventStatus;
  statusLabel: string;
  teams: number;
  courts: number;
  games: number;
  gamesPlayed: number;
  organizer: string;
}

export interface BracketTeamRef {
  seed?: number;
  name: string;
  short: string;
  score?: number;
  win?: boolean;
  live?: boolean;
  tba?: boolean;
}

export interface BracketMatch {
  id: string;
  a: BracketTeamRef;
  b: BracketTeamRef;
  status: "done" | "live" | "upcoming";
  label?: string;
}

export interface BracketRound {
  label: string;
  matches: BracketMatch[];
}

export interface Bracket {
  rounds: BracketRound[];
}

export interface LiveGameTeam {
  id: string;
  name: string;
  nameTh?: string;
  short: string;
  crest: Crest;
  seed: number;
  record: string;
}

export interface PlayByPlayItem {
  ts: string;
  desc: string;
  score?: boolean;
}

export interface LiveGame {
  id: string;
  court: string;
  event: string;
  quarter: string;
  clock: string;
  teamA: LiveGameTeam;
  teamB: LiveGameTeam;
  quarters: { a: (number | null)[]; total: number; b: (number | null)[] };
  watching: number;
  pbp: PlayByPlayItem[];
}

export interface RosterPlayer {
  num: number;
  name: string;
  pos: "PG" | "SG" | "SF" | "PF" | "C";
  height: string;
  pts: number;
  ast: number;
  reb: number;
}

export interface Standing {
  rank: number;
  team: string;
  short: string;
  w: number;
  l: number;
  pf: number;
  pa: number;
  pts: number;
  you?: boolean;
}

export interface FeedItem {
  desc: string;
  ts: string;
  dot?: "live" | "on" | "muted";
}

export const TEAMS: Team[] = [
  { id: "t1", name: "Bangkok Christian", nameTh: "กรุงเทพคริสเตียน", short: "BKC", crest: "a", city: "Bangkok", record: "4–0" },
  { id: "t2", name: "Saint Gabriel's", nameTh: "เซนต์คาเบรียล", short: "SGS", crest: "b", city: "Bangkok", record: "3–1" },
  { id: "t3", name: "Assumption College", nameTh: "อัสสัมชัญ", short: "ASC", crest: "a", city: "Bangkok", record: "3–1" },
  { id: "t4", name: "Ruamrudee Intl.", nameTh: "ร่วมฤดี", short: "RIS", crest: "b", city: "Bangkok", record: "2–2" },
  { id: "t5", name: "Triam Udom", nameTh: "เตรียมอุดมศึกษา", short: "TUS", crest: "a", city: "Bangkok", record: "2–2" },
  { id: "t6", name: "Mater Dei", nameTh: "มาแตร์เดอี", short: "MDS", crest: "b", city: "Bangkok", record: "1–3" },
  { id: "t7", name: "Suankularb", nameTh: "สวนกุหลาบ", short: "SKL", crest: "a", city: "Bangkok", record: "1–3" },
  { id: "t8", name: "Sarasas Witaed", nameTh: "สารสาสน์วิเทศ", short: "SAR", crest: "b", city: "Nonthaburi", record: "0–4" },
];

export const EVENTS: Event[] = [
  { id: "e1", type: "tournament", title: "Bangkok Cup 2026 — U16 Boys", titleTh: "บางกอกคัพ 2026 รุ่น U16 ชาย", div: "U16 · Boys", loc: "Hua Mark Indoor Stadium", city: "Bangkok", day: 12, mo: "MAY", date: "May 12–14, 2026", status: "live", statusLabel: "Live now", teams: 16, courts: 3, games: 24, gamesPlayed: 18, organizer: "Bangkok Schools Athletic Assoc." },
  { id: "e2", type: "league", title: "Bangkok Schools League — Spring", titleTh: "ลีกโรงเรียนกรุงเทพฯ ฤดูใบไม้ผลิ", div: "U18 · Boys", loc: "Multiple courts", city: "Bangkok", day: 4, mo: "MAY", date: "May 4 – Jul 27, 2026", status: "live", statusLabel: "Round 6 of 14", teams: 12, courts: 6, games: 78, gamesPlayed: 42, organizer: "BSL Committee" },
  { id: "e3", type: "showcase", title: "Thailand HS Showcase", titleTh: "ไทยแลนด์ ไฮสกูล โชว์เคส", div: "U18 · Mixed", loc: "True Arena Hua Hin", city: "Hua Hin", day: 20, mo: "JUN", date: "Jun 20–22, 2026", status: "open", statusLabel: "Registration open", teams: 24, courts: 4, games: 0, gamesPlayed: 0, organizer: "Thai Basketball Federation" },
  { id: "e4", type: "camp", title: "Summer Skills Camp — Shooting", titleTh: "แคมป์ทักษะการยิงประตู", div: "U12–U15", loc: "Patana School", city: "Bangkok", day: 28, mo: "JUN", date: "Jun 28 – Jul 2, 2026", status: "open", statusLabel: "34/40 spots", teams: 0, courts: 1, games: 0, gamesPlayed: 0, organizer: "Coach Sukasem" },
  { id: "e5", type: "tournament", title: "Chiang Mai Open", titleTh: "เชียงใหม่ โอเพ่น", div: "U14 · Girls", loc: "Chiang Mai University", city: "Chiang Mai", day: 5, mo: "JUL", date: "Jul 5–7, 2026", status: "upcoming", statusLabel: "Starts in 67 days", teams: 12, courts: 2, games: 22, gamesPlayed: 0, organizer: "Northern Schools Athletics" },
  { id: "e6", type: "tournament", title: "Phuket Coastal Classic", titleTh: "ภูเก็ตโคสตัลคลาสสิก", div: "U16 · Boys", loc: "Phuket Wittayalai School", city: "Phuket", day: 26, mo: "JUL", date: "Jul 26–28, 2026", status: "upcoming", statusLabel: "Reg. opens May 15", teams: 16, courts: 2, games: 24, gamesPlayed: 0, organizer: "Phuket Schools Sport" },
  { id: "e7", type: "league", title: "ASB Junior League", titleTh: "เอเอสบี จูเนียร์ลีก", div: "U14 · Mixed", loc: "ASB Sports Hub", city: "Bangkok", day: 2, mo: "MAR", date: "Closed Mar 2–Apr 18, 2026", status: "closed", statusLabel: "Final standings", teams: 10, courts: 3, games: 45, gamesPlayed: 45, organizer: "ASB" },
];

export const BRACKET: Bracket = {
  rounds: [
    {
      label: "Round of 16",
      matches: [
        { id: "m1", a: { seed: 1, name: "Bangkok Christian", short: "BKC", score: 78, win: true }, b: { seed: 16, name: "Sarasas", short: "SAR", score: 42 }, status: "done" },
        { id: "m2", a: { seed: 8, name: "Mater Dei", short: "MDS", score: 55 }, b: { seed: 9, name: "Saint Joseph", short: "SJS", score: 62, win: true }, status: "done" },
        { id: "m3", a: { seed: 5, name: "Saint Gabriel's", short: "SGS", score: 71, win: true }, b: { seed: 12, name: "Suankularb", short: "SKL", score: 54 }, status: "done" },
        { id: "m4", a: { seed: 4, name: "Assumption", short: "ASC", score: 65, win: true }, b: { seed: 13, name: "Ruamrudee", short: "RIS", score: 58 }, status: "done" },
        { id: "m5", a: { seed: 3, name: "Triam Udom", short: "TUS", score: 67, win: true }, b: { seed: 14, name: "Wachirawit", short: "WCR", score: 50 }, status: "done" },
        { id: "m6", a: { seed: 6, name: "Bangkok Patana", short: "BKP", score: 58, win: true }, b: { seed: 11, name: "NIST", short: "NIS", score: 51 }, status: "done" },
        { id: "m7", a: { seed: 7, name: "ISB", short: "ISB", score: 60, win: true }, b: { seed: 10, name: "KIS", short: "KIS", score: 55 }, status: "done" },
        { id: "m8", a: { seed: 2, name: "Wells Intl.", short: "WLS", score: 74, win: true }, b: { seed: 15, name: "Anglo Singapore", short: "ANG", score: 48 }, status: "done" },
      ],
    },
    {
      label: "Quarterfinals",
      matches: [
        { id: "q1", a: { seed: 1, name: "Bangkok Christian", short: "BKC", score: 68, win: true }, b: { seed: 9, name: "Saint Joseph", short: "SJS", score: 51 }, status: "done" },
        { id: "q2", a: { seed: 5, name: "Saint Gabriel's", short: "SGS", score: 54, win: true, live: true }, b: { seed: 4, name: "Assumption", short: "ASC", score: 49, live: true }, status: "live", label: "Q3 · 06:42" },
        { id: "q3", a: { seed: 3, name: "Triam Udom", short: "TUS" }, b: { seed: 6, name: "Bangkok Patana", short: "BKP" }, status: "upcoming", label: "14:00" },
        { id: "q4", a: { seed: 7, name: "ISB", short: "ISB" }, b: { seed: 2, name: "Wells Intl.", short: "WLS" }, status: "upcoming", label: "15:30" },
      ],
    },
    {
      label: "Semifinals",
      matches: [
        { id: "s1", a: { seed: 1, name: "Bangkok Christian", short: "BKC" }, b: { tba: true, name: "TBA · QF1 winner", short: "—" }, status: "upcoming", label: "Sat 11:00" },
        { id: "s2", a: { tba: true, name: "TBA · QF3 winner", short: "—" }, b: { tba: true, name: "TBA · QF4 winner", short: "—" }, status: "upcoming", label: "Sat 13:00" },
      ],
    },
    {
      label: "Final",
      matches: [
        { id: "f1", a: { tba: true, name: "TBA", short: "—" }, b: { tba: true, name: "TBA", short: "—" }, status: "upcoming", label: "Sun 16:00" },
      ],
    },
  ],
};

export const LIVE_GAME: LiveGame = {
  id: "q2",
  court: "COURT B",
  event: "BANGKOK CUP · QUARTERFINAL 2",
  quarter: "Q3",
  clock: "06:42",
  teamA: { id: "t2", name: "Saint Gabriel's", nameTh: "เซนต์คาเบรียล", short: "SGS", crest: "a", seed: 5, record: "4–0" },
  teamB: { id: "t3", name: "Assumption College", nameTh: "อัสสัมชัญ", short: "ASC", crest: "b", seed: 4, record: "3–1" },
  quarters: { a: [14, 18, 22, null], total: 54, b: [12, 21, 16, null] },
  watching: 412,
  pbp: [
    { ts: "Q3 · 06:42", desc: "<b>Phongphan</b> 3PT made — SGS", score: true },
    { ts: "Q3 · 07:15", desc: "<b>Tanawat</b> rebound · ASC" },
    { ts: "Q3 · 07:18", desc: "<b>Tanawat</b> layup made — ASC", score: true },
    { ts: "Q3 · 08:02", desc: "Timeout · ASC" },
    { ts: "Q3 · 08:32", desc: "<b>Sittichai</b> 2PT made — SGS", score: true },
    { ts: "Q3 · 09:11", desc: "Personal foul on <b>Krit</b> · ASC" },
    { ts: "Q3 · 09:48", desc: "<b>Phongphan</b> assist · <b>Boonyarit</b> dunk — SGS", score: true },
    { ts: "Q2 · END", desc: "End of quarter · SGS 32 · ASC 33" },
    { ts: "Q2 · 00:08", desc: "<b>Krit</b> 3PT made — ASC", score: true },
  ],
};

export const ROSTER: RosterPlayer[] = [
  { num: 4, name: "Phongphan S.", pos: "PG", height: "180cm", pts: 14.2, ast: 5.1, reb: 3.0 },
  { num: 7, name: "Sittichai N.", pos: "SG", height: "184cm", pts: 12.8, ast: 2.0, reb: 4.1 },
  { num: 10, name: "Boonyarit T.", pos: "SF", height: "192cm", pts: 16.4, ast: 1.8, reb: 6.2 },
  { num: 13, name: "Watchara M.", pos: "PF", height: "196cm", pts: 11.0, ast: 0.9, reb: 8.4 },
  { num: 21, name: "Anucha K.", pos: "C", height: "201cm", pts: 9.6, ast: 0.5, reb: 9.1 },
  { num: 5, name: "Pichai R.", pos: "PG", height: "176cm", pts: 6.3, ast: 3.4, reb: 1.8 },
  { num: 8, name: "Nattapong V.", pos: "SG", height: "182cm", pts: 7.1, ast: 1.2, reb: 2.6 },
  { num: 11, name: "Kasidit P.", pos: "SF", height: "188cm", pts: 5.8, ast: 1.0, reb: 3.4 },
  { num: 14, name: "Suriya B.", pos: "PF", height: "193cm", pts: 4.4, ast: 0.6, reb: 5.8 },
  { num: 24, name: "Thaksin O.", pos: "C", height: "199cm", pts: 3.2, ast: 0.3, reb: 6.0 },
  { num: 17, name: "Kiattisak L.", pos: "SG", height: "180cm", pts: 4.0, ast: 1.5, reb: 1.9 },
  { num: 22, name: "Worapong J.", pos: "PF", height: "194cm", pts: 5.2, ast: 0.4, reb: 4.9 },
];

export const STANDINGS: Standing[] = [
  { rank: 1, team: "Bangkok Christian", short: "BKC", w: 5, l: 0, pf: 412, pa: 318, pts: 10 },
  { rank: 2, team: "Saint Gabriel's", short: "SGS", w: 4, l: 1, pf: 388, pa: 342, pts: 8, you: true },
  { rank: 3, team: "Assumption", short: "ASC", w: 4, l: 1, pf: 401, pa: 358, pts: 8 },
  { rank: 4, team: "Triam Udom", short: "TUS", w: 3, l: 2, pf: 365, pa: 351, pts: 6 },
  { rank: 5, team: "Bangkok Patana", short: "BKP", w: 2, l: 3, pf: 312, pa: 348, pts: 4 },
  { rank: 6, team: "Wells Intl.", short: "WLS", w: 2, l: 3, pf: 305, pa: 332, pts: 4 },
  { rank: 7, team: "ISB", short: "ISB", w: 1, l: 4, pf: 288, pa: 360, pts: 2 },
  { rank: 8, team: "Saint Joseph", short: "SJS", w: 0, l: 5, pf: 252, pa: 374, pts: 0 },
];

export const FEED: FeedItem[] = [
  { dot: "live", desc: "<b>Saint Gabriel's</b> leads <b>Assumption</b> 54–49 · Q3 · Bangkok Cup", ts: "Live · Court B" },
  { dot: "on", desc: "<b>Bangkok Christian</b> defeated <b>Saint Joseph</b> 68–51 · QF1", ts: "38 min ago" },
  { dot: "on", desc: "Bracket updated — <b>Quarterfinals</b> set · Bangkok Cup 2026", ts: "1h ago" },
  { dot: "muted", desc: "New event — <b>Phuket Coastal Classic</b> registration opens May 15", ts: "3h ago" },
  { dot: "muted", desc: "Coach <b>Sukasem</b> added 4 players to <b>Saint Gabriel's</b> roster", ts: "Yesterday" },
  { dot: "muted", desc: "Final standings published · <b>ASB Junior League</b> · 2025–26", ts: "2 days ago" },
];

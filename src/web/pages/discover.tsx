import { useState } from "react";
import { Icon } from "../components/icon";
import { useEvents, useLiveGame } from "../lib/data";
import type { Route } from "../lib/router";
import type { Lang } from "../lib/i18n";
import type { EventStatus, EventType } from "../data";

interface DiscoverProps {
  goto: (r: Route) => void;
  lang: Lang;
  spoiler: boolean;
}

type Tab = "all" | "live" | "open" | "upcoming" | "closed";

export function DiscoverPage({ goto, lang, spoiler }: DiscoverProps) {
  const [tab, setTab] = useState<Tab>("all");
  const [filterCity, setFilterCity] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<EventType | null>(null);
  const allEvents = useEvents();

  let events = allEvents;
  if (tab !== "all") events = events.filter(e => e.status === (tab as EventStatus));
  if (filterCity) events = events.filter(e => e.city === filterCity);
  if (filterType) events = events.filter(e => e.type === filterType);

  const counts: Record<Tab, number> = {
    all: allEvents.length,
    live: allEvents.filter(e => e.status === "live").length,
    open: allEvents.filter(e => e.status === "open").length,
    upcoming: allEvents.filter(e => e.status === "upcoming").length,
    closed: allEvents.filter(e => e.status === "closed").length,
  };

  const TYPES: { label: string; key: EventType }[] = [
    { label: "Tournament", key: "tournament" },
    { label: "League", key: "league" },
    { label: "Camp", key: "camp" },
    { label: "Showcase", key: "showcase" },
  ];

  return (
    <>
      <div className="page-header">
        <div className="crumbs"><span>HOME</span><span className="sep">/</span><span>DISCOVER</span></div>
        <h1>{lang === "TH" ? "ค้นหาการแข่งขัน" : "What's on the court"}</h1>
        <div className={`sub ${lang === "TH" ? "thai" : ""}`}>
          {lang === "TH"
            ? "ทัวร์นาเมนต์ ลีก แคมป์ และโชว์เคสในประเทศไทย"
            : "Tournaments, leagues, camps & showcases across Thailand schools."}
        </div>
      </div>

      <LiveBanner goto={goto} spoiler={spoiler}/>

      <div className="discover-toolbar">
        <div className="tab-row">
          {(["all", "live", "open", "upcoming", "closed"] as Tab[]).map(id => (
            <button key={id} className={`tab ${tab === id ? "active" : ""}`} onClick={() => setTab(id)}>
              {{ all: "All", live: "Live", open: "Registering", upcoming: "Upcoming", closed: "Past" }[id]}
              <span className="count">{counts[id]}</span>
            </button>
          ))}
        </div>
        <div className="filter-row">
          {TYPES.map(t => (
            <button key={t.key} className={`chip ${filterType === t.key ? "active" : ""}`}
              onClick={() => setFilterType(filterType === t.key ? null : t.key)}>{t.label}</button>
          ))}
          <span style={{ width: 8 }} />
          {["Bangkok", "Chiang Mai", "Phuket", "Hua Hin", "Nonthaburi"].map(c => (
            <button key={c} className={`chip ${filterCity === c ? "active" : ""}`}
              onClick={() => setFilterCity(filterCity === c ? null : c)}>{c}</button>
          ))}
        </div>
      </div>

      <div className="event-list">
        <div className="event-list-header">
          <span>Date</span><span>Event</span><span>Type</span><span>Venue</span><span>Division</span><span>Status</span><span></span>
        </div>
        {events.map(e => (
          <button key={e.id} className="event-row" onClick={() => goto({ page: "event", id: e.id })}>
            <div className="date">
              <span className="day">{String(e.day).padStart(2, "0")}</span>
              <span className="mo">{e.mo}</span>
            </div>
            <div className="title">
              <div className="name">{lang === "TH" && e.titleTh ? e.titleTh : e.title}</div>
              <div className="meta">{e.organizer.toUpperCase()}</div>
            </div>
            <div><span className={`type ${e.type}`}>{e.type}</span></div>
            <div className="loc">
              <div>{e.loc}</div>
              <span className="city">{e.city}</span>
            </div>
            <div className="div">{e.div}</div>
            <div><span className={`status ${e.status}`}>{e.statusLabel}</span></div>
            <div className="arrow"><Icon name="arrow"/></div>
          </button>
        ))}
        {events.length === 0 && <div className="empty">No events match your filters.</div>}
      </div>
    </>
  );
}

function LiveBanner({ goto, spoiler }: { goto: (r: Route) => void; spoiler: boolean }) {
  const G = useLiveGame();
  const sa = G.quarters.a.reduce<number>((acc, b) => acc + (b ?? 0), 0);
  const sb = G.quarters.b.reduce<number>((acc, b) => acc + (b ?? 0), 0);
  const aLeading = sa > sb;
  return (
    <div className="live-banner">
      <div className="pill"><span className="dot"/>LIVE NOW</div>
      <div>
        <div className="label">{G.event}</div>
        <div className="matchup">
          <span>{G.teamA.name}</span>
          <span className="vs">vs</span>
          <span>{G.teamB.name}</span>
        </div>
      </div>
      <div className="score-mini" style={{ display: spoiler ? "none" : "flex" }}>
        <span className={aLeading ? "leading" : ""}>{sa}</span>
        <span style={{ color: "oklch(0.5 0.01 270)", fontWeight: 400 }}>·</span>
        <span className={!aLeading ? "leading" : ""}>{sb}</span>
      </div>
      <div className="quarter">
        <div><b>{G.quarter}</b></div>
        <div style={{ marginTop: 4 }}>{G.clock}</div>
      </div>
      <button className="open-btn" onClick={() => goto({ page: "live" })}>Open game →</button>
    </div>
  );
}

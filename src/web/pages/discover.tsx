import { useState } from "react";
import { Icon } from "../components/icon";
import { useEvents, useLiveGame } from "../lib/data";
import type { Route } from "../lib/router";
import { m } from "../lib/i18n";
import { useLocale } from "../lib/locale";
import type { EventStatus, EventType } from "../data";

interface DiscoverProps {
  goto: (r: Route) => void;
  spoiler: boolean;
}

type Tab = "all" | "live" | "open" | "upcoming" | "closed";

export function DiscoverPage({ goto, spoiler }: DiscoverProps) {
  const { locale, reference, name } = useLocale();
  const [tab, setTab] = useState<Tab>("all");
  const [filterCity, setFilterCity] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<EventType | null>(null);
  const { data, isPending, error } = useEvents();
  const allEvents = data ?? [];

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

  // From /api/reference, in the reader's language. This was four hardcoded
  // English labels — the kind of second copy of the PO's vocabulary that ADR
  // 015 exists to stop, and one a Thai reader could never see translated.
  /** A type's name in the reader's language, falling back to its code. */
  const typeLabel = (code: string) =>
    name(reference?.eventTypes.find((t) => t.code === code)?.names, code);

  const CITIES = (reference?.cities ?? []).map((c) => ({
    code: c.code,
    label: name(c.names, c.nameEn),
  }));

  const TYPES = (reference?.eventTypes ?? []).map((t) => ({
    label: name(t.names, t.nameEn),
    key: t.code as EventType,
  }));

  return (
    <>
      <div className="page-header">
        <div className="crumbs"><span>{m.nav_home()}</span><span className="sep">/</span><span>{m.nav_discover()}</span></div>
        <h1>{m.discover_heading()}</h1>
        <div className={`sub ${locale === "th" ? "thai" : ""}`}>{m.discover_sub()}</div>
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
          {/* From /api/reference, in the reader's language. This was five city
              names typed here, three of which — Phuket, Hua Hin, Nonthaburi —
              the PO has never defined, so filtering by them could only ever
              return nothing. */}
          {CITIES.map(c => (
            <button key={c.code} className={`chip ${filterCity === c.label ? "active" : ""}`}
              onClick={() => setFilterCity(filterCity === c.label ? null : c.label)}>{c.label}</button>
          ))}
        </div>
      </div>

      <div className="event-list">
        <div className="event-list-header">
          <span>{m.date()}</span><span>{m.event()}</span><span>{m.type()}</span><span>{m.venue()}</span><span>{m.division()}</span><span>{m.status()}</span><span></span>
        </div>
        {events.map(e => (
          <button key={e.id} className="event-row" onClick={() => goto({ page: "event", id: e.id })}>
            <div className="date">
              <span className="day">{e.day ? String(e.day).padStart(2, "0") : "--"}</span>
              <span className="mo">{e.mo}</span>
            </div>
            <div className="title">
              <div className="name">{e.title}</div>
              <div className="meta">{e.organizer.toUpperCase()}</div>
            </div>
            <div><span className={`type ${e.type.toLowerCase()}`}>{typeLabel(e.type)}</span></div>
            <div className="loc">
              <div>{e.loc}</div>
              <span className="city">{e.city}</span>
            </div>
            <div className="div">{e.div}</div>
            <div><span className={`status ${e.status}`}>{e.statusLabel}</span></div>
            <div className="arrow"><Icon name="arrow"/></div>
          </button>
        ))}
        {isPending && <div className="empty">{m.loading_events()}</div>}
        {error && <div className="empty">Could not load events. Check your connection and retry.</div>}
        {!isPending && !error && events.length === 0 && (
          <div className="empty">
            {allEvents.length === 0 ? "No events yet." : "No events match your filters."}
          </div>
        )}
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
      <button className="open-btn" onClick={() => goto({ page: "live" })}>{m.open_game()}</button>
    </div>
  );
}

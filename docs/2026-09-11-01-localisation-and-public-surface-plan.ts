// Places evaluation — which hosted API can anchor Remy's venues and cities?
//
// Runs a fixed set of real Thai venues (the seed fixtures plus common
// basketball venues) against each source, in English and in Thai, and reports
// per source: found / has Thai name / has English name. No service of ours is
// involved; every source is a public or keyed HTTP API.
//
//   bun scripts/eval-places.ts                # free sources only (Photon, Nominatim, Open-Meteo)
//   GEOAPIFY_KEY=… LOCATIONIQ_KEY=… bun scripts/eval-places.ts
//
// Nominatim's usage policy is 1 request/second with an identifying User-Agent;
// the script sleeps between calls. Do not run it in a loop.

type Venue = { en: string; th: string; city: string }

const VENUES: Venue[] = [
  // The seed fixtures.
  { en: "Assumption College Indoor Court", th: "สนามกีฬาในร่ม โรงเรียนอัสสัมชัญ", city: "Bangkok" },
  { en: "Nimibutr Stadium", th: "สนามกีฬานิมิบุตร", city: "Bangkok" },
  { en: "700th Anniversary Sports Complex", th: "สนามกีฬากลาง 700 ปี", city: "Chiang Mai" },
  { en: "Triam Udom Indoor Court", th: "สนามกีฬาในร่ม โรงเรียนเตรียมอุดมศึกษา", city: "Bangkok" },
  // Where the product will actually be used first.
  { en: "Si Racha Municipal Stadium", th: "สนามกีฬาเทศบาลเมืองศรีราชา", city: "Si Racha" },
  { en: "Chonburi PAO Stadium", th: "สนามกีฬาองค์การบริหารส่วนจังหวัดชลบุรี", city: "Chonburi" },
  { en: "Nongprue Stadium", th: "สนามกีฬาหนองปรือ", city: "Pattaya" },
  // Bangkok basketball venues a league would book.
  { en: "Hua Mark Indoor Stadium", th: "อินดอร์สเตเดียม หัวหมาก", city: "Bangkok" },
  { en: "Stadium 29", th: "สเตเดียม 29", city: "Nonthaburi" },
  { en: "Thai-Japanese Stadium", th: "ศูนย์เยาวชนกรุงเทพมหานคร (ไทย-ญี่ปุ่น)", city: "Bangkok" },
]

const UA = "remy-sport places-eval (gerard.webb@ubuntusoftware.net)"
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

type Hit = { id: string; name?: string; nameTh?: string; nameEn?: string }
type Source = { name: string; search: (q: string, v: Venue) => Promise<Hit[]> }

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return res.json()
}

/** Loose match: the venue's own name (either language) appears in a hit's names, or vice versa. */
function matches(v: Venue, h: Hit): boolean {
  const norm = (s?: string) => (s ?? "").toLowerCase().replace(/[\s\-–()]/g, "")
  const mine = [v.en, v.th].map(norm)
  const theirs = [h.name, h.nameTh, h.nameEn].map(norm).filter(Boolean)
  return theirs.some((t) => mine.some((m) => t.includes(m) || m.includes(t)))
}

const isThai = (s?: string) => !!s && /[\u0E00-\u0E7F]/.test(s)

const photon: Source = {
  name: "Photon (OSM, free)",
  async search(q) {
    const d = await getJson(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=5`)
    return (d.features ?? []).map((f: any) => ({
      id: `${f.properties.osm_type}${f.properties.osm_id}`,
      name: f.properties.name,
    }))
  },
}

const nominatim: Source = {
  name: "Nominatim (OSM, free)",
  async search(q) {
    await sleep(1100)
    const d = await getJson(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&countrycodes=th&format=json&limit=5&namedetails=1`,
    )
    return d.map((r: any) => ({
      id: `${r.osm_type[0].toUpperCase()}${r.osm_id}`,
      name: r.namedetails?.name,
      nameTh: r.namedetails?.["name:th"],
      nameEn: r.namedetails?.["name:en"],
    }))
  },
}

const geoapify: Source | null = process.env.GEOAPIFY_KEY
  ? {
      name: "Geoapify (OSM, keyed)",
      async search(q) {
        const d = await getJson(
          `https://api.geoapify.com/v1/geocode/autocomplete?text=${encodeURIComponent(q)}&filter=countrycode:th&limit=5&apiKey=${process.env.GEOAPIFY_KEY}`,
        )
        return (d.features ?? []).map((f: any) => ({
          id: f.properties.datasource?.raw?.osm_id ? `osm:${f.properties.datasource.raw.osm_id}` : f.properties.place_id,
          name: f.properties.name,
        }))
      },
    }
  : null

const locationiq: Source | null = process.env.LOCATIONIQ_KEY
  ? {
      name: "LocationIQ (OSM, keyed)",
      async search(q) {
        const d = await getJson(
          `https://api.locationiq.com/v1/autocomplete?q=${encodeURIComponent(q)}&countrycodes=th&limit=5&namedetails=1&key=${process.env.LOCATIONIQ_KEY}`,
        )
        return d.map((r: any) => ({
          id: `${(r.osm_type ?? "?")[0].toUpperCase()}${r.osm_id}`,
          name: r.display_place ?? r.namedetails?.name,
          nameTh: r.namedetails?.["name:th"],
          nameEn: r.namedetails?.["name:en"],
        }))
      },
    }
  : null

/** OSM hits from Photon carry one name; ask Nominatim for the multilingual tags behind that id. */
async function enrich(hits: Hit[]): Promise<Hit[]> {
  const ids = hits.map((h) => h.id).filter((id) => /^[NWR]\d+$/.test(id))
  if (!ids.length) return hits
  await sleep(1100)
  const d = await getJson(
    `https://nominatim.openstreetmap.org/lookup?osm_ids=${ids.join(",")}&format=json&namedetails=1`,
  )
  const byId = new Map<string, any>(d.map((r: any) => [`${r.osm_type[0].toUpperCase()}${r.osm_id}`, r]))
  return hits.map((h) => {
    const r = byId.get(h.id)
    return r
      ? { ...h, name: r.namedetails?.name ?? h.name, nameTh: r.namedetails?.["name:th"], nameEn: r.namedetails?.["name:en"] }
      : h
  })
}

type Row = { venue: string; source: string; lang: "en" | "th"; found: boolean; th: boolean; en: boolean; hit?: string }

async function run() {
  const sources = [photon, nominatim, geoapify, locationiq].filter((s): s is Source => !!s)
  const rows: Row[] = []

  for (const v of VENUES) {
    for (const s of sources) {
      for (const lang of ["en", "th"] as const) {
        const q = `${lang === "en" ? v.en : v.th} ${v.city}`
        let hits: Hit[] = []
        try {
          hits = await s.search(q, v)
          if (s === photon) hits = await enrich(hits)
        } catch (e) {
          rows.push({ venue: v.en, source: s.name, lang, found: false, th: false, en: false, hit: `ERR ${(e as Error).message.slice(0, 40)}` })
          continue
        }
        const hit = hits.find((h) => matches(v, h))
        rows.push({
          venue: v.en,
          source: s.name,
          lang,
          found: !!hit,
          th: !!hit && (isThai(hit.nameTh) || isThai(hit.name)),
          en: !!hit && (!!hit.nameEn || (!!hit.name && !isThai(hit.name))),
          hit: hit ? `${hit.id} ${hit.nameTh ?? ""} | ${hit.nameEn ?? hit.name ?? ""}` : hits[0]?.name ? `(top: ${hits[0].name})` : "",
        })
      }
    }
  }

  // Summary per source.
  console.log("\n== Summary (out of %d venues, best of en/th query) ==", VENUES.length)
  for (const s of sources) {
    const per = VENUES.map((v) => rows.filter((r) => r.source === s.name && r.venue === v.en))
    const found = per.filter((rs) => rs.some((r) => r.found)).length
    const th = per.filter((rs) => rs.some((r) => r.th)).length
    const en = per.filter((rs) => rs.some((r) => r.en)).length
    const both = per.filter((rs) => rs.some((r) => r.th) && rs.some((r) => r.en)).length
    console.log(`${s.name.padEnd(26)} found ${found}  thai ${th}  english ${en}  both ${both}`)
  }

  console.log("\n== Detail ==")
  for (const r of rows) {
    console.log(
      `${r.found ? "✓" : "✗"} ${r.venue.padEnd(34)} ${r.source.padEnd(26)} ${r.lang}  th:${r.th ? "y" : "-"} en:${r.en ? "y" : "-"}  ${r.hit ?? ""}`,
    )
  }

  // Cities, for completeness: Open-Meteo with language=th.
  console.log("\n== Cities via Open-Meteo geocoding (language=th) ==")
  for (const city of [...new Set(VENUES.map((v) => v.city))]) {
    const d = await getJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&language=th&count=1`)
    const r = d.results?.[0]
    console.log(`${city.padEnd(12)} ${r ? `${r.id} ${r.name} (${r.admin1 ?? ""}) ${r.latitude},${r.longitude} tz=${r.timezone}` : "not found"}`)
  }
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
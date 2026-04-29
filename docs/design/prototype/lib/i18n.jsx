// claude-design: app/lib/i18n.jsx
// i18n hook + helpers. Today's MESSAGES dict is hardcoded; production
// swap to react-intl or i18next replaces useT() and the dict, without
// changing call-sites.
//
// Two access patterns:
//   1. const t = useT(lang);  t('discover.heading')   — for page-level labels
//   2. tLocal(item, 'name', lang)  — for data with parallel <field> / <field>Th

const MESSAGES = {
  en: {
    discover: {
      heading: "What's on the court",
      sub: 'Find tournaments, leagues, camps, and showcases. Browse by city, format, or status.',
    },
  },
  th: {
    discover: {
      heading: 'ค้นหาการแข่งขัน',
      sub: 'ค้นหาทัวร์นาเมนต์ ลีก แคมป์ และโชว์เคส กรองตามเมือง รูปแบบ หรือสถานะ',
    },
  },
};

function _get(obj, path) {
  return path.split('.').reduce((acc, k) => acc && acc[k], obj);
}

function useT(lang) {
  const dict = MESSAGES[(lang || 'EN').toLowerCase()] || MESSAGES.en;
  return function t(key, vars) {
    let v = _get(dict, key);
    if (v == null) v = _get(MESSAGES.en, key);
    if (v == null) {
      console.warn(`[i18n] missing key: ${key}`);
      return key;
    }
    if (vars) {
      return Object.entries(vars).reduce(
        (s, [k, val]) => s.replace(new RegExp(`\\{${k}\\}`, 'g'), val), v);
    }
    return v;
  };
}

// Pick the right field on a data item based on current language.
// Falls back to the base field if the Th variant is missing.
function tLocal(item, base, lang) {
  const thKey = base + 'Th';
  if (lang === 'TH' && item && item[thKey]) return item[thKey];
  return item ? item[base] : '';
}

window.RemyI18n = { useT, tLocal, MESSAGES };

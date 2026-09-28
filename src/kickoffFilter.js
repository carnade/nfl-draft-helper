// Filtering games and props by when they kick off.
//
// Everything here works in the browser's own timezone, deliberately: the tables
// print kickoffs with toLocaleDateString and no zone, so the filter labels and
// the rows beside them have to agree. Watching from Europe that means Thursday
// night football files under Friday and Sunday night under Monday — which is
// also how it actually arrives, at quarter past two in the morning.

function localParts(iso) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return {
    day: date.toLocaleDateString(undefined, { weekday: "short" }),
    time: date.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }),
    at: date.getTime(),
  };
}

export const kickoffDay = (iso) => localParts(iso)?.day ?? null;
export const kickoffTime = (iso) => localParts(iso)?.time ?? null;

export const EMPTY_KICKOFF_FILTER = { days: [], times: [] };

/**
 * The days and kickoff times present in these rows, as filter options.
 *
 * Days come back in the order they occur rather than alphabetically, so a week
 * reads Fri, Sun, Mon, Tue instead of Fri, Mon, Sun, Tue. Times sort by the
 * clock, which within any one day is the same thing.
 */
export function buildKickoffOptions(rows, getTime = (row) => row?.commence_time) {
  const firstSeen = new Map();
  const times = new Set();

  (rows || []).forEach((row) => {
    const parts = localParts(getTime(row));
    if (!parts) return;
    if (!firstSeen.has(parts.day) || parts.at < firstSeen.get(parts.day)) {
      firstSeen.set(parts.day, parts.at);
    }
    times.add(parts.time);
  });

  return {
    days: [...firstSeen.entries()].sort((a, b) => a[1] - b[1]).map(([day]) => day),
    times: [...times].sort(),
  };
}

/** Nothing selected means no filtering, rather than nothing shown. */
export function matchesKickoff(iso, filter = EMPTY_KICKOFF_FILTER) {
  const days = filter?.days || [];
  const times = filter?.times || [];
  if (days.length === 0 && times.length === 0) return true;

  const parts = localParts(iso);
  // A row with no kickoff cannot satisfy a filter about kickoffs.
  if (!parts) return false;

  if (days.length && !days.includes(parts.day)) return false;
  if (times.length && !times.includes(parts.time)) return false;
  return true;
}

export function filterByKickoff(rows, filter, getTime = (row) => row?.commence_time) {
  const days = filter?.days || [];
  const times = filter?.times || [];
  if (days.length === 0 && times.length === 0) return rows || [];
  return (rows || []).filter((row) => matchesKickoff(getTime(row), filter));
}

/** Toggle one value in or out of `days` or `times`. */
export function toggleKickoffValue(filter, field, value) {
  const current = filter?.[field] || [];
  const next = current.includes(value)
    ? current.filter((v) => v !== value)
    : [...current, value];
  return { ...EMPTY_KICKOFF_FILTER, ...filter, [field]: next };
}

export const kickoffFilterIsEmpty = (filter) =>
  (filter?.days || []).length === 0 && (filter?.times || []).length === 0;

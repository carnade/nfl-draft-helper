// The current NFL week, cached per browser session.
//
// This used to be read straight out of sessionStorage with no expiry, unlike
// every other cache beside it. sessionStorage lives as long as the tab does, so
// a tab left open across the Tuesday rollover kept serving the old week — and
// DFS.js reads this to decide which week a submitted lineup belongs to, so a
// stale value files the lineup against the wrong week entirely.
//
// An hour, matching the DFS salary and player caches next to it. The week only
// turns over once a week, and /state/nfl is a tiny request, so the bound costs
// nothing and keeps every reader honest.
const KEY = 'nfl_current_week';
const STAMP_KEY = 'nfl_current_week_timestamp';
const TTL_MS = 60 * 60 * 1000;
const STATE_URL = 'https://api.sleeper.app/v1/state/nfl';

// Safari's private mode throws on storage access rather than returning null.
function safeGet(key) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * The cached week, or null when it is absent, unparseable or older than the TTL.
 * Synchronous — for render paths that cannot await. Anything that needs a week
 * to be correct should use getCurrentWeek() instead.
 */
export function peekCurrentWeek() {
  const raw = safeGet(KEY);
  if (!raw) return null;

  // A value written before this cache had timestamps has no way to prove its
  // age, so treat it as expired and let it be fetched again.
  const stamp = parseInt(safeGet(STAMP_KEY), 10);
  if (!stamp || Date.now() - stamp >= TTL_MS) return null;

  const week = parseInt(raw, 10);
  return Number.isNaN(week) ? null : week;
}

export function cacheCurrentWeek(week) {
  try {
    sessionStorage.setItem(KEY, String(week));
    sessionStorage.setItem(STAMP_KEY, Date.now().toString());
  } catch {
    // Storage being unavailable only costs us the cache, not the week itself.
  }
}

/**
 * The current NFL week, from cache when it is still fresh and from Sleeper
 * otherwise. Resolves to null only if the fetch itself fails.
 */
export async function getCurrentWeek() {
  const cached = peekCurrentWeek();
  if (cached !== null) return cached;

  try {
    const data = await fetch(STATE_URL).then((res) => res.json());
    if (data?.week == null) return null;
    cacheCurrentWeek(data.week);
    return data.week;
  } catch (err) {
    console.error('Error fetching current week:', err);
    return null;
  }
}

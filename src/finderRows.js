// The joined player row our backend serves for the Player Finder.
//
// One row per QB/RB/WR/TE with dynasty values, season scoring and the strength
// -of-schedule block — about 550 rows and 290 KB, rebuilt three times a week,
// so an hour's cache is conservative.
//
// Lifted out of PlayerFinder once the Contender tab wanted the same payload for
// its schedule figures. Both tabs live on the Trade Helper page and both are
// mounted at once, so two copies of this loader would mean two downloads of the
// same 290 KB on the same page view. Sharing the key means the second reader
// pays nothing.

import { readCache, writeCache } from "./ttlCache";

const BASE_URL = process.env.REACT_APP_MOCK
  ? "http://localhost:5000"
  : "https://shaggy-latashia-carnade-2ea2054a.koyeb.app";

export const FINDER_CACHE_KEY = "player_finder_rows_v1";
export const FINDER_TTL_MS = 60 * 60 * 1000;

/** The raw rows, from cache when they are fresh enough. Throws on a failure. */
export async function fetchFinderRows({ signal } = {}) {
  const cached = readCache(FINDER_CACHE_KEY, FINDER_TTL_MS);
  if (cached) return cached;

  const response = await fetch(`${BASE_URL}/player-finder/data`, { signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const rows = await response.json();
  writeCache(FINDER_CACHE_KEY, rows);
  return rows;
}

/** What is already in the cache, or null. For a reader that must not fetch. */
export function peekFinderRows() {
  return readCache(FINDER_CACHE_KEY, FINDER_TTL_MS);
}

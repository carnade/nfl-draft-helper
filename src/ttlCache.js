// A fetched value kept in sessionStorage for a while.
//
// The same twin-key pattern was written inline in StartSit.js and copied around
// (DFS.js, DFSResults.js, LeagueList.js each have their own version). This is
// that pattern, once: the value under `key` and its age under `key_timestamp`.
//
// Storage can be full, blocked, or — in Safari's private mode — throw outright
// rather than returning null, so every access is guarded and a failure costs
// only the cache.
export function readCache(key, ttlMs) {
  try {
    const raw = sessionStorage.getItem(key);
    const at = sessionStorage.getItem(`${key}_timestamp`);
    if (!raw || !at) return null;
    if (Date.now() - parseInt(at, 10) > ttlMs) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function writeCache(key, value) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
    sessionStorage.setItem(`${key}_timestamp`, Date.now().toString());
  } catch {
    // Nothing to do — the caller just refetches next time.
  }
}

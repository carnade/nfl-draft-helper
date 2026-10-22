// A finished week's summary, kept across visits.
//
// This is the companion to finalWeekCache, and the difference between them is
// the point. That one holds a week's raw scores in sessionStorage: it is what
// the cards view needs, it is 5 KB per league-week — near 4 MB for a season of
// forty leagues, which will not fit beside everything else this origin stores —
// and re-fetching it when you actually open a week is cheap.
//
// The season table does not need any of that. It needs four numbers per
// league-week, which is about forty bytes, or some thirty kilobytes for a whole
// season. That fits in localStorage without a thought, so it goes there and
// survives the tab closing. Coming back two days later used to mean loading
// every league again, because the only copy died with the session.
//
// Keeping the summary rather than the rows also removes a dependency that made
// a cold start awkward: `max` needs each player's position, and those are only
// learnt from a projections fetch. Stored already computed, nothing has to be
// worked out again.
//
// No expiry. A week whose games are all complete does not change. The version
// in the prefix is the escape hatch instead: if what a summary holds ever
// changes, bump it and every old entry is ignored rather than misread.

const PREFIX = "gameday_season_v1";

const keyFor = (leagueId, week) => `${PREFIX}_${leagueId}_${week}`;

// Safari's private mode throws on access rather than returning null, and a full
// quota throws on write. A cache that cannot be used should cost nothing but
// the saving.
function safeGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * A stored summary, `null` if that roster did not play, or `undefined` if the
 * week was never stored.
 *
 * Three states rather than two because the table shows them differently: a bye
 * is a dash, an unstored week offers to load itself. They are wrapped in an
 * object on the way in so a stored `null` is distinguishable from a miss.
 */
export function readSeasonWeek(leagueId, week) {
  const raw = safeGet(keyFor(leagueId, week));
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !("s" in parsed)) return undefined;
    return parsed.s;
  } catch {
    return undefined;
  }
}

/**
 * Keep a week's summary, if the week is finished.
 *
 * Returns whether it was kept, which is only of interest to a test — a caller
 * that failed to cache should carry on regardless.
 */
export function writeSeasonWeek(leagueId, week, summary, { isFinal } = {}) {
  if (!isFinal) return false;
  if (summary !== null && typeof summary !== "object") return false;
  try {
    localStorage.setItem(keyFor(leagueId, week), JSON.stringify({ s: summary }));
    return true;
  } catch {
    // Out of room, or storage blocked. The week is simply summarised again.
    return false;
  }
}

/**
 * Everything already known for these leagues, as `leagueId -> week -> summary`.
 *
 * Asked for in one pass on arrival so a cold page fills the table from storage
 * before deciding what is actually missing.
 */
export function readSeasonWeeks(leagueIds = [], weeks = []) {
  const out = {};
  for (const leagueId of leagueIds) {
    for (const week of weeks) {
      const summary = readSeasonWeek(leagueId, week);
      if (summary === undefined) continue;
      out[leagueId] = { ...(out[leagueId] || {}), [week]: summary };
    }
  }
  return out;
}

/** Drop everything this cache holds. For a stored shape that has gone wrong. */
export function clearSeasonCache() {
  try {
    const doomed = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith(PREFIX)) doomed.push(key);
    }
    doomed.forEach((key) => localStorage.removeItem(key));
    return doomed.length;
  } catch {
    return 0;
  }
}

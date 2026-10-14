// A finished week's scores, kept for as long as the tab lives.
//
// No expiry, deliberately, unlike every other cache in here. Those guard
// against data that moves — projections drift with injury news, the current
// week rolls over on a Tuesday. A week whose every game is complete does not
// move again, so re-asking for it can only ever return the same thing.
//
// Only the caller knows whether a week is finished, so it has to say so.
// Caching a week still being played would freeze a live score.
//
// `players` is not stored: it is exactly the keys of `players_points` in every
// roster-week checked, so it is rebuilt on the way out. That halves what this
// costs, which matters — a manager with sixty leagues would otherwise be
// asking sessionStorage to hold more than it will take.

const PREFIX = "gameday_week";

const keyFor = (leagueId, week) => `${PREFIX}_${leagueId}_${week}`;

// Safari's private mode throws on storage access rather than returning null,
// and a full quota throws on write. A cache that cannot be used should cost
// nothing but the saving.
function safeGet(key) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

/** The fields worth keeping. The rest is recomputed or unused. */
function slim(rows) {
  return (Array.isArray(rows) ? rows : []).map((r) => ({
    r: r.roster_id,
    m: r.matchup_id,
    p: r.points,
    pp: r.players_points || {},
  }));
}

function expand(rows) {
  return rows.map((r) => ({
    roster_id: r.r,
    matchup_id: r.m,
    points: r.p,
    players_points: r.pp || {},
    players: Object.keys(r.pp || {}),
  }));
}

/** A finished week's rows, in the shape the API returns them, or null. */
export function readFinalWeek(leagueId, week) {
  const raw = safeGet(keyFor(leagueId, week));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? expand(parsed) : null;
  } catch {
    return null;
  }
}

/**
 * Keep a week, if it is finished.
 *
 * Returns whether it was kept, which is only of interest to a test — a caller
 * that failed to cache should carry on regardless.
 */
export function writeFinalWeek(leagueId, week, rows, { isFinal }) {
  if (!isFinal) return false;
  if (!Array.isArray(rows) || rows.length === 0) return false;
  try {
    sessionStorage.setItem(keyFor(leagueId, week), JSON.stringify(slim(rows)));
    return true;
  } catch {
    // Out of room, or storage blocked. The week is simply fetched again.
    return false;
  }
}

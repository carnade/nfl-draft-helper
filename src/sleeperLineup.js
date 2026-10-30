// Which players a roster is actually starting this week.
//
// Sleeper answers this two ways and they disagree, which is the reason this
// module exists rather than every caller reading the obvious-looking field.
//
//   /league/{id}/rosters      → `starters`, which lags. Observed three slots
//                               wrong on a live roster with nothing locked yet.
//   /league/{id}/matchups/{w} → `starters` for that week, which is what the
//                               Sleeper app itself shows and what scoring uses:
//                               `starters_points[i]` lines up with
//                               `starters[i]`, index for index.
//
// The matchup is also where a lineup change is *written* — StartSit's submit
// goes through the `update_matchup_leg` mutation, keyed on league, roster and
// week. Reading the roster's copy while writing the matchup's meant reading one
// store and writing another, so a lineup set in the Sleeper app, or set here
// and then reloaded, showed the lineup it used to be.
//
// The roster endpoint is still the right place for the squad itself — the
// `players`, `reserve` and `taxi` lists. It is only `starters` that should not
// be trusted from it.

/**
 * The starters for `rosterId` from a week's matchup rows.
 *
 * Returns null, not an empty list, when this roster has no row — so a caller
 * can tell "not playing / not loaded" from "nobody started", which are
 * different things and only one of them is worth falling back for.
 */
export function startersFromMatchups(rows, rosterId) {
  if (!Array.isArray(rows) || rosterId == null) return null;
  const mine = rows.find((row) => String(row?.roster_id) === String(rosterId));
  return Array.isArray(mine?.starters) ? mine.starters : null;
}

/**
 * The best available answer: the matchup's lineup, or the roster's if there
 * isn't one.
 *
 * The fallback covers a failed request and a week a league has no matchup for.
 * A stale lineup is worse than a fresh one and better than none — losing the
 * lineup entirely would empty the page, and the bench is derived from it.
 */
export function startersFor(matchupRows, roster) {
  const fromMatchup = startersFromMatchups(matchupRows, roster?.roster_id);
  if (fromMatchup) return fromMatchup;
  return Array.isArray(roster?.starters) ? roster.starters : [];
}

/** One week's matchup rows for a league, or [] if they cannot be had. */
export function fetchMatchups(leagueId, week, { signal } = {}) {
  return fetch(`https://api.sleeper.app/v1/league/${leagueId}/matchups/${week}`, { signal })
    .then((response) => (response.ok ? response.json() : []))
    .then((rows) => (Array.isArray(rows) ? rows : []))
    .catch(() => []);
}

// Recent form and season rate, priced in a league's own scoring.
//
// Start/Sit used to take L5 from the DFS salary scrape, which is DraftKings
// scoring: no TE premium, no SuperFlex, none of the things that make one league
// differ from another. It sat next to a Proj column that *is* priced in the
// league's scoring, on a different scale, and the header had to apologise for
// it. Measured on a TEP league, the gap averaged a point a game across 72 tight
// ends and reached 4.3 for Trey McBride — against the column the start/sit call
// is read from.
//
// Sleeper serves actual stats keyed exactly like its projections, so the same
// projectedPoints() that prices Proj prices these too, and both end up on the
// league's own scale.

export const weekStatsUrl = (season, week) =>
  `https://api.sleeper.com/stats/nfl/${season}/${week}?season_type=regular`;

export const seasonStatsUrl = (season) =>
  `https://api.sleeper.com/stats/nfl/${season}?season_type=regular`;

/** Every stat any of these leagues actually scores, plus games played. */
export function scoringStatKeys(leagues) {
  const keys = new Set(["gp"]);
  (leagues || []).forEach((league) => {
    Object.keys(league?.scoring_settings || {}).forEach((key) => keys.add(key));
  });
  return keys;
}

/**
 * A week's rows cut down to the stats that can score, keyed by player.
 *
 * Sleeper publishes ~2,300 rows a week at about 640 KB. Keeping only scoring
 * stats takes that to 30 KB, which matters because five weeks of it share
 * sessionStorage with the projections cache.
 */
export function reduceStatRows(rows, keepKeys) {
  const out = {};
  for (const row of Array.isArray(rows) ? rows : []) {
    const stats = row?.stats;
    if (!stats) continue;
    const kept = {};
    for (const [key, value] of Object.entries(stats)) {
      if (typeof value === "number" && keepKeys.has(key)) kept[key] = value;
    }
    if (Object.keys(kept).length) out[String(row.player_id)] = kept;
  }
  return out;
}

/**
 * Points per game across the season so far, in this league's scoring.
 *
 * The league page computes this as pts_ppr / gp, which is standard PPR whatever
 * the league actually plays. Here it has to agree with the Proj beside it.
 */
export function fptsPerGame(seasonStats, scoring, scorePoints) {
  const games = seasonStats?.gp;
  if (!seasonStats || !games || games <= 0) return null;
  return scorePoints(seasonStats, scoring) / games;
}

/**
 * Average over the last `count` weeks the player appeared in.
 *
 * Returns the number of games it actually found as well as the average: early
 * in a season "L5" is necessarily fewer than five, and a two-game average
 * deserves to be read differently from a five-game one.
 */
export function recentForm(weeklyStats, playerId, scoring, scorePoints, count = 5) {
  const id = String(playerId);
  const scores = [];

  // weeklyStats is newest-first; stop once we have enough.
  for (const week of weeklyStats || []) {
    if (scores.length >= count) break;
    const stats = week?.[id];
    // A player who did not appear has no row at all, which is not a zero.
    if (!stats) continue;
    if (!stats.gp) continue;
    scores.push(scorePoints(stats, scoring));
  }

  if (scores.length === 0) return { average: null, games: 0 };
  return {
    average: scores.reduce((sum, value) => sum + value, 0) / scores.length,
    games: scores.length,
  };
}

/** The weeks to average over: the ones already played, newest first. */
export function playedWeeksBefore(currentWeek, count = 5) {
  const weeks = [];
  for (let week = Number(currentWeek) - 1; week >= 1 && weeks.length < count; week -= 1) {
    weeks.push(week);
  }
  return weeks;
}

// Pricing a Sleeper projection in a league's own scoring.
//
// Sleeper publishes projections as raw stat lines (rec_yd, rush_td, bonus_rec_te …)
// plus its own pts_ppr. That pts_ppr is standard PPR, which is wrong for most of
// these leagues — TE premium and SuperFlex change what a player is worth — so the
// stats are priced against each league's scoring_settings instead.
//
// Measured against Sleeper's own numbers: this reproduces pts_ppr to within ±0.06
// at every position including K and DEF, and correctly adds the TE premium on top
// (a 0.5-premium league prices a 6.7-reception TE about +3.3 above pts_ppr).

// Projections for every player would be 5.4 MB; restricting to the positions that
// can start brings it under 2 MB.
export const PROJECTION_POSITIONS = ["QB", "RB", "WR", "TE", "K", "DEF"]
  .map((p) => `position[]=${p}`)
  .join("&");

// Gameday relies on this too: Sleeper's proj_points is the pre-week projection and
// does not move once games start, which is why it drifts from the number Sleeper's
// own app shows. That number is the same sum with played starters swapped for what
// they actually scored, so it is computed the same way — projected stats priced by
// the league's scoring settings, replaced by real points as they come in.
export function projectedPoints(stats, scoring) {
  if (!stats || !scoring) return 0;
  let total = 0;
  for (const [stat, value] of Object.entries(stats)) {
    const multiplier = scoring[stat];
    if (typeof value === "number" && typeof multiplier === "number") {
      total += value * multiplier;
    }
  }
  return total;
}

// Whether Sleeper actually projects this player at all. Of ~3300 rows in a week
// only ~466 carry a real projection; the rest are roster filler. This matters
// because projectedPoints returns 0 for a missing stat map, which is
// indistinguishable from a genuine zero — a start/sit verdict has to tell "not
// projected" apart from "projected to score nothing".
export function hasProjection(stats) {
  if (!stats) return false;
  return typeof stats.pts_ppr === "number" || typeof stats.pts_std === "number";
}

export function fetchWeekProjectionsUrl(season, week) {
  return `https://api.sleeper.com/projections/nfl/${season}/${week}?season_type=regular&${PROJECTION_POSITIONS}`;
}

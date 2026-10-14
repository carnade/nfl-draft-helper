// A season's worth of weeks for one roster: what it scored, what it could have
// scored, and how close those were.
//
// Pure. The weeks arrive one at a time as they are loaded, so everything here
// copes with a partial season rather than assuming the whole thing is present.

import { bestLineupPoints } from "./bestLineup";

/**
 * One week for one roster, or null if that roster did not play it.
 *
 * `rows` is the matchups payload for the league and week.
 */
export function summariseWeek({ rows, rosterId, rosterPositions, positionsOf } = {}) {
  const mine = (Array.isArray(rows) ? rows : []).find((r) => r?.roster_id === rosterId);
  if (!mine) return null;

  const points = Math.round((Number(mine.points) || 0) * 100) / 100;
  const max = bestLineupPoints({
    rosterPositions,
    players: mine.players || Object.keys(mine.players_points || {}),
    playerPoints: mine.players_points || {},
    positionsOf,
  });

  return { points, max, pct: percentOfMax(points, max) };
}

/**
 * How much of the available points were actually started.
 *
 * Null rather than 100 when the best lineup is zero: a week nobody scored in
 * is not a perfectly managed one, and dividing by it says nothing.
 */
export function percentOfMax(points, max) {
  if (max == null || max <= 0) return null;
  return Math.round((points / max) * 1000) / 10;
}

/**
 * The season so far, across however many weeks have been loaded.
 *
 * The percentage is the total scored over the total available, not the mean of
 * the weekly percentages. A 50% week where eight points were on offer should
 * not weigh the same as a 50% week where two hundred were.
 */
export function summariseSeason(weeks = []) {
  const played = weeks.filter((w) => w && typeof w.points === "number");
  if (played.length === 0) return null;

  const points = played.reduce((n, w) => n + w.points, 0);
  const withMax = played.filter((w) => typeof w.max === "number");
  const max = withMax.reduce((n, w) => n + w.max, 0);

  const round = (n) => Math.round(n * 100) / 100;
  return {
    weeks: played.length,
    points: round(points / played.length),
    max: withMax.length ? round(max / withMax.length) : null,
    // Over the weeks a maximum is known for, so a part-loaded season is not
    // compared against points it has no ceiling for.
    pct: withMax.length
      ? percentOfMax(
          withMax.reduce((n, w) => n + w.points, 0),
          max
        )
      : null,
  };
}

/** Which weeks are finished but not yet loaded, for the league's own list. */
export function missingWeeks(statuses = {}, loaded = {}) {
  return Object.keys(statuses)
    .map(Number)
    .filter((week) => statuses[week] === "done" && loaded[week] === undefined)
    .sort((a, b) => a - b);
}

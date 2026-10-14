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

  return {
    points,
    max,
    pct: percentOfMax(points, max),
    result: weekResult(rows, mine),
  };
}

/**
 * W, L or T for the week, or null on a bye.
 *
 * The opponent is whoever else carries the same matchup_id. A roster with no
 * pairing that week had nobody to beat.
 */
export function weekResult(rows, mine) {
  if (mine?.matchup_id == null) return null;
  const opponent = (Array.isArray(rows) ? rows : []).find(
    (r) => r !== mine && r?.matchup_id === mine.matchup_id
  );
  if (!opponent) return null;

  // Compared at the two decimals the scores are quoted to, so the letter
  // cannot disagree with the numbers beside it.
  const round = (n) => Math.round((Number(n) || 0) * 100);
  const ours = round(mine.points);
  const theirs = round(opponent.points);
  if (ours > theirs) return "W";
  if (ours < theirs) return "L";
  return "T";
}

// 84 to 86 reads neutral — managing a lineup to within a sixth of its ceiling
// is par, not praiseworthy. Four steps either side of that, to full red at 70
// and full green at 100. The two sides take different sized steps because the
// bands are different widths; what matters is that the extremes land where
// they are expected.
//
//   r1 80.5-84    g1 86-89.5
//   r2 77-80.5    g2 89.5-93
//   r3 73.5-77    g3 93-96.5
//   r4 below 73.5 g4 96.5 and up
//
// A hundred percent is gold rather than simply the greenest, because starting
// the best lineup available is a different thing from nearly doing so.
const NEUTRAL_LOW = 84;
const NEUTRAL_HIGH = 86;
const RED_FLOOR = 70;
const GREEN_CEIL = 100;
const STEPS = 4;

const RED_STEP = (NEUTRAL_LOW - RED_FLOOR) / STEPS;
const GREEN_STEP = (GREEN_CEIL - NEUTRAL_HIGH) / STEPS;

/**
 * A tone for a percentage: "gold", "g1".."g4", "", or "r1".."r4".
 *
 * Stepped rather than continuous. A table of numbers is easier to read down
 * when two similar figures share a colour than when every cell is a slightly
 * different shade.
 */
export function pctTone(pct) {
  if (pct == null) return "";
  if (pct >= 100) return "gold";
  if (pct >= NEUTRAL_LOW && pct <= NEUTRAL_HIGH) return "";
  if (pct < NEUTRAL_LOW) {
    const step = Math.min(STEPS, Math.ceil((NEUTRAL_LOW - pct) / RED_STEP));
    return `r${step}`;
  }
  const step = Math.min(STEPS, Math.ceil((pct - NEUTRAL_HIGH) / GREEN_STEP));
  return `g${step}`;
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

// What a trade does to the weeks that are left.
//
// The Trade Helper prices a trade in dynasty currency. A contender is asking a
// different question: does the lineup I actually field between now and the final
// get better, and by how much? That cannot be answered by summing the players
// involved, because a 4-for-2 changes who starts. Two of the four were on the
// bench anyway and contribute nothing; the two coming back displace two starters
// whose points stop counting. Only re-optimising the whole lineup gets it right.
//
// So everything here is built on one idea: price every player for a given week,
// run the lineup optimiser, and difference the totals. Done once per week of the
// horizon rather than once for the horizon, because a bye is a week-shaped event.
//
// Three states a player can be in for a week, kept apart deliberately:
//
//   on bye      removed from the pool, so the slot is refilled from the bench.
//               This is the whole reason the horizon is walked week by week.
//   priced      a real number, from projections or from a season rate.
//   unpriced    in the pool at zero, and flagged. Not removed: removing them
//               would shrink the roster and let the optimiser promote someone
//               who is not genuinely the better start. At zero they are only
//               ever started when nothing else is eligible, which is correct —
//               and the flag is what lets the page admit it rather than quietly
//               showing a confident number built on a guess.
//
// `pointsFor(id, week)` returning null is how "unpriced" arrives. Null and zero
// are different claims and the caller must not conflate them, which is why this
// module takes a function rather than a map of numbers.

import { bestLineupSlots } from "./bestLineup";
import { byeTeamsFor } from "./nflSchedule";

/** Sleeper's own default, and what every real league on this account uses. */
export const DEFAULT_PLAYOFF_WEEK_START = 15;

/** Fantasy playoffs are three rounds. Week 18 is nobody's final. */
export const PLAYOFF_ROUNDS = 3;

const MAX_WEEK = 18;

const round2 = (n) => Math.round(n * 100) / 100;

const range = (from, to) => {
  const out = [];
  for (let week = from; week <= to; week += 1) out.push(week);
  return out;
};

/**
 * The two windows the page compares over, from this week forward.
 *
 * `playoffWeekStart` comes from the league, because not every league plays its
 * final in week 17 — but it arrives as 0 on best-ball leagues, and 0 would make
 * the regular season the whole season, so anything outside a plausible range
 * falls back to Sleeper's default.
 *
 * Both windows start no earlier than the current week: there is nothing to
 * decide about a week already played. In week 16 the regular-season window is
 * therefore empty and the playoff one is [16, 17], which is the honest answer
 * rather than a figure for games that are over.
 */
export function windowsFor(currentWeek, playoffWeekStart, { rounds = PLAYOFF_ROUNDS } = {}) {
  const start = Number(playoffWeekStart);
  const playoffStart =
    Number.isFinite(start) && start >= 2 && start <= MAX_WEEK
      ? start
      : DEFAULT_PLAYOFF_WEEK_START;

  const week = Number(currentWeek);
  const from = Number.isFinite(week) && week >= 1 ? Math.min(week, MAX_WEEK) : 1;
  const playoffEnd = Math.min(playoffStart + rounds - 1, MAX_WEEK);

  return {
    regular: range(Math.max(from, 1), playoffStart - 1),
    playoffs: range(Math.max(from, playoffStart), playoffEnd),
    playoffStart,
    playoffEnd,
  };
}

/**
 * Every team's bye week, from Sleeper's full-season schedule.
 *
 * Built on byeTeamsFor rather than by subtracting teams here, so there is one
 * description of "idle that week" and it is the tested one — including its
 * guard that a failed load byes nobody instead of everybody.
 *
 * Teams are Sleeper-spelled (LAR, WAS, JAX), matching both the schedule and the
 * projections. Anything crossing to our own backend needs nflverseTeam().
 */
export function byeWeekByTeam(schedule) {
  const weeks = [
    ...new Set(
      (Array.isArray(schedule) ? schedule : [])
        .map((row) => Number(row?.week))
        .filter((week) => Number.isFinite(week))
    ),
  ].sort((a, b) => a - b);

  const byes = {};
  for (const week of weeks) {
    for (const team of byeTeamsFor(schedule, week)) {
      // The first idle week, so a team cannot be given a second bye by a
      // schedule that is still missing a fixture.
      if (byes[team] == null) byes[team] = week;
    }
  }
  return byes;
}

/**
 * Whether this team's bye is behind them or still to come.
 *
 * "Already had their bye" is a thing you want to know when trading for a player
 * in November, because the one still to come costs you a week of the run-in.
 */
export function byeStatusFor(team, byeWeeks, currentWeek) {
  if (!team) return null;
  const week = Number(byeWeeks?.[team]);
  if (!Number.isFinite(week)) return null;
  return { week, done: week < Number(currentWeek) };
}

/** The side's players after the swap: deduped, stable order, string ids. */
export function applyTrade(playerIds, { out = [], in: incoming = [] } = {}) {
  const leaving = new Set((out || []).filter((id) => id != null).map(String));
  const kept = (playerIds || [])
    .filter((id) => id != null)
    .map(String)
    .filter((id) => id && id !== "0" && !leaving.has(id));

  const held = new Set(kept);
  for (const raw of incoming || []) {
    if (raw == null) continue;
    const id = String(raw);
    if (!id || id === "0" || held.has(id)) continue;
    kept.push(id);
    held.add(id);
  }
  return kept;
}

/**
 * The lineup this roster would start in one week, and what it is worth.
 *
 * Null only when the league has no startable slots at all.
 */
export function lineupForWeek({
  rosterPositions = [],
  playerIds = [],
  positionsOf = () => [],
  pointsFor = () => null,
  teamOf = () => null,
  byeWeeks = {},
  week,
} = {}) {
  const onBye = [];
  const unpriced = [];
  const points = {};
  const pool = [];
  let pricedCount = 0;

  for (const raw of playerIds || []) {
    const id = String(raw);
    if (!id || id === "0") continue;

    const team = teamOf(id);
    if (team && Number(byeWeeks[team]) === Number(week)) {
      onBye.push(id);
      continue;
    }

    const value = pointsFor(id, week);
    if (typeof value === "number" && Number.isFinite(value)) {
      points[id] = value;
      pricedCount += 1;
    } else {
      points[id] = 0;
      unpriced.push(id);
    }
    pool.push(id);
  }

  const picked = bestLineupSlots({
    rosterPositions,
    players: pool,
    playerPoints: points,
    positionsOf,
  });
  if (!picked) return null;

  const unknown = new Set(unpriced);
  return {
    week,
    total: picked.total,
    // Whether this week has any numbers at all. A week whose fetch failed
    // prices nobody, and a week of zeros would read as a catastrophe rather
    // than as missing data — so the caller drops it instead of averaging it in.
    priced: pricedCount > 0,
    assignments: picked.assignments.map((slot) => ({
      ...slot,
      known: !unknown.has(slot.playerId),
    })),
    unfilled: picked.unfilled,
    benched: picked.benched,
    onBye,
    unpriced,
  };
}

/**
 * One window: the lineup week by week, and what it comes to.
 *
 * `perWeek` divides by the weeks that actually carried data, not by the weeks
 * asked for, so a failed fetch narrows the claim instead of deflating it.
 */
export function windowPoints({ weeks = [], ...rest } = {}) {
  const byWeek = [];
  for (const week of weeks) {
    const lineup = lineupForWeek({ ...rest, week });
    if (lineup && lineup.priced) byWeek.push(lineup);
  }

  const total = round2(byWeek.reduce((sum, lineup) => sum + lineup.total, 0));
  return {
    weeks: [...weeks],
    pricedWeeks: byWeek.map((lineup) => lineup.week),
    byWeek,
    total: byWeek.length ? total : null,
    perWeek: byWeek.length ? round2(total / byWeek.length) : null,
    unpricedStarters: byWeek.reduce(
      (sum, lineup) => sum + lineup.assignments.filter((slot) => !slot.known).length,
      0
    ),
    emptySlots: byWeek.reduce((sum, lineup) => sum + lineup.unfilled.length, 0),
  };
}

/** Everyone who starts at least once across a window. */
export function startersIn(window) {
  const ids = new Set();
  for (const lineup of window?.byWeek || []) {
    for (const slot of lineup.assignments) ids.add(slot.playerId);
  }
  return ids;
}

/**
 * Whether a week can price this trade at all.
 *
 * It can only if every player changing hands has a number that week. A bye
 * counts as known — nothing is a real answer for a week with no game — but a
 * player the source has no figure for does not.
 *
 * This exists because of a case that is not an edge case at all. Sleeper does
 * not publish a projection for a player listed Out, and it does not resume
 * publishing one for the weeks he is expected back either: in week 10, Puka
 * Nacua had no projection for any week through 17. Priced at zero he dragged
 * the lineup down, so trading *for* him read as −12 points a week — on the
 * projection basis, buying an injured star cheap, which is the most common
 * contender trade there is, came out backwards.
 *
 * The honest answer is not to guess. A week that cannot price the trade is left
 * out of the averages and said out loud, exactly as a week whose fetch failed
 * is, and the points-per-game basis beside it answers the question properly.
 */
function priceableWeeks(weeks, needed, { pointsFor, teamOf, byeWeeks }) {
  const blocked = new Set();

  // First, whether the source knows this player at all inside the window. One
  // priced week anywhere is enough.
  //
  // This pass has to come first because of how the two rules interact. A bye
  // week counts as known below, and for a player with no figures at all his bye
  // is the one week a zero is right — so without this, the only surviving
  // sample would be the single most unrepresentative week in the window.
  // Measured on the real case: of eight weeks, seven were dropped for Nacua and
  // the one kept was the Rams' bye, which still read as −20 a week.
  for (const id of needed) {
    const everPriced = weeks.some((week) => {
      const value = pointsFor(id, week);
      return typeof value === "number" && Number.isFinite(value);
    });
    if (!everPriced) blocked.add(id);
  }
  if (blocked.size > 0) return { priceable: [], blocked: [...blocked] };

  // Then week by week, where a bye is a real answer and a gap is not.
  const priceable = weeks.filter((week) =>
    needed.every((id) => {
      const team = teamOf(id);
      if (team && Number(byeWeeks[team]) === Number(week)) return true;
      const value = pointsFor(id, week);
      if (typeof value === "number" && Number.isFinite(value)) return true;
      blocked.add(id);
      return false;
    })
  );
  return { priceable, blocked: [...blocked] };
}

/**
 * One side's before and after over one window.
 *
 * `leaves` and `enters` are the starting lineup's own churn, which is not the
 * same as the players traded: a 4-for-2 can send away two players who were
 * never starting, and promote a bench player who was not in the trade at all.
 * That difference is the thing this whole tab exists to show.
 */
export function tradeImpact({ playerIds = [], give = [], get = [], weeks = [], ...rest } = {}) {
  const needed = [...give, ...get].filter((id) => id != null).map(String);
  const { priceable, blocked } = priceableWeeks(weeks, needed, {
    pointsFor: rest.pointsFor || (() => null),
    teamOf: rest.teamOf || (() => null),
    byeWeeks: rest.byeWeeks || {},
  });

  const before = windowPoints({ ...rest, weeks: priceable, playerIds });
  const after = windowPoints({
    ...rest,
    weeks: priceable,
    playerIds: applyTrade(playerIds, { out: give, in: get }),
  });

  const was = startersIn(before);
  const now = startersIn(after);
  const delta = (a, b) => (a == null || b == null ? null : round2(a - b));

  return {
    before,
    after,
    deltaTotal: delta(after.total, before.total),
    deltaPerWeek: delta(after.perWeek, before.perWeek),
    leaves: [...was].filter((id) => !now.has(id)),
    enters: [...now].filter((id) => !was.has(id)),
    // The weeks this basis could not price the trade in, and who it could not
    // price. Named rather than counted, because "no projection for Nacua" is
    // actionable and "3 weeks missing" is not.
    skippedWeeks: weeks.filter((week) => !priceable.includes(week)),
    unpriceable: blocked,
  };
}

/**
 * The lineup to measure a window's schedule against.
 *
 * Strength of schedule is a property of the window, not of a week — the cell is
 * already an average over ten or eleven games, so re-averaging it per week
 * would count the same opponents repeatedly. One lineup per window instead,
 * with each player priced at their mean across it.
 *
 * A bye week enters that mean as a genuine zero, because a player who misses
 * one of five remaining weeks really does give you less over the window than an
 * equal player who does not.
 */
export function representativeLineup({
  rosterPositions = [],
  playerIds = [],
  positionsOf = () => [],
  pointsFor = () => null,
  teamOf = () => null,
  byeWeeks = {},
  weeks = [],
} = {}) {
  const points = {};
  const pool = [];

  for (const raw of playerIds || []) {
    const id = String(raw);
    if (!id || id === "0") continue;
    const team = teamOf(id);

    let sum = 0;
    for (const week of weeks) {
      if (team && Number(byeWeeks[team]) === Number(week)) continue;
      const value = pointsFor(id, week);
      if (typeof value === "number" && Number.isFinite(value)) sum += value;
    }
    points[id] = weeks.length ? sum / weeks.length : 0;
    pool.push(id);
  }

  return bestLineupSlots({
    rosterPositions,
    players: pool,
    playerPoints: points,
    positionsOf,
  });
}

/**
 * A lineup's average strength of schedule, weighted by games.
 *
 * `cellFor(playerId)` gives that player's cell — `{value, games}` — or null.
 *
 * Weighted, not a mean of means. A cell's `value` is itself an average over its
 * own `games`, and for the rest of the season that count differs between teams
 * (eight remaining games for a team whose bye is still ahead, nine for one
 * past it). Weighting by `games` makes the figure the mean over opponent-games,
 * which is what "my schedule gets easier" is a claim about.
 *
 * A player with no cell is excluded and counted, never read as zero: our
 * schedule data covers QB/RB/WR/TE only, so a defence or kicker in the lineup
 * has none — and a zero win rate would be the easiest schedule ever recorded,
 * swinging the average by half its range.
 */
export function averageSos(playerIds, cellFor = () => null) {
  let weighted = 0;
  let games = 0;
  let counted = 0;
  const missing = [];

  for (const raw of playerIds || []) {
    const id = String(raw);
    const cell = cellFor(id);
    const value = Number(cell?.value);
    const played = Number(cell?.games);
    if (!Number.isFinite(value) || !Number.isFinite(played) || played <= 0) {
      missing.push(id);
      continue;
    }
    weighted += value * played;
    games += played;
    counted += 1;
  }

  return {
    value: games > 0 ? weighted / games : null,
    games,
    counted,
    total: counted + missing.length,
    missing,
  };
}

/**
 * Where a figure sits among the league's, easiest schedule first.
 *
 * An average has no rank of its own, which is why it cannot be handed to the
 * rank colour helpers directly. But every roster in the league is already
 * loaded, so a real rank is free: average all of them and look the figure up.
 * "3rd easiest run-in of twelve" is a better read than a shade anyway.
 *
 * `easierIsHigher` is the polarity. For opponent win rate the easiest schedule
 * is the lowest number; for points allowed to the position it is the highest.
 */
export function rankAmong(values, value, { easierIsHigher = false } = {}) {
  const known = (values || [])
    .filter((n) => n != null && Number.isFinite(Number(n)))
    .map(Number);
  // Number(null) is 0 and Number.isFinite(0) is true, so a missing figure
  // would otherwise be ranked as the easiest schedule in the league.
  if (value == null || !Number.isFinite(Number(value)) || known.length < 2) return null;

  const easier = (a, b) => (easierIsHigher ? a > b : a < b);
  // Ties share the better rank, so two identical schedules are not ordered by
  // whichever roster happened to load first.
  return known.filter((other) => easier(other, Number(value))).length + 1;
}

/**
 * Whose roster the "I get" side is drawing from.
 *
 * The plurality holder, plus whatever does not belong to them. Inferring beats
 * a dropdown because the players are the thing the user is actually choosing,
 * and a dropdown can disagree with them; but it has to report a split rather
 * than silently picking, because a three-way trade is a different question and
 * this tab cannot answer it.
 */
export function inferPartner(playerIds, rosterIdOf = () => null) {
  const counts = new Map();
  const foreign = [];

  for (const raw of playerIds || []) {
    const id = String(raw);
    const rosterId = rosterIdOf(id);
    if (rosterId == null) {
      foreign.push(id);
      continue;
    }
    const key = String(rosterId);
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  if (counts.size === 0) return null;

  const [[rosterId]] = [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))
  );

  return {
    rosterId,
    teamCount: counts.size,
    // Anyone on the side who is not the partner's, so the page can name them
    // rather than quietly folding them into someone else's roster.
    foreign: [
      ...foreign,
      ...(playerIds || [])
        .map(String)
        .filter((id) => {
          const owner = rosterIdOf(id);
          return owner != null && String(owner) !== rosterId;
        }),
    ],
  };
}

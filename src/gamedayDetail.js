// One row per roster slot, for the matchup detail panel.
//
// Everything here is already fetched by the Gameday page and then thrown away:
// legTotals walks the same starters computing each one's points and projection,
// folds them into three running totals and drops the per-player figures. This
// keeps them.
//
// Deliberately built from the REST /matchups/{week} payload rather than from the
// GraphQL matchup_legs the page uses for its totals. Two reasons, and the first
// is the important one:
//
//   starters[i] fills the i-th non-bench roster position. That is documented for
//   the REST payload (startSitModel.js says so, sleeperLineup.js relies on it)
//   and holds on real data — checked across every roster of a live league, 132
//   of 132 starters eligible for the slot their index claimed. Nothing says the
//   same of the GraphQL array, so pairing the two teams slot by slot would be
//   resting on an assumption.
//
//   starters_points[i] lines up with starters[i] index for index, which hands
//   over the actual points without a second lookup.
//
// Names come from the GraphQL player_map, which is the only one of the two that
// carries them.

import { projectedPoints, hasProjection } from "./leagueScoring";

/** An unfilled slot. Sleeper writes "0" rather than leaving a hole. */
const EMPTY = new Set(["0", 0, "", null, undefined]);

function nameFrom(entry, playerId) {
  const name = [entry?.first_name, entry?.last_name].filter(Boolean).join(" ").trim();
  // The id rather than nothing: a starter the player_map has not heard of is
  // still in the lineup and still scoring, and a blank row hides that.
  return name || String(playerId);
}

/**
 * The starters of one side, paired to their slots.
 *
 * `slots` is roster_positions with the bench-like entries already removed —
 * buildSlots() in startSitModel.js does that, and is what the rest of the app
 * uses, so the labels here agree with Start/Sit's.
 *
 * Actual points come from `starters_points` by index, falling back to
 * `players_points` by id. The two agree for a lineup Sleeper is scoring, but the
 * index is the authority: it is what the running total is built from.
 */
export function detailRows({
  restRow,
  playerMap = {},
  slots = [],
  projections = {},
  scoring = {},
} = {}) {
  const starters = Array.isArray(restRow?.starters) ? restRow.starters : [];
  const points = Array.isArray(restRow?.starters_points) ? restRow.starters_points : [];
  const byId = restRow?.players_points || {};

  return starters.map((playerId, index) => {
    const slot = slots[index] || null;
    if (EMPTY.has(playerId)) {
      return { slot, id: null, name: null, team: null, position: null,
               actual: null, projected: null, hasProjection: false };
    }

    const id = String(playerId);
    const entry = playerMap[id] || playerMap[playerId] || null;
    const projection = projections[id];

    const indexed = points[index];
    const actual = Number.isFinite(Number(indexed))
      ? Number(indexed)
      : Number.isFinite(Number(byId[id])) ? Number(byId[id]) : null;

    return {
      slot,
      id,
      name: nameFrom(entry, id),
      team: entry?.team || null,
      position: entry?.position || null,
      actual,
      // The whole-game projection, not the share of it still to come. A column
      // beside a final score wants what the player was expected to do; the
      // team total above already blends in the clock.
      projected: hasProjection(projection) ? projectedPoints(projection, scoring) : null,
      hasProjection: hasProjection(projection),
    };
  });
}

/**
 * Both sides of a matchup, ready to render.
 *
 * Returns null when there is no opponent — a bye has nothing to pair against,
 * and the panel says so rather than drawing half a table.
 */
export function detailPair({ mine, theirs, playerMap, slots, projections, scoring } = {}) {
  if (!mine) return null;
  const build = (restRow) =>
    detailRows({ restRow, playerMap, slots, projections, scoring });
  return {
    mine: build(mine),
    theirs: theirs ? build(theirs) : null,
    slots: (Array.isArray(mine.starters) ? mine.starters : []).map((_, i) => slots[i] || null),
  };
}

/** What the rows add up to, for checking a panel against the score above it. */
export function rowsTotal(rows, key = "actual") {
  return (rows || []).reduce((sum, row) => {
    const value = Number(row?.[key]);
    return Number.isFinite(value) ? sum + value : sum;
  }, 0);
}

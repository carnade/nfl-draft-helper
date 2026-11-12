// What a roster could have scored with hindsight.
//
// Sleeper calls this "max points" and keeps a season total in a roster's
// settings as `ppts`, but nothing in its API gives it per week — so it is
// computed here from the week's roster and everyone's points.
//
// Verified against Sleeper's own figure: run over weeks 1 to 4 of a twelve-team
// SuperFlex league, this reproduces every manager's `ppts` to the cent.
//
// Two things that check turned up and are worth keeping in mind:
//   - `players` in a matchup is a per-week snapshot, not today's roster, so a
//     past week is computed against who was actually held at the time.
//   - `ppts` and `fpts` lag a week behind the matchups endpoint. Comparing the
//     two over the same range of weeks is what makes them agree.
//
// Eligibility comes from startSitModel rather than a second table here. It is
// the app's one description of what fits a slot and it is already tested.

import { buildSlots, isEligible, eligiblePositions } from "./startSitModel";

/**
 * The best lineup itself: the total, and who is in which slot.
 *
 * `positionsOf(playerId)` returns that player's fantasy positions.
 *
 * Slots are filled most-restrictive first, taking the best player still
 * available for each. That is the order Sleeper itself resolves them in —
 * filling a flex before the position that can only go in one place would give
 * the flex a player the specific slot then has to do without.
 *
 * Exact for nested slot shapes, which is every league this app has seen:
 * RB ⊂ FLEX ⊂ SUPER_FLEX, so a player taken by a narrower slot could never
 * have been better used by a wider one. It is not a maximum-weight matching,
 * so a league pairing REC_FLEX (WR/TE) with WRRB_FLEX (RB/WR) — equal-sized
 * eligibility sets that tie in the sort — can be left a fraction short. Worth
 * knowing when two runs are differenced against each other, as the Contender
 * tab does: the bias mostly cancels, but it is a bias rather than noise.
 */
export function bestLineupSlots({
  rosterPositions = [],
  players = [],
  playerPoints = {},
  positionsOf = () => [],
} = {}) {
  const slots = buildSlots(rosterPositions);
  if (slots.length === 0) return null;

  const pool = players
    .filter((id) => id != null && String(id) !== "0")
    .map((id) => ({
      id: String(id),
      points: Number(playerPoints[String(id)]) || 0,
      fantasyPositions: positionsOf(String(id)) || [],
    }));

  const order = slots
    .map((slot, index) => ({ slot, index }))
    .sort((a, b) => eligiblePositions(a.slot).length - eligiblePositions(b.slot).length);

  const taken = new Set();
  const assignments = [];
  const unfilled = [];
  let total = 0;
  for (const { slot, index } of order) {
    let best = null;
    for (const player of pool) {
      if (taken.has(player.id)) continue;
      if (!isEligible(slot, player)) continue;
      if (!best || player.points > best.points) best = player;
    }
    // An empty slot is worth nothing rather than disqualifying the lineup: a
    // roster can genuinely be short a kicker. It is reported rather than
    // swallowed, because a trade that leaves a slot empty should say so.
    if (!best) {
      unfilled.push({ slot, slotIndex: index });
      continue;
    }
    taken.add(best.id);
    total += best.points;
    assignments.push({ slot, slotIndex: index, playerId: best.id, points: best.points });
  }

  return {
    // Scores are quoted to two decimals everywhere else; summing floats here
    // would otherwise show a hundredth that does not exist.
    total: Math.round(total * 100) / 100,
    // Back in roster order, because a lineup is read down the slots rather
    // than in the order they happened to be filled.
    assignments: assignments.sort((a, b) => a.slotIndex - b.slotIndex),
    unfilled: unfilled.sort((a, b) => a.slotIndex - b.slotIndex),
    benched: pool.filter((player) => !taken.has(player.id)).map((player) => player.id),
  };
}

/**
 * The highest total this roster could have started.
 *
 * The original and still the only thing most callers want. Expressed through
 * bestLineupSlots so there is one optimiser rather than two that can drift.
 */
export function bestLineupPoints(args) {
  const picked = bestLineupSlots(args);
  return picked ? picked.total : null;
}

/** How much was left on the bench. Null when the best lineup is unknown. */
export function pointsLeftOnBench(bestPoints, actualPoints) {
  if (bestPoints == null) return null;
  const left = bestPoints - (Number(actualPoints) || 0);
  // Never negative: a lineup cannot beat its own best, and a hundredth of
  // rounding should not read as one.
  return Math.max(0, Math.round(left * 100) / 100);
}

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
 * The highest total this roster could have started.
 *
 * `positionsOf(playerId)` returns that player's fantasy positions.
 *
 * Slots are filled most-restrictive first, taking the best player still
 * available for each. That is the order Sleeper itself resolves them in —
 * filling a flex before the position that can only go in one place would give
 * the flex a player the specific slot then has to do without.
 */
export function bestLineupPoints({
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
  let total = 0;
  for (const { slot } of order) {
    let best = null;
    for (const player of pool) {
      if (taken.has(player.id)) continue;
      if (!isEligible(slot, player)) continue;
      if (!best || player.points > best.points) best = player;
    }
    // An empty slot is worth nothing rather than disqualifying the lineup: a
    // roster can genuinely be short a kicker.
    if (!best) continue;
    taken.add(best.id);
    total += best.points;
  }

  // Scores are quoted to two decimals everywhere else; summing floats here
  // would otherwise show a hundredth that does not exist.
  return Math.round(total * 100) / 100;
}

/** How much was left on the bench. Null when the best lineup is unknown. */
export function pointsLeftOnBench(bestPoints, actualPoints) {
  if (bestPoints == null) return null;
  const left = bestPoints - (Number(actualPoints) || 0);
  // Never negative: a lineup cannot beat its own best, and a hundredth of
  // rounding should not read as one.
  return Math.max(0, Math.round(left * 100) / 100);
}

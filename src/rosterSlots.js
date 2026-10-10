// How much room is left on a roster.
//
// Pure, so the arithmetic can be checked without a league in front of it.
//
// Verified against all 41 of the signed-in user's rosters: `reserve` and `taxi`
// are always subsets of `players`, and Sleeper keeps IR and taxi slots out of
// `roster_positions` entirely — they live in league settings instead. So the
// list of roster positions is exactly the active capacity, and the players
// stashed on IR or the taxi squad have to come off the head count.

/**
 * Active roster spots with nobody in them, or null if the shape is unknown.
 *
 * Null rather than zero when there are no roster positions to count: a league
 * whose settings have not loaded has an unknown number of free slots, which is
 * not the same as a full roster.
 */
export function emptyBenchSlots({
  rosterPositions = [],
  players = [],
  reserve = [],
  taxi = [],
} = {}) {
  const capacity = (rosterPositions || []).length;
  if (!capacity) return null;

  const stashed = (reserve || []).length + (taxi || []).length;
  const active = (players || []).length - stashed;

  // Clamped: a roster carrying more than its league allows is Sleeper's
  // business, not something to report as a negative number of free slots.
  return Math.max(0, capacity - active);
}

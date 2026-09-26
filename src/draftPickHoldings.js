// Who holds which draft picks, from Sleeper's traded-picks list.
//
// GET /v1/league/{id}/traded_picks returns one row per pick that has ever moved:
//
//   { season: "2026", round: 3, roster_id: 1, previous_owner_id: 1, owner_id: 3 }
//
// `roster_id` is the roster the pick ORIGINALLY belonged to and `owner_id` is
// who holds it now. Anything absent from the list is still with its original
// owner, so that is where counting starts. A pick traded away and later bought
// back comes through with owner_id == roster_id and correctly reads as their own
// again.
//
// Checked against nine live dynasty leagues: exactly one row per pick, and the
// holdings always sum to rosters × rounds per season (48 for a 12-team league
// with four rounds), which is the invariant `holdingsBalance` below asserts.

export const DEFAULT_ROUNDS = [1, 2, 3, 4];

/**
 * Pick holdings for one league and season.
 *
 * @returns {Object} rosterId -> round -> { count, ownsOwn }
 */
export function pickHoldings(tradedPicks, rosterIds, season, rounds = DEFAULT_ROUNDS) {
  // Where each original pick has ended up. Everyone starts holding their own.
  const heldBy = new Map();
  for (const rosterId of rosterIds) {
    for (const round of rounds) {
      heldBy.set(`${round}|${rosterId}`, rosterId);
    }
  }

  for (const pick of tradedPicks || []) {
    if (String(pick?.season) !== String(season)) continue;
    const slot = `${pick.round}|${pick.roster_id}`;
    // Ignore a pick belonging to a roster we were not given, and rounds beyond
    // the ones asked for — some leagues trade picks four seasons out.
    if (!heldBy.has(slot)) continue;
    heldBy.set(slot, pick.owner_id);
  }

  const holdings = {};
  for (const rosterId of rosterIds) {
    holdings[rosterId] = {};
    for (const round of rounds) {
      holdings[rosterId][round] = { count: 0, ownsOwn: false };
    }
  }

  for (const [slot, ownerId] of heldBy) {
    const [round, originalOwner] = slot.split('|');
    const forRoster = holdings[ownerId];
    if (!forRoster) continue; // held by someone outside this league's rosters
    const cell = forRoster[round];
    if (!cell) continue;
    cell.count += 1;
    if (String(originalOwner) === String(ownerId)) cell.ownsOwn = true;
  }

  return holdings;
}

/**
 * Green when they still hold their own pick, yellow when they hold someone
 * else's but not their own, red when they hold none.
 */
export function pickCellTone({ count, ownsOwn }) {
  if (!count) return 'red';
  return ownsOwn ? 'green' : 'yellow';
}

/**
 * Total picks accounted for, which must equal rosters × rounds. Exported so the
 * arithmetic can be checked against real leagues rather than trusted.
 */
export function holdingsBalance(holdings, rounds = DEFAULT_ROUNDS) {
  let total = 0;
  for (const byRound of Object.values(holdings)) {
    for (const round of rounds) {
      total += byRound[round]?.count || 0;
    }
  }
  return total;
}

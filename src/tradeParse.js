// A Sleeper trade, turned into two sides.
//
// The payload describes a trade from the league's point of view rather than
// any one manager's: `adds` and `drops` are maps of player to roster, and the
// picks are a list of comma-separated strings. Reading "what am I being
// offered and what is being asked for" off that is fiddly enough, and wrong in
// enough quiet ways, to be worth doing in one tested place.
//
// Three things the shape gets wrong if read casually:
//
//   - `adds[playerId]` is who RECEIVES the player. `drops[playerId]` is who
//     gives him up. Assigning receipt from `drops` reverses every trade.
//   - `consenter_ids` includes the proposer, who consented by proposing. So a
//     trade is outgoing when my roster is in that list, not when I created it.
//     `creator` is a user_id and cannot be compared against a roster_id at all.
//   - A pick string's first field is the roster the pick ORIGINALLY belonged
//     to, which need not be either party. See parseDraftPickCsv.

/**
 * One pick, from "7,2027,1,4,7".
 *
 * The field order is originalOwner, season, round, newOwner, previousOwner.
 * That ordering was decoded rather than documented, so the evidence is worth
 * recording: a real trade between rosters 2 and 7 contained "1,2026,12,7,2",
 * and roster 1 was not a party to it. The first field therefore identifies
 * whose pick it is rather than who is trading it — which also matches the
 * shape Sleeper's own GraphQL returns, where RosterDraftPick is
 * {round, season, league_id, roster_id, owner_id, previous_owner_id}.
 *
 * `raw` is kept so a row can show what it was built from if the decode is ever
 * called into question.
 */
export function parseDraftPickCsv(csv) {
  if (typeof csv !== "string") return null;
  const parts = csv.split(",").map((p) => p.trim());
  if (parts.length !== 5) return null;

  const nums = parts.map(Number);
  if (nums.some((n) => !Number.isFinite(n))) return null;
  const [originalOwner, season, round, newOwner, previousOwner] = nums;
  if (!season || !round) return null;

  return { originalOwner, season, round, newOwner, previousOwner, raw: csv };
}

/**
 * FAAB moving as part of a trade.
 *
 * Every sample we have carries `waiver_budget: null`, so the populated shape
 * is taken from Sleeper's REST transactions and is unverified here. It is read
 * defensively and anything unrecognised sets `unreadable`, because quietly
 * dropping a budget transfer would understate a side of the trade.
 */
export function parseFaab(waiverBudget) {
  if (waiverBudget == null) return { faab: [], unreadable: false };
  if (!Array.isArray(waiverBudget)) return { faab: [], unreadable: true };

  const faab = [];
  let unreadable = false;
  for (const entry of waiverBudget) {
    const sender = Number(entry?.sender);
    const receiver = Number(entry?.receiver);
    const amount = Number(entry?.amount);
    if (!Number.isFinite(sender) || !Number.isFinite(receiver) || !Number.isFinite(amount)) {
      unreadable = true;
      continue;
    }
    faab.push({ sender, receiver, amount });
  }
  return { faab, unreadable };
}

/**
 * Incoming or outgoing, from my roster's point of view.
 *
 * Null when my roster is unknown — better a trade with no badge than every
 * trade in a league badged the same wrong way.
 */
export function tradeDirection({ consenterIds = [], myRosterId } = {}) {
  if (myRosterId == null) return null;
  return consenterIds.includes(myRosterId) ? "outgoing" : "incoming";
}

/** When the offer lapses, in milliseconds, or null. */
export function tradeExpiry(transaction) {
  const seconds = transaction?.settings?.expires_at;
  return Number.isFinite(seconds) ? seconds * 1000 : null;
}

/**
 * One trade, as the page needs it.
 *
 * `sides` has an entry per roster involved — usually two, but Sleeper allows
 * more and a three-way would otherwise render as a two-way with assets
 * missing.
 */
export function parseTrade(transaction, { myRosterId } = {}) {
  const rosterIds = (transaction?.roster_ids || []).filter((id) => id != null);
  const consenterIds = (transaction?.consenter_ids || []).filter((id) => id != null);
  const adds = transaction?.adds || {};

  const picks = [];
  const unparsedPicks = [];
  for (const csv of transaction?.draft_picks || []) {
    const parsed = parseDraftPickCsv(csv);
    if (parsed) picks.push(parsed);
    else unparsedPicks.push(csv);
  }

  const { faab, unreadable: faabUnreadable } = parseFaab(transaction?.waiver_budget);

  // A side per roster, so a three-way trade keeps all of its assets.
  const sides = rosterIds.map((rosterId) => ({
    rosterId,
    // adds, never drops: drops says who is giving the player up.
    players: Object.keys(adds).filter((pid) => adds[pid] === rosterId),
    picks: picks.filter((p) => p.newOwner === rosterId),
    faab: faab.filter((f) => f.receiver === rosterId),
  }));

  return {
    id: transaction?.transaction_id || null,
    leagueId: transaction?.league_id || null,
    status: transaction?.status || null,
    created: transaction?.created ?? null,
    statusUpdated: transaction?.status_updated ?? null,
    expiresAt: tradeExpiry(transaction),
    isCounter: transaction?.settings?.is_counter === 1,
    creator: transaction?.creator || null,
    rosterIds,
    consenterIds,
    multiTeam: rosterIds.length > 2,
    direction: tradeDirection({ consenterIds, myRosterId }),
    sides,
    playerMap: transaction?.player_map || {},
    unreadable: { draftPicks: unparsedPicks, faab: faabUnreadable },
  };
}

/** My side and theirs, or null when my roster is not in the trade. */
export function mySides(trade, myRosterId) {
  if (myRosterId == null) return null;
  const mine = trade.sides.find((s) => s.rosterId === myRosterId);
  if (!mine) return null;
  return { receive: mine, give: trade.sides.filter((s) => s.rosterId !== myRosterId) };
}

/**
 * Soonest to lapse first, then newest.
 *
 * An offer about to expire is the one worth looking at, and one with no expiry
 * sorts behind every one that has.
 */
export function tradeSortKey(trade) {
  return [trade?.expiresAt ?? Number.MAX_SAFE_INTEGER, -(trade?.created ?? 0)];
}

export function compareTrades(a, b) {
  const [ae, ac] = tradeSortKey(a);
  const [be, bc] = tradeSortKey(b);
  return ae - be || ac - bc;
}

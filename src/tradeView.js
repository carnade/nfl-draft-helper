// One trade, assembled into the thing the page draws.
//
// This is where the three halves meet: tradeParse says who is getting what,
// draftOrder turns each pick into a slot and a band, and tradeValues prices
// the result. Keeping the join here rather than in the component means the
// whole pipeline can be checked without rendering anything.

import { parseTrade, mySides, compareTrades } from "./tradeParse";
import { describePick } from "./draftOrder";
import { playerAsset, pickAsset, faabAsset, sideTotals, difference } from "./tradeValues";

function assetsFor(side, context) {
  const { playerMap, values, projections, stats, order, currentSeason } = context;
  return [
    ...side.players.map((id) => playerAsset(id, { values, playerMap, projections, stats })),
    ...side.picks.map((pick) =>
      pickAsset(pick, describePick(pick, { order, currentSeason }), { values })
    ),
    ...side.faab.map(faabAsset),
  ];
}

/**
 * The five measures the two sides are compared on.
 *
 * Age is the one where the smaller number wins, which is why `difference`
 * names a side rather than returning a sign.
 */
export function comparisons(receive, give) {
  return [
    { key: "ktc", label: "KeepTradeCut", ...difference(receive.ktc, give.ktc) },
    { key: "fc", label: "FantasyCalc", ...difference(receive.fc, give.fc) },
    { key: "projPg", label: "Proj pts/g", ...difference(receive.projPg, give.projPg) },
    { key: "actualPg", label: "Pts/g", ...difference(receive.actualPg, give.actualPg) },
    {
      key: "avgAge",
      label: "Avg age",
      ...difference(receive.avgAge, give.avgAge, { lowerIsBetter: true }),
    },
  ];
}

/**
 * One trade, from my side of it.
 *
 * Null when my roster is not a party — the league-wide query returns trades
 * between other managers too, and those are not what this page is for.
 *
 * A trade with more than two rosters folds every other side into one "they
 * get" column. It loses who specifically is giving what, which a three-way
 * deserves, but it keeps the totals honest and those trades are rare enough
 * that a badge pointing them out is better than a layout built for them.
 */
export function buildTradeView(transaction, context = {}) {
  const { myRosterId, nameFor = () => null } = context;
  const trade = parseTrade(transaction, { myRosterId });
  const split = mySides(trade, myRosterId);
  if (!split) return null;

  const withMap = { ...context, playerMap: trade.playerMap };
  const receiveAssets = assetsFor(split.receive, withMap);
  const giveAssets = split.give.flatMap((side) => assetsFor(side, withMap));

  const receive = sideTotals(receiveAssets);
  const give = sideTotals(giveAssets);

  return {
    id: trade.id,
    direction: trade.direction,
    isCounter: trade.isCounter,
    multiTeam: trade.multiTeam,
    expiresAt: trade.expiresAt,
    created: trade.created,
    unreadable: trade.unreadable,
    counterparties: split.give.map((side) => ({
      rosterId: side.rosterId,
      name: nameFor(side.rosterId) || `Roster ${side.rosterId}`,
    })),
    receive: { assets: receiveAssets, totals: receive },
    give: { assets: giveAssets, totals: give },
    comparisons: comparisons(receive, give),
  };
}

/**
 * Whether an offer can still be acted on.
 *
 * Sleeper leaves a lapsed offer sitting at status "proposed" rather than
 * moving it on, so the status alone would keep dead trades on the page for as
 * long as nobody tidied them up. A trade with no expiry at all never lapses.
 */
export function isLive(trade, now = Date.now()) {
  return !trade?.expiresAt || trade.expiresAt > now;
}

/** Every trade of mine in one league still worth answering, soonest to lapse first. */
export function buildLeagueView(league, transactions = [], context = {}) {
  const now = context.now ?? Date.now();
  const trades = (transactions || [])
    .map((t) => buildTradeView(t, context))
    .filter((t) => t && isLive(t, now))
    .sort(compareTrades);

  return {
    leagueId: league?.league_id || null,
    name: league?.name || "Unnamed league",
    confidence: context.order?.confidence || "none",
    trades,
    incoming: trades.filter((t) => t.direction === "incoming").length,
    outgoing: trades.filter((t) => t.direction === "outgoing").length,
  };
}

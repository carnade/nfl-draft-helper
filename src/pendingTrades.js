// Every trade still awaiting a decision, across every league.
//
// The filtering is done here rather than by Sleeper. The endpoint takes a
// status_filters argument and it is tempting to pass ["proposed"], but the one
// call site in this app that already uses this query sends an empty list and
// narrows afterwards, and a filter that quietly matches nothing is
// indistinguishable from a manager with no pending trades. So the request asks
// for a league's recent trades and this module keeps the proposed ones.
//
// It does not filter by roster either: which roster is mine is not known until
// the rosters are fetched, and that fetch is worth making only for the leagues
// that turned out to have a trade in them. Proposed trades are rare — a handful
// out of forty leagues — so asking broadly and narrowing afterwards costs less
// than the other order.

import { sleeperGraphqlPartial, aliasedDocument } from "./sleeperGraphql";

// Eight leagues to a document. One document for all forty would be a single
// point of failure and one slow league would hold up every other; eight keeps
// the round trips to a handful while letting results paint as they arrive.
export const CHUNK_SIZE = 8;

// The only status that means "still waiting on somebody".
const PROPOSED = "proposed";

// Everything needed to render a trade without a second request. player_map is
// in here deliberately: it is the only source of name and position for a
// player the backend's own list has filtered out.
const TRADE_FIELDS = [
  "transaction_id",
  "type",
  "status",
  "adds",
  "drops",
  "draft_picks",
  "consenter_ids",
  "creator",
  "created",
  "status_updated",
  "leg",
  "league_id",
  "roster_ids",
  "settings",
  "waiver_budget",
  "player_map",
].join(" ");

const aliasFor = (index) => `l${index}`;

/** One document asking each league for its proposed trades. */
export function tradesDocument(leagueIds = []) {
  return aliasedDocument(
    "league_transactions_filtered",
    leagueIds.map((leagueId, index) => ({
      alias: aliasFor(index),
      field: "league_transactions_filtered",
      args: {
        league_id: String(leagueId),
        type_filters: ["trade"],
        status_filters: [],
        leg_filters: [],
        roster_id_filters: [],
        // Newest first, so a pending offer is never pushed out of the window
        // by a league's back catalogue of completed trades.
        limit: 100,
      },
      selection: TRADE_FIELDS,
    }))
  );
}

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/**
 * Proposed trades for every league given.
 *
 * Returns a map of league id to its trades, plus the league ids that could not
 * be asked. Chunks go out one at a time rather than all at once: a manager
 * with sixty leagues should not open sixty connections because they opened a
 * page. `onChunk` is called after each so a caller can paint as it goes.
 *
 * An expired token is thrown rather than collected — forty leagues reporting
 * no trades is indistinguishable from forty leagues the sign-in could not
 * reach, and the second of those needs saying out loud.
 */
export async function fetchPendingTrades(
  leagueIds = [],
  token,
  { signal, chunkSize = CHUNK_SIZE, onChunk } = {}
) {
  const byLeague = {};
  const failed = [];

  for (const group of chunk(leagueIds, chunkSize)) {
    let result;
    try {
      // eslint-disable-next-line no-await-in-loop
      result = await sleeperGraphqlPartial({
        op: "league_transactions_filtered",
        query: tradesDocument(group),
        token,
        signal,
      });
    } catch (err) {
      if (err.name === "AbortError" || err.name === "SleeperAuthError") throw err;
      // The whole chunk is lost; the next one may still work.
      failed.push(...group);
      if (onChunk) onChunk({ byLeague, failed });
      continue;
    }

    const refused = new Set(result.failed);
    group.forEach((leagueId, index) => {
      const alias = aliasFor(index);
      if (refused.has(alias)) {
        failed.push(leagueId);
        return;
      }
      const rows = result.data?.[alias];
      // A league with no proposed trades answers with an empty list, which is
      // an answer. Null without an error is not, so it is treated as a miss.
      if (!Array.isArray(rows)) {
        failed.push(leagueId);
        return;
      }
      byLeague[leagueId] = rows.filter((t) => t?.status === PROPOSED);
    });

    if (onChunk) onChunk({ byLeague, failed });
  }

  return { byLeague, failed };
}

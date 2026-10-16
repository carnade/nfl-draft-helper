// Every trade still awaiting a decision, across every league.
//
// Sleeper will filter by status server-side, so this asks only for the
// proposed ones rather than pulling a season of history and discarding it.
// It does not filter by roster: which roster is mine is not known until the
// rosters are fetched, and that fetch is worth making only for the leagues
// that turned out to have a trade in them. Proposed trades are rare — a
// handful out of forty leagues — so asking the question broadly and narrowing
// afterwards costs less than the other order.

import { sleeperGraphqlPartial, aliasedDocument } from "./sleeperGraphql";

// Eight leagues to a document. One document for all forty would be a single
// point of failure and one slow league would hold up every other; eight keeps
// the round trips to a handful while letting results paint as they arrive.
export const CHUNK_SIZE = 8;

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
        status_filters: ["proposed"],
        leg_filters: [],
        roster_id_filters: [],
        limit: 50,
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
      byLeague[leagueId] = rows.filter((t) => t?.status === "proposed");
    });

    if (onChunk) onChunk({ byLeague, failed });
  }

  return { byLeague, failed };
}

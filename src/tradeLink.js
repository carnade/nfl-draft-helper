// A trade in a URL.
//
// The thing that is shared is the trade, not the view of it. That distinction
// is the whole design: whoever opens the link is a different Sleeper user from
// whoever sent it, so a link that said "my team gives these three" would show
// the recipient a trade their own roster has nothing to do with.
//
// So the link names a roster rather than a person:
//
//   ?league=1395106065225355264&from=3&give=6790,9480&get=9493
//
// — roster 3 in that league gives Swift and Strange and gets Nacua. Who the
// other side is comes from whoever holds the players being got, which is the
// same inference the tab already makes while the trade is being built; naming
// them too would be a second source of truth that could disagree with the first.
//
// What the viewer's own identity decides is only which way round it is drawn:
// hold the roster that is giving and it reads as yours, hold the other one and
// the two sides swap so it reads as yours instead, hold neither — or be signed
// in as nobody at all — and it is drawn by team name. A link therefore works for
// a league-mate who has never set a username in this app, which is most of the
// point of sending one.
//
// Nothing is frozen into it. The figures are worked out again when it is opened,
// against that week's projections and that day's rosters, so a link sent on the
// Tuesday says something different by the Sunday. That is the right behaviour
// for a question like "does this trade help me", and it is why the rosters have
// to be checked against the link rather than trusted — see staleTradePlayers.

// Sleeper's own ids are digits, or a team code for a defence. Underscore and
// hyphen are allowed beyond that because they are URL-safe and harmless, and a
// pattern tight enough to drop them silently is a trap for whatever id format
// turns up next. What stays out is everything that could mean something to a
// path or to markup: no slash, dot, percent or angle bracket.
const ID = /^[A-Za-z0-9_-]{1,24}$/;

const ids = (raw) =>
  String(raw || "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => ID.test(id));

/**
 * The query string for a trade, without the leading "?".
 *
 * Null when there is nothing to describe — no league, no roster, or neither
 * side holding anybody.
 */
export function encodeTrade({ leagueId, rosterId, give = [], get = [] } = {}) {
  const league = String(leagueId || "");
  const roster = String(rosterId ?? "");
  const out = ids(give.join(","));
  const incoming = ids(get.join(","));
  if (!ID.test(league) || !ID.test(roster)) return null;
  if (out.length === 0 && incoming.length === 0) return null;

  const params = new URLSearchParams();
  params.set("tab", "contender");
  params.set("league", league);
  params.set("from", roster);
  if (out.length) params.set("give", out.join(","));
  if (incoming.length) params.set("get", incoming.join(","));
  return params.toString();
}

/** The whole link, ready to paste. */
export function tradeLinkFor(origin, path, trade) {
  const query = encodeTrade(trade);
  return query ? `${origin}${path}?${query}` : null;
}

/**
 * The trade a query string describes, or null if it does not describe one.
 *
 * Deliberately strict about what an id may look like: these go straight into
 * Sleeper URLs and into lookups against roster contents, and a link is the one
 * input here that arrives from outside.
 */
export function decodeTrade(search) {
  let params;
  try {
    params = new URLSearchParams(search || "");
  } catch {
    return null;
  }

  const leagueId = String(params.get("league") || "");
  const rosterId = String(params.get("from") || "");
  if (!ID.test(leagueId) || !ID.test(rosterId)) return null;

  const give = ids(params.get("give"));
  const get = ids(params.get("get"));
  if (give.length === 0 && get.length === 0) return null;

  return { leagueId, rosterId, give, get };
}

/**
 * Players the link names who are not where it says they are.
 *
 * A link outlives the rosters it describes: waivers run, other trades go
 * through, and a week later the player it was built around is somewhere else.
 * Priced as though nothing had moved, the figures would be quietly wrong — the
 * roster would be short a player it is being charged for, or credited with one
 * it never received.
 *
 * `holder(playerId)` gives the roster that holds them now, or null.
 */
export function staleTradePlayers({ give = [], get = [], rosterId, partnerId, holder }) {
  const moved = [];
  const check = (playerIds, expected, side) => {
    for (const raw of playerIds) {
      const id = String(raw);
      const now = holder(id);
      if (expected == null || now == null || String(now) !== String(expected)) {
        moved.push({ id, side, now: now == null ? null : String(now) });
      }
    }
  };
  check(give, rosterId, "give");
  check(get, partnerId, "get");
  return moved;
}

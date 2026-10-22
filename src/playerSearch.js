// Finding the player you meant, in the leagues that actually hold them.
//
// The league table lights up a player and the leagues containing them. Those
// two have to agree, and in the search box they did not: it matched every
// player whose name contained the query, added each of their leagues to one
// set, and then highlighted whichever match the loops happened to reach last.
// So "etienne" lit four leagues and named Travis Etienne, who was in one of
// them — the other three held Trevor Etienne.
//
// Matching on a bare substring is the other half of it. "dell" is inside
// "Odell", "chase" is Ja'Marr's surname and Chase Brown's first name, and
// "cooper" is both Cooper Rush and Darius Cooper. A query should match a name
// the way a person reads one: at the start of a word.
//
// Everything here is pure and resolves to exactly one player, deterministically
// — the old behaviour depended on object key order, which is why the same
// search could light different things on different days.

/**
 * A name reduced to something comparable.
 *
 * Apostrophes and full stops go, so "Ja'Marr" is reachable as "jamarr" and
 * "Odell Beckham Jr." as "odell beckham jr".
 */
export function normalise(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[’'.,]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** The stable identity the table compares against. Names, because that is what the roster cells have. */
export const playerKey = (firstName, lastName) => `${firstName}-${lastName}`;

// How well a query describes a name, lower being better. Ranked rather than
// boolean so a real match always beats a coincidence, whatever order the
// leagues happen to come in.
//
// Surnames outrank first names because one word is nearly always a surname:
// "davis" means Malik Davis, not Davis Mills, and "chase" means Ja'Marr Chase
// rather than Chase Brown. Ranking on the whole name instead put the first-name
// match first, which reads as the wrong player even though the leagues beside
// it are now correct.
const EXACT_NAME = 0;
const EXACT_SURNAME = 1;
const SURNAME_PREFIX = 2;
const NAME_PREFIX = 3;
const WORD_PREFIX = 4;
const SUBSTRING = 5;

function rank(query, firstName, lastName) {
  const name = normalise(`${firstName} ${lastName}`);
  const surname = normalise(lastName);
  const q = normalise(query);
  if (!q || !name) return null;

  if (name === q) return EXACT_NAME;
  if (surname && surname === q) return EXACT_SURNAME;
  if (surname && surname.startsWith(q)) return SURNAME_PREFIX;
  if (name.startsWith(q)) return NAME_PREFIX;

  const words = name.split(" ");
  const terms = q.split(" ");
  // Every term has to begin some word of the name: "josh al" finds Josh Allen,
  // "dell" does not find Odell.
  if (terms.every((t) => words.some((w) => w.startsWith(t)))) return WORD_PREFIX;

  // Kept as a last resort so a mid-word query still finds something rather
  // than appearing broken, but it can never outrank a real match.
  if (terms.every((t) => name.includes(t))) return SUBSTRING;
  return null;
}

/**
 * Every distinct player matching the query, best match first.
 *
 * `playersByLeague` is the page's own shape: `{ [leagueId]: { players: { [id]: player } } }`.
 * A player on several rosters is one entry carrying all of their leagues.
 */
export function matchPlayers(query, playersByLeague = {}) {
  const byKey = new Map();

  for (const [leagueId, entry] of Object.entries(playersByLeague || {})) {
    const players = entry?.players || {};
    for (const id of Object.keys(players)) {
      const player = players[id];
      const firstName = player?.first_name || "";
      const lastName = player?.last_name || "";
      if (!firstName && !lastName) continue;

      const score = rank(query, firstName, lastName);
      if (score === null) continue;

      const key = playerKey(firstName, lastName);
      const found = byKey.get(key);
      if (found) found.leagueIds.add(leagueId);
      else byKey.set(key, { key, firstName, lastName, score, leagueIds: new Set([leagueId]) });
    }
  }

  return [...byKey.values()]
    .map((m) => ({ ...m, leagueIds: [...m.leagueIds] }))
    // Best match first; then the player on most of your rosters, which on this
    // page is the one you are most likely asking about; then alphabetically so
    // the result never depends on iteration order.
    .sort(
      (a, b) =>
        a.score - b.score ||
        b.leagueIds.length - a.leagueIds.length ||
        `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`)
    );
}

/**
 * The one player a search should light up, and only their leagues.
 *
 * Null when nothing matches. `otherMatches` is how many other distinct players
 * the query also described, so the page can say the search was ambiguous
 * rather than silently picking.
 */
export function resolvePlayerSearch(query, playersByLeague = {}) {
  const matches = matchPlayers(query, playersByLeague);
  if (matches.length === 0) return null;
  const [best] = matches;
  return {
    key: best.key,
    firstName: best.firstName,
    lastName: best.lastName,
    leagueIds: best.leagueIds,
    otherMatches: matches.length - 1,
  };
}

/** Which leagues hold this exact player. The click path's question. */
export function leaguesWithPlayer(firstName, lastName, playersByLeague = {}) {
  const ids = [];
  for (const [leagueId, entry] of Object.entries(playersByLeague || {})) {
    const players = entry?.players || {};
    const has = Object.keys(players).some((id) => {
      const p = players[id];
      return p?.first_name === firstName && p?.last_name === lastName;
    });
    if (has) ids.push(leagueId);
  }
  return ids;
}

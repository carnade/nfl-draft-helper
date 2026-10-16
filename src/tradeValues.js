// What each asset in a trade is worth, and what a side adds up to.
//
// Values come from the backend's /getplayers/data, which when asked with
// include_picks returns players and draft picks in one map. The two arrive in
// different shapes, which is the main thing this module exists to hide:
// a player carries "KTC Value" and "FC Value", already resolved to superflex
// server-side, while a pick carries the raw scrape columns "SFValue" and
// "FantasyCalc SF Value".
//
// Unknown is not zero. A player the backend has never heard of and a player
// worth nothing are different facts, and a total that silently absorbs the
// first as the second understates a side of the trade. Anything missing is
// null here and counted, so the page can say how many assets a total leaves
// out instead of quietly being wrong.

/**
 * Points per game, to one decimal.
 *
 * Null rather than "0.0" when no games have been played: the alternative is
 * dividing a season total by a games count defaulted to one and printing the
 * season as if it were a week.
 */
export function pointsPerGame(row) {
  const points = Number(row?.pts_ppr);
  const games = Number(row?.gp);
  if (!Number.isFinite(points) || !Number.isFinite(games) || games <= 0) return null;
  return Math.round((points / games) * 10) / 10;
}

/**
 * A pick's two values.
 *
 * KeepTradeCut's superflex column is filled by matching the 1QB scrape on the
 * pick's printed name, and a failed match leaves it at zero rather than null.
 * Every published row is currently fine, but zero would read as "worthless"
 * rather than "unknown", so for picks it falls back to the 1QB value.
 */
export function pickValueOf(row) {
  if (!row) return { ktc: null, fc: null };
  const sf = Number(row["SFValue"]) || 0;
  const oneQb = Number(row["Value"]) || 0;
  const fc = Number(row["FantasyCalc SF Value"]) || 0;
  return { ktc: sf || oneQb || null, fc: fc || null };
}

/** A player's two values, as the backend has already resolved them. */
export function playerValueOf(row) {
  if (!row) return { ktc: null, fc: null };
  const ktc = Number(row["KTC Value"]);
  const fc = Number(row["FC Value"]);
  return {
    ktc: Number.isFinite(ktc) ? ktc : null,
    fc: Number.isFinite(fc) ? fc : null,
  };
}

/**
 * One player, as a row of the trade table.
 *
 * Name, position and team come from the backend first and the transaction's
 * own player_map second. The map is always present and always current, but it
 * has no age and no values, so it is the fallback rather than the source —
 * and it is what covers a player the backend filtered out for not being a
 * fantasy position.
 */
export function playerAsset(playerId, { values = {}, playerMap = {}, projections = {}, stats = {} } = {}) {
  const id = String(playerId);
  const row = values[id] || null;
  const fallback = playerMap[id] || {};
  const { ktc, fc } = playerValueOf(row);

  const name =
    [row?.first_name || fallback.first_name, row?.last_name || fallback.last_name]
      .filter(Boolean)
      .join(" ")
      .trim() || id;

  return {
    kind: "player",
    key: `player-${id}`,
    id,
    name,
    position: row?.position || fallback.position || null,
    team: row?.team || fallback.team || null,
    age: Number.isFinite(Number(row?.age)) ? Number(row.age) : null,
    injuryStatus: row?.injury_status || fallback.injury_status || null,
    ktc,
    fc,
    projPg: pointsPerGame(projections[id]),
    actualPg: pointsPerGame(stats[id]),
    unknown: !row,
  };
}

/** How a pick reads when its band is known: "2027 Early 1st". */
export function pickName({ season, band, round }) {
  const suffix = { 1: "st", 2: "nd", 3: "rd" }[round] || "th";
  const roundName = `${round}${round > 3 ? "th" : suffix}`;
  return band ? `${season} ${band} ${roundName}` : `${season} ${roundName}`;
}

/**
 * One draft pick, as a row of the trade table.
 *
 * `described` is the output of draftOrder's describePick, which has already
 * decided whether a band and slot could be worked out and why not if they
 * could not.
 */
export function pickAsset(pick, described, { values = {} } = {}) {
  const row = described?.valueId ? values[described.valueId] : null;
  const { ktc, fc } = pickValueOf(row);

  return {
    kind: "pick",
    key: `pick-${pick.raw}`,
    id: described?.valueId || pick.raw,
    name: pickName({
      season: pick.season,
      band: described?.band,
      round: pick.round,
    }),
    position: "PICK",
    team: null,
    age: null,
    ktc,
    fc,
    projPg: null,
    actualPg: null,
    band: described?.band || null,
    slot: described?.slot || null,
    label: described?.label || null,
    originalOwner: pick.originalOwner,
    reason: described?.reason || null,
    raw: pick.raw,
    unknown: !row,
  };
}

/** FAAB, as a row. It has a value in dollars and nothing else. */
export function faabAsset(entry) {
  return {
    kind: "faab",
    key: `faab-${entry.sender}-${entry.receiver}-${entry.amount}`,
    id: null,
    name: `$${entry.amount} FAAB`,
    position: null,
    team: null,
    age: null,
    ktc: null,
    fc: null,
    projPg: null,
    actualPg: null,
    unknown: false,
  };
}

const sum = (list) => list.reduce((n, v) => n + v, 0);

/**
 * What a side of the trade adds up to.
 *
 * Picks count toward the two value totals and are left out of the points and
 * age figures, which is the split the Trade Helper already makes — a pick has
 * no age and scores nothing this year, and averaging it in as zero would drag
 * both numbers toward meaninglessness.
 *
 * `unknown` is how many assets no value was found for, so the page can say the
 * total is incomplete rather than presenting it as the whole picture.
 */
export function sideTotals(assets = []) {
  const ktc = assets.map((a) => a.ktc).filter((v) => v != null);
  const fc = assets.map((a) => a.fc).filter((v) => v != null);
  const players = assets.filter((a) => a.kind === "player");
  const ages = players.map((a) => a.age).filter((v) => v != null);
  const proj = players.map((a) => a.projPg).filter((v) => v != null);
  const actual = players.map((a) => a.actualPg).filter((v) => v != null);

  const round1 = (n) => Math.round(n * 10) / 10;
  return {
    ktc: ktc.length ? sum(ktc) : null,
    fc: fc.length ? sum(fc) : null,
    projPg: proj.length ? round1(sum(proj)) : null,
    actualPg: actual.length ? round1(sum(actual)) : null,
    avgAge: ages.length ? round1(sum(ages) / ages.length) : null,
    count: assets.length,
    unknown: assets.filter((a) => a.unknown).length,
  };
}

/**
 * The gap between two sides of one measure.
 *
 * `favours` is "receive", "give" or "even" rather than a sign, because which
 * direction counts as good differs per row: more points is better, more years
 * on the clock is not.
 */
export function difference(mine, theirs, { lowerIsBetter = false } = {}) {
  if (mine == null || theirs == null) return { delta: null, favours: null };
  const delta = Math.round((mine - theirs) * 10) / 10;
  if (delta === 0) return { delta: 0, favours: "even" };
  const mineWins = lowerIsBetter ? delta < 0 : delta > 0;
  return { delta, favours: mineWins ? "receive" : "give" };
}

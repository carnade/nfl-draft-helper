// A player's week, in one line.
//
// Shaped to the position rather than laid out as a grid, because a grid of the
// same columns for everyone is mostly empty: a quarterback has no receptions, a
// receiver no carries, and a kicker neither. Four columns would leave two blank
// on almost every row.
//
// Reads the raw Sleeper stat keys. Those are live — applying a league's scoring
// settings to this line reproduces Sleeper's own players_points exactly (checked
// over 236 players of a real week), so it is the same data the running score is
// made of, and it fills in during games rather than after them.
//
// Segments are joined with a middle dot and each one is only there if it has
// something to say:
//
//   QB     242 pass yd, 1 TD · 1 car, -1 yd
//   RB     9 car, 85 yd, 1 TD · 3/3, 7 yd
//   WR/TE  4/6, 65 yd

/** A counting stat as a plain integer: 242, -1, 0. Never "242.0". */
function count(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.round(number);
}

/** Non-zero, after rounding — what decides whether a segment is worth printing. */
function has(stats, key) {
  const n = count(stats?.[key]);
  return n !== null && n !== 0;
}

function passing(stats) {
  if (!has(stats, "pass_yd") && !has(stats, "pass_att") && !has(stats, "pass_td")) {
    return null;
  }
  const parts = [`${count(stats.pass_yd) ?? 0} pass yd`];
  if (has(stats, "pass_td")) parts.push(`${count(stats.pass_td)} TD`);
  if (has(stats, "pass_int")) parts.push(`${count(stats.pass_int)} INT`);
  return parts.join(", ");
}

function rushing(stats) {
  if (!has(stats, "rush_att") && !has(stats, "rush_yd")) return null;
  const parts = [`${count(stats.rush_att) ?? 0} car`, `${count(stats.rush_yd) ?? 0} yd`];
  if (has(stats, "rush_td")) parts.push(`${count(stats.rush_td)} TD`);
  return parts.join(", ");
}

/**
 * Receptions over targets, then yards: "4/6, 65 yd".
 *
 * The slash is worth the terseness — catches against chances is the thing worth
 * knowing about a receiver's afternoon, and spelling both out doubles the width.
 */
function receiving(stats) {
  if (!has(stats, "rec") && !has(stats, "rec_tgt") && !has(stats, "rec_yd")) return null;
  const parts = [
    `${count(stats.rec) ?? 0}/${count(stats.rec_tgt) ?? 0}`,
    `${count(stats.rec_yd) ?? 0} yd`,
  ];
  if (has(stats, "rec_td")) parts.push(`${count(stats.rec_td)} TD`);
  return parts.join(", ");
}

// Which segments a position leads with. Anything not listed falls through to
// "show whatever is there", so a new or odd position degrades to something
// rather than to nothing.
const BY_POSITION = {
  QB: [passing, rushing, receiving],
  RB: [rushing, receiving, passing],
  WR: [receiving, rushing, passing],
  TE: [receiving, rushing, passing],
};

/**
 * The line for one player, or null when there is nothing to say.
 *
 * Null rather than "0/0, 0 yd" covers both a player whose game has not started
 * and one who played and did nothing — the caller shows a dash for either,
 * which is honest about both without claiming a performance.
 */
export function statLine(stats, position) {
  if (!stats) return null;
  const segments = BY_POSITION[String(position || "").toUpperCase()]
    || [passing, rushing, receiving];
  const line = segments.map((segment) => segment(stats)).filter(Boolean).join(" · ");
  return line || null;
}

/** Whether this player has a game behind them, which is not the same as a line. */
export function hasPlayed(stats) {
  return has(stats, "gp");
}

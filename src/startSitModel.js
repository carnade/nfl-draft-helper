// Working out whether a lineup is right, given priced projections.
//
// Pure: no React, no fetching. Everything it needs arrives as plain objects, so
// the awkward parts — slot alignment, flex eligibility, one bench player wanted by
// two slots — can be tested directly.
//
// A player looks like:
//   { id, name, position, fantasyPositions[], team, opponent, proj, hasProjection,
//     status, onBye, locked, l5, l10, dvpRank }

// Bench-like slots never hold a lineup decision.
export const LINEUP_EXCLUDED = new Set(["BN", "IR", "TAXI"]);

// Sleeper writes an unfilled slot as "0" (older leagues use an empty string).
const EMPTY_SLOT_IDS = new Set(["0", "", "null", "undefined"]);

// Statuses where the player is not going to play. Questionable is deliberately
// absent — it is a caution on the row, not a reason to bench someone.
export const HARD_FLAG_STATUSES = new Set([
  "Out", "IR", "PUP", "Sus", "NA", "Doubtful", "DNR",
]);

export const SLOT_ELIGIBILITY = {
  QB: ["QB"],
  RB: ["RB"],
  WR: ["WR"],
  TE: ["TE"],
  K: ["K"],
  DEF: ["DEF"],
  DST: ["DEF"],
  FLEX: ["RB", "WR", "TE"],
  WRRB_FLEX: ["RB", "WR"],
  REC_FLEX: ["WR", "TE"],
  SUPER_FLEX: ["QB", "RB", "WR", "TE"],
};

// A bench player has to beat the starter by this much before it is worth saying
// so. Sleeper's weekly projections miss by several points on average, so a gap
// this small sits inside the noise — it is a prompt to look, not a certainty.
export const SWAP_THRESHOLD = 1.0;

export function buildSlots(rosterPositions = []) {
  return rosterPositions.filter((p) => !LINEUP_EXCLUDED.has(p));
}

export function eligiblePositions(slot) {
  if (SLOT_ELIGIBILITY[slot]) return SLOT_ELIGIBILITY[slot];
  // An unknown flex variant is still a flex: better to offer RB/WR/TE than to
  // treat the slot as undecidable.
  if (typeof slot === "string" && slot.includes("FLEX")) return ["RB", "WR", "TE"];
  return [];
}

export function isEligible(slot, player) {
  if (!player) return false;
  const allowed = eligiblePositions(slot);
  if (allowed.length === 0) return false;
  // fantasy_positions, not the primary position: a WR/TE should fill REC_FLEX.
  const positions = player.fantasyPositions?.length
    ? player.fantasyPositions
    : [player.position].filter(Boolean);
  return positions.some((p) => allowed.includes(p));
}

// Why this player cannot be counted on, or null if nothing is wrong.
export function hardFlag(player) {
  if (!player) return "empty";
  if (player.onBye || player.status === "Bye") return "bye";
  if (HARD_FLAG_STATUSES.has(player.status)) return "out";
  return null;
}

function score(player) {
  return player && player.hasProjection ? player.proj : null;
}

// Slots are positional: starters[i] fills the i-th non-bench roster position.
export function buildRows({ rosterPositions = [], starters = [], bench = [], playerById = {} }) {
  const slots = buildSlots(rosterPositions);
  // A mismatch means the league is shaped in a way we have not seen; line up as
  // far as we can rather than dropping the lineup or throwing.
  const count = Math.min(slots.length, starters.length);

  const benchPlayers = bench
    .map((id) => playerById[id])
    .filter(Boolean)
    .filter((p) => !hardFlag(p));

  const rows = [];
  for (let i = 0; i < count; i += 1) {
    const slot = slots[i];
    const rawId = starters[i];
    const isEmpty = rawId == null || EMPTY_SLOT_IDS.has(String(rawId));
    const starter = isEmpty ? null : playerById[rawId] || null;

    const candidates = benchPlayers
      .filter((p) => !p.locked && isEligible(slot, p))
      .filter((p) => score(p) != null)
      .sort((a, b) => score(b) - score(a));

    rows.push({
      slot,
      index: i,
      starterId: isEmpty ? null : rawId,
      starter,
      candidates,
      locked: !!starter?.locked,
    });
  }
  return rows;
}

// One bench player must not be recommended into three slots at once, so the
// biggest upgrade claims them first and the other slots fall to their next best.
// A proper maximum-weight matching would squeeze out a little more, but it is not
// worth the complexity for a page whose advice is read one row at a time.
function assignCandidates(rows) {
  const ranked = rows
    .map((row) => {
      const starterScore = score(row.starter);
      const best = row.candidates[0];
      const delta = best && starterScore != null ? score(best) - starterScore : null;
      return { row, delta: delta == null ? Number.NEGATIVE_INFINITY : delta };
    })
    .sort((a, b) => b.delta - a.delta);

  const taken = new Set();
  for (const { row } of ranked) {
    if (row.locked) continue;
    const pick = row.candidates.find((p) => !taken.has(p.id));
    row.suggestion = pick || null;
    if (pick) taken.add(pick.id);
  }
  return rows;
}

export function evaluateLineup({ rosterPositions, starters, bench, playerById }) {
  const rows = assignCandidates(buildRows({ rosterPositions, starters, bench, playerById }));

  return rows.map((row) => {
    const { starter, suggestion } = row;
    const starterScore = score(starter);
    const suggestionScore = score(suggestion);
    const delta =
      starterScore != null && suggestionScore != null ? suggestionScore - starterScore : null;

    // A game already under way cannot be changed, so say nothing about it.
    if (row.locked) {
      return { ...row, verdict: "locked", reason: "game started", delta: null };
    }

    const flag = hardFlag(starter);
    if (flag) {
      return {
        ...row,
        verdict: "sit",
        reason: flag,
        delta,
        suggestion: suggestion || null,
        noReplacement: !suggestion,
      };
    }

    // No projection for a starter usually means they are not playing at all, so
    // it is worth surfacing even though there is no number to compare against.
    if (starterScore == null) {
      return {
        ...row,
        verdict: suggestion ? "sit" : "tossup",
        reason: "no projection",
        delta: null,
        suggestion: suggestion || null,
      };
    }

    if (delta == null) {
      return { ...row, verdict: "start", reason: "no alternative", delta: null, suggestion: null };
    }
    if (delta >= SWAP_THRESHOLD) {
      return { ...row, verdict: "sit", reason: "outprojected", delta };
    }
    if (delta > 0) {
      return { ...row, verdict: "tossup", reason: "close", delta };
    }
    // Ties go to the player already in the lineup.
    return { ...row, verdict: "start", reason: "ahead", delta, suggestion: null };
  });
}

export function countActionable(rows = []) {
  return rows.filter((r) => r.verdict === "sit").length;
}

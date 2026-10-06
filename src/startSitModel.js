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

/**
 * Whether this slot is currently worth nothing.
 *
 * A player on bye, ruled out, or missing from Sleeper's projections entirely is
 * not going to score. Anything eligible is an improvement on that — including a
 * backup projected at zero, who at least might play.
 */
function starterIsUnplayable(player) {
  return !player || !!hardFlag(player) || !player.hasProjection;
}

/**
 * What the slot is worth right now, as a number rather than an absence.
 *
 * Ranking used to use score(), which is null for anyone unprojected, and null
 * became -Infinity — so the rows that most needed a replacement sorted *last*
 * and picked over whatever the healthy rows had left. A bye is a certain zero,
 * and saying so puts those rows at the front where they belong.
 */
function effectiveScore(player) {
  return starterIsUnplayable(player) ? 0 : player.proj;
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

    // Everyone who could legally fill the slot, projected or not. Sleeper does
    // not project backups at all, so requiring a projection here used to hide
    // legal substitutions completely: a bye-week starter whose only cover was a
    // backup QB read "no eligible replacement" and the slot would not even open.
    // Unprojected players sort last and are never *recommended* over someone who
    // is playing — see assignCandidates — but they can be chosen by hand.
    const candidates = benchPlayers
      .filter((p) => !p.locked && isEligible(slot, p))
      .sort((a, b) => {
        const left = score(a);
        const right = score(b);
        if (left == null && right == null) return 0;
        if (left == null) return 1;
        if (right == null) return -1;
        return right - left;
      });

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
      const best = row.candidates[0];
      const gain = best ? score(best) - effectiveScore(row.starter) : null;
      return { row, gain: gain == null ? Number.NEGATIVE_INFINITY : gain };
    })
    .sort((a, b) => b.gain - a.gain);

  const taken = new Set();
  for (const { row } of ranked) {
    row.suggestion = null;
    if (row.locked) continue;
    const pick = row.candidates.find((p) => !taken.has(p.id));
    if (pick && worthSuggesting(row.starter, pick)) {
      row.suggestion = pick;
      // Reserved only now that the row will actually recommend them. Claiming
      // on every row meant a slot that ends up saying "start" still took a
      // bench player off the table, and the suggestion was then discarded —
      // leaving a genuinely empty slot with nothing to fill it.
      taken.add(pick.id);
    }
  }
  return rows;
}

/**
 * Whether this row would recommend the player, as opposed to merely allowing them.
 *
 * An unplayable starter is beaten by anything. Otherwise the candidate has to be
 * projected and ahead — which is also what keeps an unprojected backup from ever
 * being recommended over someone who is playing.
 */
function worthSuggesting(starter, candidate) {
  if (starterIsUnplayable(starter)) return true;
  const candidateScore = score(candidate);
  return candidateScore != null && candidateScore > score(starter);
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
        // Two different nothings, and the row should not conflate them: an empty
        // bench, or a bench whose eligible players a more valuable slot already
        // claimed. Only the first is "no eligible replacement".
        noReplacement: !suggestion && row.candidates.length === 0,
        benchSpokenFor: !suggestion && row.candidates.length > 0,
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

    // No suggestion, for one of two different reasons: nothing eligible is on the
    // bench, or the bench is simply worse. Both say "start", but the gap is still
    // worth reporting, so it comes off the best candidate rather than off the
    // suggestion that was deliberately not made.
    if (delta == null) {
      const best = row.candidates[0];
      const bestScore = score(best);
      if (bestScore == null) {
        return { ...row, verdict: "start", reason: "no alternative", delta: null, suggestion: null };
      }
      // Ties go to the player already in the lineup.
      return {
        ...row,
        verdict: "start",
        reason: "ahead",
        delta: bestScore - starterScore,
        suggestion: null,
      };
    }
    if (delta >= SWAP_THRESHOLD) {
      return { ...row, verdict: "sit", reason: "outprojected", delta };
    }
    return { ...row, verdict: "tossup", reason: "close", delta };
  });
}

export function countActionable(rows = []) {
  return rows.filter((r) => r.verdict === "sit").length;
}

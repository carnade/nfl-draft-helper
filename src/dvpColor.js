// Red→green gradients for a rank.
//
// Two functions, because the polarity differs and getting it backwards is the
// easy mistake here. A defence ranked 1st is the TOUGHEST matchup and reads
// red; a team ranked 1st in its league is winning and reads green.
//
//   getDvpColor(rank)        1-32 defence-vs-position rank, 1 = red
//   rankColor(rank, total)   any table of `total` rows, 1 = green
//
// They share the two colour ramps below so the palettes match on screen, but
// getDvpColor keeps its own hand-tuned band arithmetic untouched — five call
// sites depend on exactly the shades it already produces.

// t: 0 = deepest red, 1 = palest.
function redShade(t) {
  return `rgb(${Math.round(196 + 59 * t)}, ${Math.round(30 + 123 * t)}, ${Math.round(58 + 95 * t)})`;
}

// t: 0 = lightest green, 1 = deepest.
function greenShade(t) {
  return `rgb(${Math.round(44 - 14 * t)}, ${Math.round(142 - 16 * t)}, ${Math.round(62 - 10 * t)})`;
}

// Where the bands sit, as a fraction of the way down the table. A 12-team
// league lands 1-4 green, 5-8 neutral, 9-12 red. The middle is left uncoloured
// on purpose: a mid-table rank carries nothing worth shouting about.
const GOOD_BAND = 0.32;
const BAD_BAND = 0.32;

/**
 * Colour for `rank` out of `total`, or null through the neutral middle.
 *
 * @param {number} rank    1-based; 1 is the top of the table
 * @param {number} total   number of rows
 * @param {boolean} [bestIsGreen=true]  false when rank 1 is the bad end
 */
export function rankColor(rank, total, bestIsGreen = true) {
  if (typeof rank !== "number" || typeof total !== "number") return null;
  if (!rank || total < 2 || rank < 1 || rank > total) return null;

  // 1 at the best end, 0 at the worst.
  const position = (rank - 1) / (total - 1);
  const goodness = bestIsGreen ? 1 - position : position;

  if (goodness >= 1 - GOOD_BAND) {
    // Deepest at the very top.
    return greenShade((goodness - (1 - GOOD_BAND)) / GOOD_BAND);
  }
  if (goodness <= BAD_BAND) {
    // Deepest at the very bottom, so invert within the band.
    return redShade(goodness / BAD_BAND);
  }
  return null;
}

// Shared "defense vs. position" rank color gradient — used anywhere a 1-32
// team rank (1 = toughest/fewest allowed, 32 = easiest/most allowed) needs a
// red→green visual read. Red = tough matchup (avoid), green = smash spot.
// Ranks 11-21 are left neutral (no strong signal either way).
export function getDvpColor(rank) {
  if (!rank || typeof rank !== "number") return null;

  if (rank >= 1 && rank <= 10) {
    // Red gradient: rank 1 is darkest red (#c41e3a), rank 10 is lightest red (#ff9999)
    const intensity = 1 - (rank - 1) / 9; // 1.0 at rank 1, 0.1 at rank 10
    const r = Math.round(196 + 59 * (1 - intensity)); // 196 to 255
    const g = Math.round(30 + 123 * (1 - intensity));  // 30 to 153
    const b = Math.round(58 + 95 * (1 - intensity));   // 58 to 153
    return `rgb(${r}, ${g}, ${b})`;
  }

  if (rank >= 22 && rank <= 32) {
    // Green gradient: rank 22 starts light, rank 32 is slightly darker
    const intensity = (rank - 22) / 10; // 0.0 at rank 22, 1.0 at rank 32

    const rank30Intensity = (30 - 22) / 10; // 0.8
    const startR = Math.round(102 - 72 * rank30Intensity); // ~44
    const startG = Math.round(204 - 78 * rank30Intensity); // ~142
    const startB = Math.round(102 - 50 * rank30Intensity); // ~62

    const r = Math.round(startR - 14 * intensity); // 44 to 30
    const g = Math.round(startG - 16 * intensity); // 142 to 126
    const b = Math.round(startB - 10 * intensity); // 62 to 52

    return `rgb(${r}, ${g}, ${b})`;
  }

  return null;
}

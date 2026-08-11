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

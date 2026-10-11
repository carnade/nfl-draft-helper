// When a DFS player's game starts.
//
// The salary scrape carries game_day ("Sunday"), game_start_time ("1:00PM") and
// game_date ("2026-10-11") on every row.
//
// Ordering deliberately avoids the timezone conversion DFS.js does for its
// game-has-started check. Every kickoff in a slate is quoted in the same zone,
// so comparing them needs only a sortable key — date plus a 24-hour clock —
// and that sidesteps daylight saving entirely. Converting would be more code
// and one more place to get the March and November weekends wrong.

/** "Sunday" + "1:00PM" -> "Sun 1:00 PM", or null if the row has neither. */
export function kickoffLabel(player) {
  const day = String(player?.game_day || "").slice(0, 3);
  const raw = String(player?.game_start_time || "").trim();
  const time = raw.replace(/\s*(AM|PM)\s*$/i, (_m, ap) => ` ${ap.toUpperCase()}`);
  const parts = [day, time].filter(Boolean);
  return parts.length ? parts.join(" ") : null;
}

/**
 * A string that sorts in kickoff order: "2026-10-11 13:00".
 *
 * A row with a date but no usable time sorts after everything else that day
 * rather than ahead of it — an unknown kickoff should not be reported as the
 * one the lineup locks on.
 */
export function kickoffSortKey(player) {
  const date = player?.game_date;
  if (!date) return null;

  const match = String(player?.game_start_time || "").match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return `${date} 99:99`;

  let hours = parseInt(match[1], 10);
  const minutes = match[2];
  const meridiem = match[3].toUpperCase();
  if (meridiem === "PM" && hours !== 12) hours += 12;
  if (meridiem === "AM" && hours === 12) hours = 0;

  return `${date} ${String(hours).padStart(2, "0")}:${minutes}`;
}

/** Whichever of these plays first, or null if none of them say when. */
export function earliestKickoff(players = []) {
  let best = null;
  let bestKey = null;
  for (const player of players) {
    const key = player && kickoffSortKey(player);
    if (!key) continue;
    if (bestKey === null || key < bestKey) {
      bestKey = key;
      best = player;
    }
  }
  return best;
}

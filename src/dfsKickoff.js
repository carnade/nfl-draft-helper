// When a DFS player's game starts, in the reader's own time.
//
// The salary scrape quotes kickoffs in US Eastern — game_day "Sunday",
// game_start_time "1:00PM", game_date "2026-10-11" — which is the wrong clock
// for anyone reading this from Europe. Everything here converts to the
// browser's timezone, the same choice kickoffFilter.js makes and for the same
// reason: the times shown have to agree with the clock on the wall next to you.
//
// That conversion can move the day as well as the hour. A Sunday night game at
// 8:20PM Eastern is Monday at 02:20 in Stockholm, so the day is recomputed
// rather than taken from game_day, which is always the American one.
//
// The Eastern-to-UTC parsing below used to live in DFS.js, where its daylight
// saving arithmetic could not be tested.

const getUsdDstBoundsUtc = (year) => {
  const march1Utc = Date.UTC(year, 2, 1);
  const march1Day = new Date(march1Utc).getUTCDay();
  const firstSundayMarch = march1Day === 0 ? 1 : 8 - march1Day;
  const secondSundayMarch = firstSundayMarch + 7;
  const dstStartUtc = Date.UTC(year, 2, secondSundayMarch, 7, 0); // 2 AM local -> 7 AM UTC

  const nov1Utc = Date.UTC(year, 10, 1);
  const nov1Day = new Date(nov1Utc).getUTCDay();
  const firstSundayNovember = nov1Day === 0 ? 1 : 8 - nov1Day;
  const dstEndUtc = Date.UTC(year, 10, firstSundayNovember, 6, 0); // 2 AM local -> 6 AM UTC

  return { dstStartUtc, dstEndUtc };
};

const convertEasternLocalToUtc = (year, monthIndex, day, hour24, minute) => {
  const { dstStartUtc, dstEndUtc } = getUsdDstBoundsUtc(year);
  const dstCandidateUtc = Date.UTC(year, monthIndex, day, hour24 + 4, minute);
  const stdCandidateUtc = Date.UTC(year, monthIndex, day, hour24 + 5, minute);
  const isDst = dstCandidateUtc >= dstStartUtc && dstCandidateUtc < dstEndUtc;
  return new Date(isDst ? dstCandidateUtc : stdCandidateUtc);
};

/**
 * An Eastern date and clock time as a real instant.
 *
 * Falls back to 6:00PM Eastern when the time is missing or unreadable, which is
 * what the game-has-started check wants: a late guess locks a player too late
 * rather than too early. Callers that must not guess use kickoffAt instead.
 */
export function parseGameStartToUtc(gameDate, gameStartTime) {
  if (!gameDate) return null;

  let timeStr =
    typeof gameStartTime === "string" && gameStartTime.trim().length > 0
      ? gameStartTime.trim()
      : "6:00PM";

  if (!timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i)) {
    timeStr = "6:00PM";
  }

  const parsed = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!parsed) return null;

  let hours = parseInt(parsed[1], 10);
  const minutes = parseInt(parsed[2], 10);
  const meridiem = parsed[3].toUpperCase();
  if (meridiem === "PM" && hours !== 12) hours += 12;
  else if (meridiem === "AM" && hours === 12) hours = 0;

  const year = parseInt(gameDate.slice(0, 4), 10);
  const monthIndex = parseInt(gameDate.slice(5, 7), 10) - 1;
  const day = parseInt(gameDate.slice(8, 10), 10);

  if ([year, monthIndex, day, hours, minutes].some(Number.isNaN)) return null;

  return convertEasternLocalToUtc(year, monthIndex, day, hours, minutes);
}

/**
 * The instant this player kicks off, or null if the row does not really say.
 *
 * Stricter than parseGameStartToUtc on purpose: a row with a date but no
 * readable time returns null rather than a guessed 6pm, so an unknown kickoff
 * is never reported as the moment the lineup locks.
 */
export function kickoffAt(player) {
  if (!player?.game_date) return null;
  if (!String(player.game_start_time || "").match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i)) return null;
  const at = parseGameStartToUtc(player.game_date, player.game_start_time);
  return at && !Number.isNaN(at.getTime()) ? at : null;
}

/**
 * "Sun 19:00", in the reader's timezone.
 *
 * A row that gives a day but no usable time still says the day — knowing it is
 * Sunday is better than nothing — but it comes from the scrape, so it is the
 * American day and is left as-is rather than shifted on a guess.
 */
export function kickoffLabel(player) {
  const at = kickoffAt(player);
  if (at) {
    const day = at.toLocaleDateString(undefined, { weekday: "short" });
    const time = at.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    return `${day} ${time}`;
  }
  const day = String(player?.game_day || "").slice(0, 3);
  return day || null;
}

/** Whichever of these plays first, or null if none of them say when. */
export function earliestKickoff(players = []) {
  let best = null;
  let bestAt = null;
  for (const player of players) {
    const at = kickoffAt(player);
    if (!at) continue;
    if (bestAt === null || at < bestAt) {
      bestAt = at;
      best = player;
    }
  }
  return best;
}

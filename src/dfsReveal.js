// Whether a tournament's week is still meant to be secret.
//
// Pure, because the answer governs what a results page is allowed to render
// and that is worth being able to test without a page in front of it.
//
// Three sources of truth, in descending order of how much they can be trusted:
//
//   1. The server's `reveal_pending`. It owns the clock the reveal time is
//      measured against, it is what withheld the lineups, and it is the only
//      side that can tell a real organiser from somebody who typed
//      admin=true into the URL — it verifies a Sleeper token to do it.
//   2. The reveal time, compared against this browser's clock. A fallback for
//      when the server says nothing: an organiser's own view, or a tournament
//      with no reveal set.
//   3. `isAdmin`, which is a URL parameter and a local privilege check. It can
//      reopen the page when the server has not objected, and nothing more.
//
// The ordering matters because the old gate had only the second and third, and
// both fail open: an unparseable date makes an Invalid Date, which is truthy
// and compares false against everything, and a browser clock that runs fast
// crosses the reveal early. Either one showed the week's figures.

/**
 * A reveal time as a Date, or null if it cannot be read as one.
 *
 * Null rather than an Invalid Date on purpose. `new Date("nonsense")` is
 * truthy, so it passed a presence check and then lost every comparison,
 * switching the gate off rather than closing it.
 */
export function parseRevealTime(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Whether to hide everything derived from this week's play.
 *
 * Not only the lineups: the position statistics go too. "Best Not Chosen" is
 * built from the week's whole salary and points dataset minus whoever was
 * picked, so with the lineups withheld nobody counts as picked and the table
 * becomes a plain list of the week's best performers and their scores — the
 * results, by another route, with no lineup needed to get at them.
 */
export function revealIsPending({
  serverSaysPending = false,
  revealTime = null,
  isAdmin = false,
  now = new Date(),
} = {}) {
  if (serverSaysPending) return true;
  if (!revealTime) return false;
  if (isAdmin) return false;
  return now < revealTime;
}

// Whether a matchup is over, and how it went.
//
// Pure, so the edge cases can be checked without a league in front of them —
// and there are more of them than the question suggests: a bye week, a side
// that has not started anybody, and a tie.

/**
 * "win" | "loss" | "tie" once every starter on both sides has played, else null.
 *
 * Both sides, deliberately. A matchup where my players are all done but the
 * opponent still has a Monday night game is not a result yet, however far
 * ahead the score is.
 *
 * Scores are compared at the two decimal places they are displayed to. Both
 * are sums of floating point projections and actuals, so comparing the raw
 * numbers would occasionally call a drawn matchup a one-point win while the
 * page showed two identical scores.
 */
export function finalOutcome({
  hasOpponent,
  myPlayed,
  myStarters,
  oppPlayed,
  oppStarters,
  myLive,
  oppLive,
} = {}) {
  // A bye has nobody to beat, so there is no result to colour.
  if (!hasOpponent) return null;
  // A side with no starters has not finished; it has not begun.
  if (!myStarters || !oppStarters) return null;
  if (myPlayed < myStarters || oppPlayed < oppStarters) return null;

  const round = (n) => Math.round((Number(n) || 0) * 100);
  const mine = round(myLive);
  const theirs = round(oppLive);

  if (mine > theirs) return "win";
  if (mine < theirs) return "loss";
  return "tie";
}

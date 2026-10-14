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

/**
 * How much of this starter's game is still to come: 1 before kickoff, 0 after.
 *
 * The case worth naming is a starter whose team is not playing at all — a
 * manager who left somebody in the lineup through their bye. They can never
 * score, so they are finished, not pending. Treating them as pending left the
 * matchup permanently unresolved: it was never "every starter has played", so
 * it never read as a result and never showed a best lineup.
 *
 * `teamsPlaying` empty means the schedule did not load. Then nothing is known,
 * and claiming everyone has finished would declare results that have not
 * happened — so it falls back to pending.
 */
export function remainingForStarter({ team, teamsPlaying, gameClocks = {} } = {}) {
  const knowSchedule = teamsPlaying instanceof Set && teamsPlaying.size > 0;
  if (knowSchedule && (!team || !teamsPlaying.has(team))) return 0;
  if (team && team in gameClocks) return gameClocks[team];
  return 1;
}

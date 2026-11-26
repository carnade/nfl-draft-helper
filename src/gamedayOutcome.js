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

// ── Where a starter is in their game ────────────────────────────────────────
//
// The clock fraction above answers "how much is left", which is what the live
// projection needs. It cannot answer "has this one played yet", because a game
// at its first snap and a game not yet kicked off both read as a full hour
// remaining — and those are the two states most worth telling apart while
// watching a slate.
//
// So this reads the status Sleeper sends rather than the clock derived from it.

// What Sleeper calls a game nobody is playing. Anything else is live, so an
// unfamiliar value errs towards "in progress" rather than claiming a result.
const FINISHED_STATUSES = new Set(["complete", "post_game"]);
const CALLED_OFF_STATUSES = new Set(["canceled", "postponed", "suspended"]);

/** One game's state, from the `scores` payload. */
export function gameState(status, metadata) {
  if (FINISHED_STATUSES.has(status) || metadata?.is_over) return "done";
  if (CALLED_OFF_STATUSES.has(status)) return "off";
  if (status === "pre_game") return "pre";
  // No status at all is not a game in progress; it is a game we know nothing
  // about, and saying "live" would put a pulse on a row that has none.
  return status ? "live" : "pre";
}

/** team → state, for every game in the week. */
export function gameStatesByTeam(games = []) {
  const byTeam = {};
  for (const game of games) {
    const state = gameState(game?.status, game?.metadata);
    for (const side of ["home_team", "away_team"]) {
      const team = game?.metadata?.[side];
      if (team) byTeam[team] = state;
    }
  }
  return byTeam;
}

/**
 * Where this starter stands: "done", "live", "pre", "bye", or null if unknown.
 *
 * A starter whose team has no game this week is on a bye — somebody left them
 * in the lineup — which is neither played nor waiting, and is the one case
 * worth naming separately. It mirrors remainingForStarter above, which calls
 * the same case finished because for scoring purposes it is.
 *
 * Null rather than a guess when the schedule did not load, so the panel can
 * show nothing instead of colouring every row the same wrong colour.
 */
export function starterState({ team, teamsPlaying, gameStates = {} } = {}) {
  const knowSchedule = teamsPlaying instanceof Set && teamsPlaying.size > 0;
  if (!team) return null;
  if (knowSchedule && !teamsPlaying.has(team)) return "bye";
  if (team in gameStates) return gameStates[team];
  return knowSchedule ? "pre" : null;
}

/** A team's record as it reads on a card: "6-5", or "6-5-1" when it matters. */
export function recordLabel(settings) {
  const wins = Number(settings?.wins);
  const losses = Number(settings?.losses);
  if (!Number.isFinite(wins) || !Number.isFinite(losses)) return null;
  const ties = Number(settings?.ties);
  return Number.isFinite(ties) && ties > 0
    ? `${wins}-${losses}-${ties}`
    : `${wins}-${losses}`;
}

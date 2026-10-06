// Reading Sleeper's season schedule: who is locked, and who is idle.
//
// Both answers used to be derived inside StartSit, where neither could be
// tested and one of them was quietly wrong. They are pure functions over the
// same payload, so they live here instead.
//
// A game looks like { week, home, away, status }, and the endpoint returns the
// whole regular season in one array.

/**
 * The teams whose game this week is no longer changeable.
 *
 * A game that is not "pre_game" has started, so everyone playing in it is
 * locked. Using Sleeper's own status avoids parsing kickoff times and the
 * timezone guesswork that comes with them.
 */
export function lockedTeamsFor(schedule, week) {
  const locked = new Set();
  for (const game of Array.isArray(schedule) ? schedule : []) {
    if (game?.week !== week) continue;
    if (game.status && game.status !== "pre_game") {
      if (game.home) locked.add(game.home);
      if (game.away) locked.add(game.away);
    }
  }
  return locked;
}

/**
 * The teams with no game this week, i.e. on bye.
 *
 * Sleeper's injury_status carries "Bye" only when the player has no other
 * designation — Rashee Rice read "Questionable" in a week Kansas City was idle,
 * so his Start/Sit row said "no projection" rather than "on bye".
 *
 * This replaces a fallback that could never fire: a projected player with no
 * opponent. Sleeper publishes no projections at all for a bye team, so
 * hasProjection is always false in exactly the case that clause existed for.
 */
export function byeTeamsFor(schedule, week) {
  const everyTeam = new Set();
  const playing = new Set();
  for (const game of Array.isArray(schedule) ? schedule : []) {
    for (const team of [game?.home, game?.away]) {
      if (!team) continue;
      everyTeam.add(team);
      if (game?.week === week) playing.add(team);
    }
  }
  // A schedule that failed to load must not put every team on bye.
  if (playing.size === 0) return new Set();
  return new Set([...everyTeam].filter((team) => !playing.has(team)));
}

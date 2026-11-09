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

// ── The same two questions, of our own backend's schedule ──────────────────
//
// GET /stats/schedule/{week} answers them for one week with a different row
// shape: { home_team, away_team, gameday, gametime, ... } rather than Sleeper's
// { week, home, away, status }. It is worth the second shape because it carries
// the one thing Sleeper's does not — a kickoff time — which is what turns "this
// lineup is broken" into "and it has to be fixed by Sunday 19:00".
//
// Already filtered to the week asked for, so there is no week argument here.

/**
 * When each team kicks off this week: { KC: Date, ... }.
 *
 * A team with an unreadable kickoff is left out rather than mapped to null, so
 * a caller taking the earliest of several cannot pick up an absence as if it
 * were a time.
 */
export function kickoffsByTeam(rows, parseKickoff) {
  const byTeam = {};
  for (const game of Array.isArray(rows) ? rows : []) {
    const at = parseKickoff(game?.gameday, game?.gametime);
    if (!at) continue;
    for (const team of [game.home_team, game.away_team]) {
      if (team) byTeam[team] = at;
    }
  }
  return byTeam;
}

/**
 * The teams with a game this week.
 *
 * Anyone absent is idle, which is how a bye is decided here — the week has
 * already been filtered, so there is no full-season list to subtract from.
 * An empty set means the schedule did not load, and the caller must not read
 * that as the whole league being on bye.
 */
export function teamsPlayingIn(rows) {
  const playing = new Set();
  for (const game of Array.isArray(rows) ? rows : []) {
    if (game?.home_team) playing.add(game.home_team);
    if (game?.away_team) playing.add(game.away_team);
  }
  return playing;
}

/**
 * A Sleeper team code as nflverse spells it.
 *
 * The two disagree on three teams, and the schedule our backend serves is
 * nflverse's. Left unmapped, every Rams player read as on bye with no kickoff:
 * Sleeper calls them LAR and that schedule calls them LA, so they matched no
 * game in it. Lifted out of StartSit, which had the only copy.
 */
export const TEAM_ABBR_MAP = { LAR: "LA", WSH: "WAS", JAC: "JAX" };

export const nflverseTeam = (team) => TEAM_ABBR_MAP[team] || team;

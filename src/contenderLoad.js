// Everything the Contender tab fetches, in one place.
//
// Separated from the component so the arithmetic can be tested against fixtures
// and the component against a single mocked module, rather than against nine
// hand-stubbed URLs. Every call here is free — Sleeper and our own backend. No
// paid source is touched.
//
// The costs are wildly uneven and that shapes the design:
//
//   schedule        27 KB   the whole season's fixtures, so byes come free
//   league + rosters ~35 KB
//   season stats    640 KB on the wire, ~30 KB kept
//   finder rows     290 KB, usually already cached by the Player Finder
//   projections     2.1 MB *per week*, and the horizon is up to eight weeks
//
// So the points-per-game basis costs well under 200 KB and is what the tab
// opens on; the projection basis is 17 MB and only loads when asked for. What
// is kept from each week is the priced total per player — about 500 numbers,
// 8 KB — which is why the second comparison is instant.

import { readCache, writeCache } from "./ttlCache";
import {
  fetchWeekProjectionsUrl,
  hasProjection,
  projectedPoints,
} from "./leagueScoring";
import {
  reduceStatRows,
  scoringStatKeys,
  seasonStatsUrl,
} from "./playerForm";
import { fetchFinderRows } from "./finderRows";

export const SEASON = 2026;

const BASE_URL = process.env.REACT_APP_MOCK
  ? "http://localhost:5000"
  : "https://shaggy-latashia-carnade-2ea2054a.koyeb.app";

const SLEEPER = "https://api.sleeper.app/v1";

const LEAGUES_TTL_MS = 30 * 60 * 1000;
const ROSTERS_TTL_MS = 10 * 60 * 1000;   // a waiver or a trade invalidates these
const USERS_TTL_MS = 6 * 60 * 60 * 1000;
const SCHEDULE_TTL_MS = 24 * 60 * 60 * 1000;
const STATS_TTL_MS = 6 * 60 * 60 * 1000;
// The current week's projections move as the week does; a future week's barely
// move at all, and a 2.1 MB refetch for nothing is the expensive mistake here.
const PROJ_TTL_CURRENT_MS = 30 * 60 * 1000;
const PROJ_TTL_FUTURE_MS = 12 * 60 * 60 * 1000;

const json = async (url, { signal } = {}) => {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
};

/**
 * A league is usable here if it is a real head-to-head league being played.
 *
 * Best-ball has no lineup to optimise — the whole premise of the tab is that a
 * trade changes who you start — and a league still in pre-draft has no rosters
 * to compare. The same filter StartSit uses, plus the status.
 */
export function playableLeagues(leagues) {
  return (Array.isArray(leagues) ? leagues : []).filter((league) => {
    const settings = league?.settings || {};
    const redraftOrDynasty = settings.type === 0 || settings.type === 2;
    return redraftOrDynasty && settings.best_ball !== 1 && league.status !== "pre_draft";
  });
}

/** The signed-in user's leagues for this season, with everything they carry. */
export async function loadLeagues(userName, { signal } = {}) {
  const name = String(userName || "").trim();
  if (!name) return { userId: null, leagues: [] };

  const key = `ch_leagues_${name.toLowerCase()}_${SEASON}`;
  const cached = readCache(key, LEAGUES_TTL_MS);
  if (cached) return cached;

  const user = await json(`${SLEEPER}/user/${encodeURIComponent(name)}`, { signal });
  if (!user?.user_id) return { userId: null, leagues: [] };

  const leagues = await json(
    `${SLEEPER}/user/${user.user_id}/leagues/nfl/${SEASON}`,
    { signal }
  );

  // The league objects already carry roster_positions, scoring_settings and
  // settings, so choosing one costs no further request.
  const answer = { userId: String(user.user_id), leagues: playableLeagues(leagues) };
  writeCache(key, answer);
  return answer;
}

/** One league's rosters and the managers behind them. */
export async function loadLeagueDetail(leagueId, { signal } = {}) {
  if (!leagueId) return { rosters: [], users: [] };

  const rosterKey = `ch_rosters_${leagueId}`;
  const userKey = `ch_users_${leagueId}`;

  const [rosters, users] = await Promise.all([
    (async () => {
      const cached = readCache(rosterKey, ROSTERS_TTL_MS);
      if (cached) return cached;
      const rows = await json(`${SLEEPER}/league/${leagueId}/rosters`, { signal });
      const kept = (Array.isArray(rows) ? rows : []).map((roster) => ({
        roster_id: roster.roster_id,
        owner_id: roster.owner_id,
        co_owners: roster.co_owners || [],
        // Sleeper sends null, not [], for a league with no IR or taxi squad.
        players: roster.players || [],
        reserve: roster.reserve || [],
        taxi: roster.taxi || [],
      }));
      writeCache(rosterKey, kept);
      return kept;
    })(),
    (async () => {
      const cached = readCache(userKey, USERS_TTL_MS);
      if (cached) return cached;
      const rows = await json(`${SLEEPER}/league/${leagueId}/users`, { signal });
      const kept = (Array.isArray(rows) ? rows : []).map((user) => ({
        user_id: user.user_id,
        display_name: user.display_name,
        metadata: { team_name: user.metadata?.team_name || null },
      }));
      writeCache(userKey, kept);
      return kept;
    })(),
  ]);

  return { rosters, users };
}

/**
 * The whole regular season's fixtures, 27 KB.
 *
 * Every bye comes out of this by subtraction, which is the only way to get one:
 * no endpoint anywhere states a bye week, and the projections only imply it.
 */
export async function loadSchedule({ signal } = {}) {
  const key = `ch_schedule_${SEASON}`;
  const cached = readCache(key, SCHEDULE_TTL_MS);
  if (cached) return cached;

  const rows = await json(
    `https://api.sleeper.app/schedule/nfl/regular/${SEASON}`,
    { signal }
  );
  const kept = (Array.isArray(rows) ? rows : []).map((game) => ({
    week: game.week,
    home: game.home,
    away: game.away,
  }));
  writeCache(key, kept);
  return kept;
}

/**
 * Season totals, trimmed to the stats this league scores.
 *
 * Shares StartSit's key and shape, including its guard: a cache written for a
 * narrower set of scoring keys is refetched rather than quietly reused, because
 * a missing key reads as a stat the player never accumulated.
 */
export async function loadSeasonStats(league, { signal } = {}) {
  const keepKeys = scoringStatKeys([league]);
  const key = `sleeper_stats_season_${SEASON}`;

  const cached = readCache(key, STATS_TTL_MS);
  if (cached?.stats && [...keepKeys].every((k) => cached.keys?.includes(k))) {
    return cached.stats;
  }

  const rows = await json(seasonStatsUrl(SEASON), { signal });
  const stats = reduceStatRows(rows, keepKeys);
  writeCache(key, { keys: [...keepKeys], stats });
  return stats;
}

/**
 * Name, position and team for a set of players, from our own backend.
 *
 * Needed because the season-stats payload is stats only, and because defences
 * and kickers are absent from the finder rows. Deliberately one request for the
 * whole list — the endpoint takes a list and the Trade Helper's one-at-a-time
 * calls are a wart, not a pattern to copy.
 */
export async function loadPlayerMeta(playerIds, { signal } = {}) {
  const ids = [...new Set((playerIds || []).filter(Boolean).map(String))];
  if (ids.length === 0) return {};

  const response = await fetch(`${BASE_URL}/getplayers/data`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ playerlist: ids }),
    signal,
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) || {};
}

/** The schedule-strength rows, keyed by the nflverse team they describe. */
export async function loadScheduleStrength({ signal } = {}) {
  const rows = await fetchFinderRows({ signal });
  const byTeam = {};
  const byPlayer = {};
  for (const row of Array.isArray(rows) ? rows : []) {
    if (row?.sleeper_id) byPlayer[String(row.sleeper_id)] = row;
    // Every player on a team carries the same ros/post win-rate cells, so the
    // first one seen is enough. `vspos` is narrowed server-side to that row's
    // own position, which is why it is read per player rather than per team.
    if (row?.team && row.sos && !byTeam[row.team]) byTeam[row.team] = row.sos;
  }
  return { byTeam, byPlayer };
}

/** The TTL a given week's projections should be cached for. */
export function projectionTtl(week, currentWeek) {
  return Number(week) === Number(currentWeek) ? PROJ_TTL_CURRENT_MS : PROJ_TTL_FUTURE_MS;
}

/**
 * One week of projections, priced in this league's scoring.
 *
 * The payload is 2.1 MB of which ~500 rows carry a real projection; what is
 * kept is one number per projected player. Keyed by league because the pricing
 * is the league's own, and by week because that is what was fetched.
 *
 * Players with no projection are simply absent from the result, which is what
 * makes `pointsFor` return null for them — and that is the right answer twice
 * over: a player Sleeper does not project, and a player whose team is on bye
 * and so has no row at all.
 */
export async function loadWeekProjections(league, week, { signal, currentWeek } = {}) {
  const leagueId = league?.league_id;
  const key = `ch_proj_${leagueId}_${SEASON}_${week}`;

  const cached = readCache(key, projectionTtl(week, currentWeek));
  if (cached) return cached;

  const rows = await json(fetchWeekProjectionsUrl(SEASON, week), { signal });
  const scoring = league?.scoring_settings || {};
  const priced = {};
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row?.player_id || !hasProjection(row.stats)) continue;
    priced[String(row.player_id)] = Math.round(projectedPoints(row.stats, scoring) * 100) / 100;
  }
  writeCache(key, priced);
  return priced;
}

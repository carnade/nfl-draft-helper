import React, { useCallback, useEffect, useRef, useState } from "react";
import "./Gameday.css";

import { projectedPoints, PROJECTION_POSITIONS } from "./leagueScoring";
import { loadHiddenLeagues, visibleLeagues } from "./leagueVisibility";
import { finalOutcome } from "./gamedayOutcome";
import {
  weekToShow,
  pinnedWeek,
  weekStatuses,
  weekIsSelectable,
} from "./gamedayWeek";
import { bestLineupPoints } from "./bestLineup";
import { readFinalWeek, writeFinalWeek } from "./finalWeekCache";
import {
  summariseWeek,
  summariseSeason,
  missingWeeks,
  pctTone,
} from "./seasonSummary";

const SEASON = 2026;
// How often to re-read scores while games are on. Projections are left alone —
// they move with injury news, not with play — so a poll only costs two small
// requests per league.
const LIVE_POLL_MS = 60_000;
// Statuses that mean no football is being played right now. Anything else —
// whatever Sleeper calls a game in progress — counts as live, so an unfamiliar
// value errs towards refreshing rather than going quiet during a game.
const IDLE_GAME_STATUSES = new Set([
  "pre_game", "complete", "post_game", "canceled", "postponed", "suspended",
]);

// Sleeper's live projection does not simply swap a played starter's projection
// for their points so far — that would write off the rest of a game still being
// played, and it left us 15 to 47 points light across leagues mid-slate. It
// keeps the share of the projection that the remaining clock still covers:
//
//   live = points so far + projection × (game time remaining / 60 minutes)
//
// which collapses to the projection before kickoff and to the real score once
// the game is over, so the same expression covers all three states.
function fractionRemaining(status, metadata) {
  if (status === "complete" || metadata?.is_over) return 0;
  if (status === "pre_game") return 1;
  const quarter = metadata?.quarter_num || 1;
  const [minutes, seconds] = String(metadata?.time_remaining || "15:00").split(":");
  const secondsLeft = (4 - quarter) * 900 + Number(minutes) * 60 + Number(seconds);
  if (!Number.isFinite(secondsLeft)) return 1;
  return Math.max(0, Math.min(1, secondsLeft / 3600));
}

// team → how much of its game is left, for every game this week.
async function fetchGameClocks(week, token, signal) {
  const query = `{scores(sport:"nfl",season:"${SEASON}",season_type:"regular",week:${week}){status metadata}}`;
  const res = await fetch("https://sleeper.com/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-platform": "web", authorization: token },
    body: JSON.stringify({ query }),
    signal,
  });
  const json = await res.json();
  const byTeam = {};
  for (const game of json?.data?.scores || []) {
    const remaining = fractionRemaining(game.status, game.metadata);
    for (const side of ["home_team", "away_team"]) {
      const team = game.metadata?.[side];
      if (team) byTeam[team] = remaining;
    }
  }
  return byTeam;
}

// Whether any game in this week has kicked off, finished or otherwise left the
// schedule alone. Distinguishes "the week Sleeper has moved on to" from "the
// week being played", which is what decides whether a Tuesday still belongs to
// the result you were watching last night.
// 27 KB for the season, so it is a cheap thing to ask before deciding to
// refresh a dozen leagues.
async function fetchSchedule(signal) {
  const games = await fetch(
    `https://api.sleeper.app/schedule/nfl/regular/${SEASON}`,
    { signal }
  ).then((r) => r.json());
  return Array.isArray(games) ? games : [];
}

// Kicked off and not yet finished.
const anyGameInProgress = (games, week) =>
  games.some((g) => g.week === week && !IDLE_GAME_STATUSES.has(g.status));

// Kicked off at all, finished or not. Distinguishes the week Sleeper has moved
// on to from the week being played, which is what decides whether a Tuesday
// still belongs to the result being watched the night before.
const anyGameStarted = (games, week) =>
  games.some((g) => g.week === week && g.status && g.status !== "pre_game");

function getAuth() {
  try {
    const raw = localStorage.getItem("sleeper_auth");
    if (!raw) return null;
    const auth = JSON.parse(raw);
    if (!auth || !auth.token) return null;
    if (auth.exp && auth.exp * 1000 < Date.now()) return null;
    return auth;
  } catch {
    return null;
  }
}

async function resolveUserId(auth, signal) {
  const res = await fetch(`https://api.sleeper.app/v1/user/${auth.display_name}`, { signal });
  const user = await res.json();
  return user.user_id;
}

// `round` is the NFL week: round 2 returns week 2's pairing. It used to be pinned
// to 1, which was right only while week 1 was current — after the rollover the
// opponent stayed on week 1 while the scores, which come from the REST call, moved
// on. Preseason reports week 0, where there are no legs, so ask for week 1 then.
async function fetchLeagueMatchup(leagueId, token, signal, week) {
  const round = week > 0 ? week : 1;
  const query = `query get_league_detail {
    league_rosters(league_id: "${leagueId}"){
      league_id owner_id roster_id
    }
    league_users(league_id: "${leagueId}"){
      user_id display_name
    }
    matchup_legs(league_id: "${leagueId}", round: ${round}){
      matchup_id roster_id points proj_points starters player_map
    }
  }`;

  const res = await fetch("https://sleeper.com/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-platform": "web",
      authorization: token,
      "x-sleeper-graphql-op": "get_league_detail",
    },
    body: JSON.stringify({ operationName: "get_league_detail", variables: {}, query }),
    signal,
  });
  const json = await res.json();
  return json.data;
}

function buildMatchupResult(
  gqlData,
  userId,
  {
    scoring,
    projections,
    playerPoints,
    gameClocks,
    squadByRoster = {},
    rosterPositions = [],
    positionsOf = () => [],
  }
) {
  const rosters = gqlData.league_rosters || [];
  const users = gqlData.league_users || [];
  const legs = gqlData.matchup_legs || [];

  const ownerToName = {};
  for (const u of users) ownerToName[u.user_id] = u.display_name;

  const rosterIdToOwner = {};
  for (const r of rosters) rosterIdToOwner[r.roster_id] = r.owner_id;

  const myRoster = rosters.find((r) => r.owner_id === userId);
  if (!myRoster) return null;

  const myLeg = legs.find((l) => l.roster_id === myRoster.roster_id);
  if (!myLeg) return null;

  const oppLeg = legs.find(
    (l) => l.matchup_id === myLeg.matchup_id && l.roster_id !== myRoster.roster_id
  );

  const myProj = myLeg.proj_points ?? 0;
  const oppProj = oppLeg?.proj_points ?? 0;
  const oppOwnerId = oppLeg ? rosterIdToOwner[oppLeg.roster_id] : null;
  const oppName = oppOwnerId ? (ownerToName[oppOwnerId] ?? "Opponent") : "Bye";

  // Rebuild the side from its starters: points already banked, plus whatever
  // share of each projection the remaining clock still covers. A starter whose
  // game has not kicked off contributes their whole projection, one whose game is
  // over contributes only what they scored, and one mid-game contributes both.
  //
  // A side with nobody started is left on Sleeper's proj_points rather than this
  // sum. The two agree to within a couple of hundredths — our pricing of projected
  // stats is a hair off in some scoring formats — and showing a number that
  // differs from Sleeper's before a ball has been kicked is not worth it.
  function legTotals(leg) {
    const starters = leg?.starters || [];
    const playerMap = leg?.player_map || {};
    let live = 0;
    let finished = 0;
    let started = 0;
    for (const playerId of starters) {
      const team = playerMap[playerId]?.team;
      // A player with no game this week keeps their (zero) projection rather than
      // being treated as still to play.
      const remaining = team in gameClocks ? gameClocks[team] : 1;
      const actual = playerPoints[playerId] || 0;
      live += actual + projectedPoints(projections[playerId], scoring) * remaining;
      if (remaining === 0) finished += 1;
      if (remaining < 1) started += 1;
    }
    return { live, played: finished, started, starters: starters.length };
  }

  const mine = legTotals(myLeg);
  const opp = legTotals(oppLeg);

  const myLive = mine.started > 0 ? mine.live : myProj;
  const oppLive = opp.started > 0 ? opp.live : oppProj;

  // Only worth computing once the games are over. Mid-week this is "the best
  // of what has been played so far", which keeps rising and reads as a claim
  // it is not.
  const bestFor = (leg) =>
    bestLineupPoints({
      rosterPositions,
      players: squadByRoster[leg?.roster_id] || [],
      playerPoints,
      positionsOf,
    });

  const final = finalOutcome({
    hasOpponent: !!oppLeg,
    myPlayed: mine.played,
    myStarters: mine.starters,
    oppPlayed: opp.played,
    oppStarters: opp.starters,
    myLive,
    oppLive,
  });

  return {
    myProj,
    oppProj,
    // Each side stands on its own: a side with nobody played is still just its
    // projection, whatever the other side has done.
    myLive,
    oppLive,
    myPlayed: mine.played,
    myStarters: mine.starters,
    oppPlayed: opp.played,
    oppStarters: opp.starters,
    myStarted: mine.started > 0,
    oppStarted: opp.started > 0,
    oppName,
    myMax: final ? bestFor(myLeg) : null,
    oppMax: final ? bestFor(oppLeg) : null,
    predictedWin: oppLeg ? myLive > oppLive : null,
    // Null until every starter on both sides has played. Once it is set the
    // score is no longer a projection of anything.
    final,
  };
}

export default function Gameday() {
  const [auth, setAuth] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [matchups, setMatchups] = useState([]);
  const [view, setView] = useState("cards");
  const [updatedAt, setUpdatedAt] = useState(null);
  // Worth saying out loud now that it is not always the week you would assume:
  // on a Tuesday this is the week that just finished.
  const [shownWeek, setShownWeek] = useState(null);
  // The week being looked at, when it is not simply the current one. Starts
  // from the URL so a link to a particular week still works.
  const [chosenWeek, setChosenWeek] = useState(() => pinnedWeek(window.location.search));
  const [currentWeek, setCurrentWeek] = useState(null);
  const [statuses, setStatuses] = useState({});
  // Everything the season view needs that the per-week load already knows.
  const [season, setSeason] = useState({ leagues: [], userId: null });
  // leagueId -> week -> { points, max, pct } | null when that roster did not play
  const [seasonWeeks, setSeasonWeeks] = useState({});
  const [seasonBusy, setSeasonBusy] = useState(false);
  // Which way the share-of-maximum column is coloured. A toggle rather than a
  // decision, because the two read differently enough to be worth comparing on
  // real numbers.
  const [pctStyle, setPctStyle] = useState("wash");
  // Off by default: most visits are not during a game, and polling a dozen
  // leagues for a number that cannot change is pure waste.
  const [pollEnabled, setPollEnabled] = useState(false);
  const [gamesLive, setGamesLive] = useState(null);
  const weekRef = useRef(null);
  const positionsRef = useRef({});
  // Projections change with news rather than with play, so they are fetched once
  // and reused by every poll.
  const projectionsRef = useRef(null);

  const load = useCallback(async (auth, signal, { showSpinner }) => {
    if (showSpinner) setLoading(true);
    try {
      const userId = await resolveUserId(auth, signal);

      const [leagues, state] = await Promise.all([
        fetch(`https://api.sleeper.app/v1/user/${userId}/leagues/nfl/${SEASON}`, { signal })
          .then((r) => r.json()),
        fetch("https://api.sleeper.app/v1/state/nfl", { signal }).then((r) => r.json()),
      ]);

      // Sleeper's `week` is the week whose games come next, and it advances the
      // moment Monday night ends — so following it alone loses the result being
      // watched. weekToShow keeps that week up through Tuesday.
      const upcoming = state?.week || 1;
      // ?week= wins, for looking back at a finished week — the max-lineup
      // figures only appear once every game is over, and midweek there is
      // nothing finished to look at.
      const games = await fetchSchedule(signal);
      const live = weekToShow({
        week: upcoming,
        displayWeek: state?.display_week,
        upcomingWeekHasStarted: anyGameStarted(games, upcoming),
      });
      const week = chosenWeek ?? live;
      weekRef.current = week;
      setShownWeek(week);
      setCurrentWeek(live);
      setStatuses(weekStatuses(games));
      const playable = Array.isArray(leagues)
        ? leagues.filter((l) => {
            const t = l.settings?.type;
            return (t === 0 || t === 2) && l.settings?.best_ball !== 1;
          })
        : [];
      // Leagues the user has switched off in Settings.
      const filtered = visibleLeagues(playable, loadHiddenLeagues());

      if (filtered.length === 0) {
        setMatchups([]);
        setError(null);
        return;
      }

      // One request for the whole week, shared by every league.
      setSeason({
        userId,
        leagues: filtered.map((l) => ({
          leagueId: l.league_id,
          leagueName: l.name,
          rosterPositions: l.roster_positions || [],
        })),
      });

      // Whether the week being shown is over, which is what makes its scores
      // safe to keep.
      const weekIsFinal = weekStatuses(games)[week] === "done";

      const gameClocks = await fetchGameClocks(week, auth.token, signal);

      // Keyed by week. Fetched once per week rather than once per page: these
      // are week-specific, and before the week could be changed the distinction
      // did not exist. Landing on a past week and then switching to the live
      // one would otherwise price it with the wrong week's projections.
      if (projectionsRef.current?.week !== week) {
        const rows = await fetch(
          `https://api.sleeper.com/projections/nfl/${SEASON}/${week}?season_type=regular&${PROJECTION_POSITIONS}`,
          { signal }
        ).then((r) => r.json());
        const byPlayer = {};
        const positions = {};
        for (const row of Array.isArray(rows) ? rows : []) {
          const id = String(row.player_id);
          byPlayer[id] = row.stats || {};
          // Carried on the same rows and previously thrown away. Needed to know
          // which slots a player could have filled.
          const fp = row.player?.fantasy_positions;
          const single = row.player?.position;
          positions[id] = fp?.length ? fp : single ? [single] : [];
        }
        projectionsRef.current = { week, byPlayer };
        // Positions do not change from week to week, so these accumulate.
        positionsRef.current = { ...positionsRef.current, ...positions };
      }

      const results = await Promise.all(
        filtered.map(async (league) => {
          const leagueType = league.settings?.type === 2 ? "Dynasty" : "Redraft";
          const base = { leagueName: league.name, leagueType, leagueId: league.league_id };
          try {
            // A finished week never changes, so it is only ever fetched once
            // per tab. The pairing still comes from GraphQL: it carries the
            // projections and the opponent's name, neither of which is in the
            // scores payload.
            const cached = weekIsFinal ? readFinalWeek(league.league_id, week) : null;
            const [gqlData, weekMatchups] = await Promise.all([
              fetchLeagueMatchup(league.league_id, auth.token, signal, week),
              cached ??
                fetch(
                  `https://api.sleeper.app/v1/league/${league.league_id}/matchups/${week}`,
                  { signal }
                ).then((r) => r.json()),
            ]);
            if (!cached) {
              writeFinalWeek(league.league_id, week, weekMatchups, { isFinal: weekIsFinal });
            }

            const playerPoints = {};
            const squadByRoster = {};
            for (const m of Array.isArray(weekMatchups) ? weekMatchups : []) {
              Object.assign(playerPoints, m.players_points || {});
              // The week's roster as it stood, bench included — a snapshot, not
              // today's squad, so a past week is right too.
              squadByRoster[m.roster_id] = m.players || [];
            }

            // Already fetched for the matchup, and the season view would
            // otherwise spend a request per league rediscovering it.
            const mineHere = (gqlData?.league_rosters || []).find(
              (r) => r.owner_id === userId
            );
            if (mineHere) rosterIdRef.current[league.league_id] = mineHere.roster_id;

            const matchup = buildMatchupResult(gqlData, userId, {
              scoring: league.scoring_settings,
              projections: projectionsRef.current.byPlayer,
              playerPoints,
              gameClocks,
              squadByRoster,
              rosterPositions: league.roster_positions,
              positionsOf: (id) => positionsRef.current[id] || [],
            });
            return { ...base, matchup };
          } catch {
            return { ...base, leagueType: "", matchup: null };
          }
        })
      );

      setMatchups(results);
      setUpdatedAt(new Date());
      setError(null);
    } catch (e) {
      if (e.name !== "AbortError") setError("Failed to load matchup data.");
    } finally {
      if (!signal.aborted && showSpinner) setLoading(false);
    }
  }, [chosenWeek]);

  useEffect(() => {
    const a = getAuth();
    setAuth(a);
    if (!a) return;

    setError(null);
    const controller = new AbortController();
    load(a, controller.signal, { showSpinner: true });

    return () => controller.abort();
  }, [load]);

  // Refreshing is opt-in, only while the tab is being looked at, and only while
  // a game is actually being played. A backgrounded tab left open overnight
  // should cost nothing.
  useEffect(() => {
    if (!auth || !pollEnabled) return undefined;

    const controller = new AbortController();
    let cancelled = false;

    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const [games, state] = await Promise.all([
          fetchSchedule(controller.signal),
          fetch("https://api.sleeper.app/v1/state/nfl", { signal: controller.signal }).then(
            (r) => r.json()
          ),
        ]);
        if (cancelled) return;

        const live = anyGameInProgress(games, weekRef.current || 1);
        setGamesLive(live);

        // The week rolls over on a Tuesday morning, when nothing is live — so a
        // reload gated purely on live games would never see it and a tab left
        // open would sit on the old week for good. Checking costs two small
        // requests; reloading a dozen leagues only happens when it changed.
        const upcoming = state?.week || 1;
        const shouldShow = weekToShow({
          week: upcoming,
          displayWeek: state?.display_week,
          upcomingWeekHasStarted: anyGameStarted(games, upcoming),
        });

        // A pinned week is not stale, it is chosen — comparing it against the
        // real one would reload on every tick, for ever.
        // A week chosen on purpose is not stale — comparing it against the
        // live one would reload on every tick, for ever.
        const weekChanged = chosenWeek == null && shouldShow !== weekRef.current;
        if (live || weekChanged) {
          await load(auth, controller.signal, { showSpinner: false });
        }
      } catch (e) {
        if (e.name !== "AbortError") setGamesLive(null);
      }
    };

    tick();
    const timer = setInterval(tick, LIVE_POLL_MS);
    // Coming back to the tab should show current numbers immediately rather than
    // whatever was true when it was last in front.
    const onVisibility = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [auth, pollEnabled, load, chosenWeek]);

  // roster_id for this user in a league. Stable all season, so it is asked for
  // once per league per tab.
  const rosterIdRef = useRef({});

  const myRosterId = useCallback(async (leagueId, userId, signal) => {
    if (rosterIdRef.current[leagueId] !== undefined) return rosterIdRef.current[leagueId];
    const rosters = await fetch(
      `https://api.sleeper.app/v1/league/${leagueId}/rosters`,
      { signal }
    ).then((r) => r.json());
    const mine = (Array.isArray(rosters) ? rosters : []).find((r) => r.owner_id === userId);
    rosterIdRef.current[leagueId] = mine?.roster_id ?? null;
    return rosterIdRef.current[leagueId];
  }, []);

  /** Load one finished week for one league. Nothing if it is already there. */
  const loadSeasonWeek = useCallback(
    async (league, week) => {
      const rosterId = await myRosterId(league.leagueId, season.userId);
      if (rosterId == null) return;

      const cached = readFinalWeek(league.leagueId, week);
      const rows =
        cached ??
        (await fetch(
          `https://api.sleeper.app/v1/league/${league.leagueId}/matchups/${week}`
        ).then((r) => r.json()));
      if (!cached) writeFinalWeek(league.leagueId, week, rows, { isFinal: true });

      const summary = summariseWeek({
        rows,
        rosterId,
        rosterPositions: league.rosterPositions,
        positionsOf: (id) => positionsRef.current[id] || [],
      });

      setSeasonWeeks((prev) => ({
        ...prev,
        [league.leagueId]: { ...(prev[league.leagueId] || {}), [week]: summary },
      }));
    },
    [myRosterId, season.userId]
  );

  const loadEverything = useCallback(async () => {
    setSeasonBusy(true);
    try {
      // One league at a time rather than all at once: a manager with sixty of
      // them should not open sixty connections because they pressed a button.
      for (const league of season.leagues) {
        const weeks = missingWeeks(statuses, seasonWeeks[league.leagueId] || {});
        for (const week of weeks) {
          // eslint-disable-next-line no-await-in-loop
          await loadSeasonWeek(league, week);
        }
      }
    } finally {
      setSeasonBusy(false);
    }
  }, [season.leagues, statuses, seasonWeeks, loadSeasonWeek]);

  // Weeks already in the cache, because they were looked at in another view,
  // are filled in without asking the network for anything. Without this a week
  // just viewed still reads "not loaded", which is true of the table and a lie
  // about the data.
  useEffect(() => {
    const finished = Object.keys(statuses)
      .map(Number)
      .filter((w) => statuses[w] === "done");
    if (season.leagues.length === 0 || finished.length === 0) return;

    setSeasonWeeks((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const league of season.leagues) {
        const rosterId = rosterIdRef.current[league.leagueId];
        if (rosterId == null) continue;
        for (const week of finished) {
          if (next[league.leagueId]?.[week] !== undefined) continue;
          const rows = readFinalWeek(league.leagueId, week);
          if (!rows) continue;
          next[league.leagueId] = {
            ...(next[league.leagueId] || {}),
            [week]: summariseWeek({
              rows,
              rosterId,
              rosterPositions: league.rosterPositions,
              positionsOf: (id) => positionsRef.current[id] || [],
            }),
          };
          changed = true;
        }
      }
      // The same object back when there was nothing to add, so this does not
      // re-trigger itself.
      return changed ? next : prev;
    });
  }, [season.leagues, statuses, matchups]);

  if (!auth) {
    return (
      <div className="gameday-container">
        <div className="gameday-login-required">
          <h2>Gameday</h2>
          <p>You must be logged in to view your weekly matchups.</p>
          <p>
            Head to <strong>Settings</strong> to log in with your Sleeper account.
          </p>
        </div>
      </div>
    );
  }

  const dynasty = matchups.filter((m) => m.leagueType === "Dynasty");
  const redraft = matchups.filter((m) => m.leagueType === "Redraft");

  const validMatchups = matchups.filter(
    (m) => m.matchup !== null && m.matchup?.predictedWin !== null
  );
  const wins = validMatchups.filter((m) => m.matchup.predictedWin).length;
  const losses = validMatchups.filter((m) => !m.matchup.predictedWin).length;

  // One bar, eighteen parts. Weeks that have not happened are flat and
  // unclickable rather than hidden, so the shape of the season stays visible.
  const chooseWeek = (week) => {
    // Null rather than the number when it is the current week, so the page goes
    // back to following the rollover on its own instead of pinning to whatever
    // was current when it was clicked.
    const next = week === currentWeek ? null : week;
    setChosenWeek(next);
    // Kept in the address bar so the view can be linked to or reloaded, but
    // without a history entry per click.
    const url = next ? `${window.location.pathname}?week=${next}` : window.location.pathname;
    window.history.replaceState(null, "", url);
  };

  // W-L across the weeks that have been loaded. Ties only appear if one
  // happened, since a trailing "-0" on every row is noise.
  const record = (loaded, weeks) => {
    let w = 0;
    let l = 0;
    let t = 0;
    for (const week of weeks) {
      const r = loaded[week]?.result;
      if (r === "W") w += 1;
      else if (r === "L") l += 1;
      else if (r === "T") t += 1;
    }
    if (w + l + t === 0) return "—";
    return t > 0 ? `${w}-${l}-${t}` : `${w}-${l}`;
  };

  // Every league at once, two or three across depending on the width. A week
  // that has not been loaded says so and loads on click, because fetching a
  // season for sixty leagues without being asked would be rude.
  function renderSeason() {
    const finished = Object.keys(statuses)
      .map(Number)
      .filter((w) => statuses[w] === "done")
      .sort((a, b) => a - b);

    if (season.leagues.length === 0) return null;
    const outstanding = season.leagues.reduce(
      (n, l) => n + missingWeeks(statuses, seasonWeeks[l.leagueId] || {}).length,
      0
    );

    return (
      <>
        <div className="gameday-season-bar">
          <span className="gameday-season-note">
            {finished.length === 0
              ? "No finished weeks yet."
              : outstanding === 0
              ? `${finished.length} finished ${finished.length === 1 ? "week" : "weeks"}, all loaded.`
              : `${outstanding} of ${season.leagues.length * finished.length} not loaded.`}
          </span>
          <div className="gameday-season-actions">
            <span className="gameday-season-toggle">
              {["wash", "text"].map((style) => (
                <button
                  key={style}
                  type="button"
                  className={`gameday-pill${pctStyle === style ? " active" : ""}`}
                  onClick={() => setPctStyle(style)}
                  title={
                    style === "wash"
                      ? "Shade the percentage cell"
                      : "Colour the percentage itself, as the matchup ranks are"
                  }
                >
                  {style === "wash" ? "Shaded" : "Coloured"}
                </button>
              ))}
            </span>
            {outstanding > 0 && (
            <button
              type="button"
              className="gameday-load-all"
              onClick={loadEverything}
              disabled={seasonBusy}
            >
              {seasonBusy ? "Loading…" : `Load all (${outstanding})`}
            </button>
            )}
          </div>
        </div>

        <div className="gameday-season-grid">
          {season.leagues.map((league) => {
            const loaded = seasonWeeks[league.leagueId] || {};
            const totals = summariseSeason(finished.map((w) => loaded[w]));
            return (
              <section className="gameday-season-card" key={league.leagueId}>
                <h3 className="gameday-season-title">{league.leagueName}</h3>
                <table className={`gameday-season-table pct-as-${pctStyle}`}>
                  <thead>
                    <tr>
                      <th>Wk</th>
                      <th className="mid">W/L</th>
                      <th className="num">Points</th>
                      <th className="num">Max</th>
                      <th className="num">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {finished.map((w) => {
                      const cell = loaded[w];
                      if (cell === undefined) {
                        return (
                          <tr key={w} className="is-unloaded">
                            <td>{w}</td>
                            <td colSpan={4}>
                              <button
                                type="button"
                                className="gameday-load-week"
                                onClick={() => loadSeasonWeek(league, w)}
                              >
                                not loaded
                              </button>
                            </td>
                          </tr>
                        );
                      }
                      if (cell === null) {
                        return (
                          <tr key={w} className="is-empty">
                            <td>{w}</td>
                            <td colSpan={4}>did not play</td>
                          </tr>
                        );
                      }
                      return (
                        <tr key={w}>
                          <td>{w}</td>
                          <td className={`mid wl-${cell.result || "none"}`}>
                            {cell.result || "—"}
                          </td>
                          <td className="num">{cell.points.toFixed(2)}</td>
                          <td className="num">{cell.max == null ? "—" : cell.max.toFixed(2)}</td>
                          <td className={`num pct pct-${pctTone(cell.pct)}`}>
                            {cell.pct == null ? "—" : `${cell.pct.toFixed(1)}%`}
                          </td>
                        </tr>
                      );
                    })}
                    {totals && (
                      <tr className="gameday-season-total">
                        <td>Avg</td>
                        <td className="mid">{record(loaded, finished)}</td>
                        <td className="num">{totals.points.toFixed(2)}</td>
                        <td className="num">{totals.max == null ? "—" : totals.max.toFixed(2)}</td>
                        <td className={`num pct pct-${pctTone(totals.pct)}`}>
                          {totals.pct == null ? "—" : `${totals.pct.toFixed(1)}%`}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </section>
            );
          })}
        </div>
      </>
    );
  }

  function renderWeekPicker() {
    if (!currentWeek) return null;
    return (
      <div className="gameday-weeks" role="group" aria-label="Week">
        {Array.from({ length: 18 }, (_, i) => i + 1).map((w) => {
          const status = statuses[w] || "upcoming";
          const selectable = weekIsSelectable(status, w, currentWeek);
          const shown = w === shownWeek;
          return (
            <button
              key={w}
              type="button"
              className={`gameday-week${shown ? " is-shown" : ""}${
                w === currentWeek ? " is-current" : ""
              } is-${status}`}
              disabled={!selectable}
              aria-current={shown ? "true" : undefined}
              title={
                selectable
                  ? `Week ${w}${status === "done" ? " — final" : status === "live" ? " — in progress" : ""}`
                  : `Week ${w} has not been played`
              }
              onClick={() => chooseWeek(w)}
            >
              {w}
            </button>
          );
        })}
      </div>
    );
  }

  function renderCards(group) {
    return (
      <div className="gameday-leagues-grid">
        {group.map(({ leagueName, matchup }, i) => (
          <div
            key={i}
            className={`gameday-card${matchup?.final ? ` gameday-final-${matchup.final}` : ""}`}
          >
            <div className="gameday-card-title">{leagueName}</div>
            {!matchup ? (
              <div className="gameday-no-matchup">No matchup data</div>
            ) : matchup.predictedWin === null ? (
              <div className="gameday-no-matchup">Bye week</div>
            ) : (
              <div className="gameday-matchup">
                <div className={`gameday-score ${matchup.predictedWin ? "win" : "loss"}`}>
                  <div className="gameday-score-value">{matchup.myLive.toFixed(2)}</div>
                  {matchup.myStarted && (
                    <div className="gameday-score-initial" title="Projection before kickoff">
                      from {matchup.myProj.toFixed(2)}
                    </div>
                  )}
                  {matchup.myMax != null && (
                    <div
                      className="gameday-score-max"
                      title={`Best lineup available: ${matchup.myMax.toFixed(
                        2
                      )} — ${(matchup.myMax - matchup.myLive).toFixed(2)} left on the bench`}
                    >
                      max {matchup.myMax.toFixed(2)}
                    </div>
                  )}
                  <div className="gameday-score-label">
                    You{matchup.myStarters > 0 && ` · ${matchup.myPlayed}/${matchup.myStarters}`}
                  </div>
                </div>
                <div className="gameday-vs">vs</div>
                <div className="gameday-score opponent">
                  <div className="gameday-score-value">{matchup.oppLive.toFixed(2)}</div>
                  {matchup.oppStarted && (
                    <div className="gameday-score-initial" title="Projection before kickoff">
                      from {matchup.oppProj.toFixed(2)}
                    </div>
                  )}
                  {matchup.oppMax != null && (
                    <div
                      className="gameday-score-max"
                      title={`Best lineup available: ${matchup.oppMax.toFixed(
                        2
                      )} — ${(matchup.oppMax - matchup.oppLive).toFixed(2)} left on the bench`}
                    >
                      max {matchup.oppMax.toFixed(2)}
                    </div>
                  )}
                  <div className="gameday-score-label">
                    {matchup.oppName}
                    {matchup.oppStarters > 0 && ` · ${matchup.oppPlayed}/${matchup.oppStarters}`}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  function renderList(group) {
    return (
      <div className="gameday-list">
        <div className="gameday-list-grid">
          <div className="gameday-list-header">League</div>
          <div className="gameday-list-header">My Proj</div>
          <div className="gameday-list-header">Opp Proj</div>
          <div className="gameday-list-header">Played</div>
          <div className="gameday-list-header">Opponent</div>
          <div className="gameday-list-header">Result</div>
        </div>
        {group.map(({ leagueName, leagueId, matchup }, i) => (
          <div
            key={i}
            className={`gameday-list-grid gameday-list-row${
              matchup?.final ? ` gameday-final-${matchup.final}` : ""
            }`}
          >
            <div className="gameday-list-item gameday-list-name">
              <a
                href={`https://sleeper.app/leagues/${leagueId}`}
                target="_blank"
                rel="noreferrer"
                className="gameday-league-link"
              >
                {leagueName}
              </a>
            </div>
            {!matchup || matchup.predictedWin === null ? (
              <div className="gameday-list-item gameday-no-matchup" style={{ gridColumn: "span 5" }}>
                {!matchup ? "No data" : "Bye week"}
              </div>
            ) : (
              <>
                <div className={`gameday-list-item gameday-list-proj ${matchup.predictedWin ? "win" : "loss"}`}>
                  {matchup.myLive.toFixed(2)}
                  {matchup.myStarted && (
                    <span className="gameday-score-initial"> from {matchup.myProj.toFixed(2)}</span>
                  )}
                  {matchup.myMax != null && (
                    <span className="gameday-score-max" title="Best lineup available">
                      {" "}
                      max {matchup.myMax.toFixed(2)}
                    </span>
                  )}
                </div>
                <div className="gameday-list-item">
                  {matchup.oppLive.toFixed(2)}
                  {matchup.oppStarted && (
                    <span className="gameday-score-initial"> from {matchup.oppProj.toFixed(2)}</span>
                  )}
                  {matchup.oppMax != null && (
                    <span className="gameday-score-max" title="Best lineup available">
                      {" "}
                      max {matchup.oppMax.toFixed(2)}
                    </span>
                  )}
                </div>
                <div className="gameday-list-item gameday-list-played">
                  {matchup.myStarters > 0 ? `${matchup.myPlayed}/${matchup.myStarters}` : "—"}
                </div>
                <div className="gameday-list-item">{matchup.oppName}</div>
                <div
                  className={`gameday-list-item ${
                    matchup.predictedWin ? "gameday-win-label" : "gameday-loss-label"
                  }`}
                  title={matchup.final ? "Final" : "Projected"}
                >
                  {matchup.final === "tie" ? "T" : matchup.predictedWin ? "W" : "L"}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="gameday-container">
      {view !== "season" && renderWeekPicker()}
      <div className="gameday-header">
        <div className="gameday-header-left">
          <h2 className="gameday-title">Gameday</h2>
          {!loading && matchups.length > 0 && (
            <div className="gameday-summary">
              {shownWeek ? `Week ${shownWeek} predictions` : "Weekly Predictions"} —{" "}
              {chosenWeek != null && chosenWeek !== currentWeek && (
                <span className="gameday-pinned">past week · </span>
              )}
              <span className="gameday-wins">{wins}W</span>
              {" / "}
              <span className="gameday-losses">{losses}L</span>
              {updatedAt && (
                <span className="gameday-updated">
                  {" · updated "}
                  {updatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  {pollEnabled && gamesLive === false && " · no games in progress"}
                  {pollEnabled && gamesLive === true && " · live"}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="gameday-view-toggle">
          <label
            className="gameday-live-toggle"
            title="Refresh every minute while a game is being played. Paused when this tab is in the background."
          >
            <input
              type="checkbox"
              checked={pollEnabled}
              onChange={(e) => setPollEnabled(e.target.checked)}
            />
            Auto-refresh
          </label>
          <button
            className={`gameday-pill${view === "cards" ? " active" : ""}`}
            onClick={() => setView("cards")}
          >
            Cards
          </button>
          <button
            className={`gameday-pill${view === "list" ? " active" : ""}`}
            onClick={() => setView("list")}
          >
            List
          </button>
          <button
            className={`gameday-pill${view === "season" ? " active" : ""}`}
            onClick={() => setView("season")}
          >
            Season
          </button>
        </div>
      </div>

      {loading && <div className="gameday-loading">Loading matchups…</div>}
      {error && <div className="gameday-error">{error}</div>}

      {!loading && view === "season" && renderSeason()}

      {!loading && view !== "season" && (
        <>
          {dynasty.length > 0 && (
            <div className="gameday-section">
              <h3 className="gameday-section-title">Dynasty</h3>
              {view === "cards" ? renderCards(dynasty) : renderList(dynasty)}
            </div>
          )}
          {redraft.length > 0 && (
            <div className="gameday-section">
              <h3 className="gameday-section-title">Redraft</h3>
              {view === "cards" ? renderCards(redraft) : renderList(redraft)}
            </div>
          )}
        </>
      )}
    </div>
  );
}

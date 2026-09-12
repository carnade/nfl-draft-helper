import React, { useCallback, useEffect, useRef, useState } from "react";
import "./Gameday.css";

const SEASON = 2026;
// Projections for every player would be 5.4 MB; restricting to the positions that
// can start brings it under 2 MB, and it is fetched once per visit.
const PROJECTION_POSITIONS = ["QB", "RB", "WR", "TE", "K", "DEF"]
  .map((p) => `position[]=${p}`)
  .join("&");
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

// Whether any game in this week has actually kicked off and not yet finished.
// 27 KB for the season, so it is a cheap thing to ask before deciding to refresh
// a dozen leagues.
async function anyGameInProgress(week, signal) {
  const games = await fetch(
    `https://api.sleeper.app/schedule/nfl/regular/${SEASON}`,
    { signal }
  ).then((r) => r.json());
  return (Array.isArray(games) ? games : []).some(
    (g) => g.week === week && !IDLE_GAME_STATUSES.has(g.status)
  );
}

// Sleeper's proj_points is the pre-week projection and does not move once games
// start, which is why it drifts from the number Sleeper's own app shows. That
// number is the same sum with played starters swapped for what they actually
// scored, so compute it the same way: projected stats priced by this league's
// scoring settings, replaced by real points as they come in.
function projectedPoints(stats, scoring) {
  if (!stats || !scoring) return 0;
  let total = 0;
  for (const [stat, value] of Object.entries(stats)) {
    const multiplier = scoring[stat];
    if (typeof value === "number" && typeof multiplier === "number") {
      total += value * multiplier;
    }
  }
  return total;
}

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

async function fetchLeagueMatchup(leagueId, token, signal) {
  const query = `query get_league_detail {
    league_rosters(league_id: "${leagueId}"){
      league_id owner_id roster_id
    }
    league_users(league_id: "${leagueId}"){
      user_id display_name
    }
    matchup_legs_1:matchup_legs(league_id: "${leagueId}", round: 1){
      matchup_id roster_id points proj_points starters
    }
    matchup_legs_0:matchup_legs(league_id: "${leagueId}", round: 0){
      matchup_id roster_id points proj_points starters
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

function buildMatchupResult(gqlData, userId, { scoring, projections, playerPoints }) {
  const rosters = gqlData.league_rosters || [];
  const users = gqlData.league_users || [];
  const legs1 = gqlData.matchup_legs_1 || [];
  const legs0 = gqlData.matchup_legs_0 || [];
  const legs = legs1.length > 0 ? legs1 : legs0;

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

  // A starter with points on the board has played; everyone else is still worth
  // their projection.
  //
  // Rebuild the side from its starters: real points where they exist, projection
  // everywhere else. This reproduces Sleeper's own live figure exactly in the
  // leagues we could check it against.
  //
  // A side with nobody played is left on Sleeper's proj_points rather than this
  // sum. The two agree to within a couple of hundredths — our pricing of
  // projected stats is a hair off in some scoring formats — and showing a number
  // that differs from Sleeper's before a ball has been kicked is not worth it.
  function legTotals(leg) {
    const starters = leg?.starters || [];
    let live = 0;
    let played = 0;
    for (const playerId of starters) {
      const actual = playerPoints[playerId];
      if (typeof actual === "number" && actual !== 0) {
        live += actual;
        played += 1;
      } else {
        live += projectedPoints(projections[playerId], scoring);
      }
    }
    return { live, played, starters: starters.length };
  }

  const mine = legTotals(myLeg);
  const opp = legTotals(oppLeg);

  return {
    myProj,
    oppProj,
    // Each side stands on its own: a side with nobody played is still just its
    // projection, whatever the other side has done.
    myLive: mine.played > 0 ? mine.live : myProj,
    oppLive: opp.played > 0 ? opp.live : oppProj,
    myPlayed: mine.played,
    myStarters: mine.starters,
    oppPlayed: opp.played,
    oppStarters: opp.starters,
    myStarted: mine.played > 0,
    oppStarted: opp.played > 0,
    oppName,
    predictedWin: oppLeg
      ? (mine.played > 0 ? mine.live : myProj) > (opp.played > 0 ? opp.live : oppProj)
      : null,
  };
}

export default function Gameday() {
  const [auth, setAuth] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [matchups, setMatchups] = useState([]);
  const [view, setView] = useState("cards");
  const [updatedAt, setUpdatedAt] = useState(null);
  // Off by default: most visits are not during a game, and polling a dozen
  // leagues for a number that cannot change is pure waste.
  const [pollEnabled, setPollEnabled] = useState(false);
  const [gamesLive, setGamesLive] = useState(null);
  const weekRef = useRef(null);
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

      const week = state?.week || 1;
      weekRef.current = week;
      const filtered = Array.isArray(leagues)
        ? leagues.filter((l) => {
            const t = l.settings?.type;
            return (t === 0 || t === 2) && l.settings?.best_ball !== 1;
          })
        : [];

      if (filtered.length === 0) {
        setMatchups([]);
        setError(null);
        return;
      }

      if (!projectionsRef.current) {
        const rows = await fetch(
          `https://api.sleeper.com/projections/nfl/${SEASON}/${week}?season_type=regular&${PROJECTION_POSITIONS}`,
          { signal }
        ).then((r) => r.json());
        const byPlayer = {};
        for (const row of Array.isArray(rows) ? rows : []) {
          byPlayer[String(row.player_id)] = row.stats || {};
        }
        projectionsRef.current = byPlayer;
      }

      const results = await Promise.all(
        filtered.map(async (league) => {
          const leagueType = league.settings?.type === 2 ? "Dynasty" : "Redraft";
          const base = { leagueName: league.name, leagueType, leagueId: league.league_id };
          try {
            const [gqlData, weekMatchups] = await Promise.all([
              fetchLeagueMatchup(league.league_id, auth.token, signal),
              fetch(`https://api.sleeper.app/v1/league/${league.league_id}/matchups/${week}`, { signal })
                .then((r) => r.json()),
            ]);

            const playerPoints = {};
            for (const m of Array.isArray(weekMatchups) ? weekMatchups : []) {
              Object.assign(playerPoints, m.players_points || {});
            }

            const matchup = buildMatchupResult(gqlData, userId, {
              scoring: league.scoring_settings,
              projections: projectionsRef.current,
              playerPoints,
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
  }, []);

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
        const live = await anyGameInProgress(weekRef.current || 1, controller.signal);
        if (cancelled) return;
        setGamesLive(live);
        if (live) await load(auth, controller.signal, { showSpinner: false });
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
  }, [auth, pollEnabled, load]);

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

  function renderCards(group) {
    return (
      <div className="gameday-leagues-grid">
        {group.map(({ leagueName, matchup }, i) => (
          <div key={i} className="gameday-card">
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
          <div key={i} className="gameday-list-grid gameday-list-row">
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
                </div>
                <div className="gameday-list-item">
                  {matchup.oppLive.toFixed(2)}
                  {matchup.oppStarted && (
                    <span className="gameday-score-initial"> from {matchup.oppProj.toFixed(2)}</span>
                  )}
                </div>
                <div className="gameday-list-item gameday-list-played">
                  {matchup.myStarters > 0 ? `${matchup.myPlayed}/${matchup.myStarters}` : "—"}
                </div>
                <div className="gameday-list-item">{matchup.oppName}</div>
                <div className={`gameday-list-item ${matchup.predictedWin ? "gameday-win-label" : "gameday-loss-label"}`}>
                  {matchup.predictedWin ? "W" : "L"}
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
      <div className="gameday-header">
        <div className="gameday-header-left">
          <h2 className="gameday-title">Gameday</h2>
          {!loading && matchups.length > 0 && (
            <div className="gameday-summary">
              Weekly Predictions —{" "}
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
        </div>
      </div>

      {loading && <div className="gameday-loading">Loading matchups…</div>}
      {error && <div className="gameday-error">{error}</div>}

      {!loading && (
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

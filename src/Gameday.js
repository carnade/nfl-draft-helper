import React, { useEffect, useState } from "react";
import "./Gameday.css";

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
      matchup_id roster_id points proj_points
    }
    matchup_legs_0:matchup_legs(league_id: "${leagueId}", round: 0){
      matchup_id roster_id points proj_points
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

function buildMatchupResult(gqlData, userId) {
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

  return {
    myProj,
    oppProj,
    oppName,
    predictedWin: oppLeg ? myProj > oppProj : null,
  };
}

export default function Gameday() {
  const [auth, setAuth] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [matchups, setMatchups] = useState([]);
  const [view, setView] = useState("cards");

  useEffect(() => {
    const a = getAuth();
    setAuth(a);
    if (!a) return;

    setLoading(true);
    setError(null);

    const controller = new AbortController();
    const { signal } = controller;

    (async () => {
      try {
        const userId = await resolveUserId(a, signal);

        const leaguesRes = await fetch(
          `https://api.sleeper.app/v1/user/${userId}/leagues/nfl/2026`,
          { signal }
        );
        const leagues = await leaguesRes.json();
        const filtered = Array.isArray(leagues)
          ? leagues.filter((l) => {
              const t = l.settings?.type;
              return (t === 0 || t === 2) && l.settings?.best_ball !== 1;
            })
          : [];

        if (filtered.length === 0) {
          setMatchups([]);
          return;
        }

        const results = await Promise.all(
          filtered.map(async (league) => {
            try {
              const gqlData = await fetchLeagueMatchup(league.league_id, a.token, signal);
              const matchup = buildMatchupResult(gqlData, userId);
              const leagueType = league.settings?.type === 2 ? "Dynasty" : "Redraft";
              return { leagueName: league.name, leagueType, leagueId: league.league_id, matchup };
            } catch {
              return { leagueName: league.name, leagueType: "", leagueId: league.league_id, matchup: null };
            }
          })
        );

        setMatchups(results);
      } catch (e) {
        if (e.name !== "AbortError") setError("Failed to load matchup data.");
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, []);

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
                  <div className="gameday-score-value">{matchup.myProj.toFixed(2)}</div>
                  <div className="gameday-score-label">You</div>
                </div>
                <div className="gameday-vs">vs</div>
                <div className="gameday-score opponent">
                  <div className="gameday-score-value">{matchup.oppProj.toFixed(2)}</div>
                  <div className="gameday-score-label">{matchup.oppName}</div>
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
              <div className="gameday-list-item gameday-no-matchup" style={{ gridColumn: "span 4" }}>
                {!matchup ? "No data" : "Bye week"}
              </div>
            ) : (
              <>
                <div className={`gameday-list-item gameday-list-proj ${matchup.predictedWin ? "win" : "loss"}`}>
                  {matchup.myProj.toFixed(2)}
                </div>
                <div className="gameday-list-item">{matchup.oppProj.toFixed(2)}</div>
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
            </div>
          )}
        </div>
        <div className="gameday-view-toggle">
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

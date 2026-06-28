import React, { useState, useEffect, useCallback } from "react";
import "./Stats.css";

const mock = process.env.REACT_APP_MOCK === "true";
const BASE_URL = mock
  ? "http://localhost:5000"
  : "https://shaggy-latashia-carnade-2ea2054a.koyeb.app";

const POSITIONS = ["ALL", "QB", "RB", "WR", "TE"];

const TEAM_COLORS = {
  ARI: "#97233F", ATL: "#A71930", BAL: "#241773", BUF: "#00338D",
  CAR: "#0085CA", CHI: "#0B162A", CIN: "#FB4F14", CLE: "#311D00",
  DAL: "#003594", DEN: "#FB4F14", DET: "#0076B6", GB:  "#203731",
  HOU: "#03202F", IND: "#002C5F", JAX: "#006778", KC:  "#E31837",
  LAC: "#0080C6", LAR: "#003594", LV:  "#000000", MIA: "#008E97",
  MIN: "#4F2683", NE:  "#002244", NO:  "#D3BC8D", NYG: "#0B2265",
  NYJ: "#125740", PHI: "#004C54", PIT: "#FFB612", SEA: "#002244",
  SF:  "#AA0000", TB:  "#D50A0A", TEN: "#4B92DB", WAS: "#5A1414",
};

function TeamBadge({ team }) {
  const color = TEAM_COLORS[team] || "#555";
  return (
    <span className="team-badge" style={{ backgroundColor: color }}>
      {team}
    </span>
  );
}

function fmt(val, decimals = 1) {
  if (val == null || val === "" || isNaN(val)) return "—";
  return Number(val).toFixed(decimals);
}
function fmtPct(val) {
  if (val == null || isNaN(val)) return "—";
  return (val * 100).toFixed(0) + "%";
}
function fmtDiff(val) {
  if (val == null || isNaN(val)) return "—";
  const n = Number(val).toFixed(1);
  return val >= 0 ? `+${n}` : `${n}`;
}

function rankClass(rank) {
  if (rank == null) return "";
  if (rank <= 10) return "rank-easy";
  if (rank >= 23) return "rank-hard";
  return "";
}

function SortHeader({ label, sortKey, sortConfig, onSort, className, title }) {
  const active = sortConfig.key === sortKey;
  const arrow = active ? (sortConfig.dir === "asc" ? " ↑" : " ↓") : "";
  return (
    <th className={`stats-sortable ${className || ""}`} onClick={() => onSort(sortKey)} title={title}>
      {label}{title ? " ⓘ" : ""}{arrow}
    </th>
  );
}

function useSortedData(data, sortConfig) {
  if (!sortConfig.key) return data;
  return [...data].sort((a, b) => {
    let av = a[sortConfig.key];
    let bv = b[sortConfig.key];
    // handle nested keys like "def_rank_vs_position.season.qb"
    if (sortConfig.key.includes(".")) {
      const parts = sortConfig.key.split(".");
      av = parts.reduce((o, k) => (o ? o[k] : null), a);
      bv = parts.reduce((o, k) => (o ? o[k] : null), b);
    }
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === "string") return sortConfig.dir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    return sortConfig.dir === "asc" ? av - bv : bv - av;
  });
}

// ─── Teams Table ────────────────────────────────────────────────────────────

const TEAM_TABS = ["scoring", "offense", "defense"];

function TeamsTable({ teams, onTeamClick }) {
  const [teamTab, setTeamTab] = useState("scoring");
  const [sortConfig, setSortConfig] = useState({ key: "points_per_game", dir: "desc" });
  const sorted = useSortedData(teams, sortConfig);

  function onSort(key) {
    setSortConfig(prev =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "team" ? "asc" : "desc" }
    );
  }

  function switchTab(t) {
    setTeamTab(t);
    const defaults = { scoring: "points_per_game", offense: "fpts_per_game", defense: "def_fpts_allowed_qb_per_game" };
    setSortConfig({ key: defaults[t], dir: "desc" });
  }

  const sh = (label, key, cls) => (
    <SortHeader label={label} sortKey={key} sortConfig={sortConfig} onSort={onSort} className={cls} />
  );

  return (
    <div className="stats-table-wrap">
      <div className="stats-pos-tabs" style={{ marginBottom: 8 }}>
        {TEAM_TABS.map(t => (
          <button
            key={t}
            className={`stats-pos-tab ${teamTab === t ? "active" : ""}`}
            onClick={() => switchTab(t)}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      <table className="stats-table">
        <thead>
          <tr>
            {sh("Team", "team")}
            {teamTab === "scoring" && <>
              {sh("Pts/G", "points_per_game", "num")}
              {sh("Pts All'd/G", "points_allowed_per_game", "num")}
              {sh("Pts L3", "points_rolling3", "num")}
              {sh("Pts L5", "points_rolling5", "num")}
              {sh("All'd L3", "points_allowed_rolling3", "num")}
              {sh("All'd L5", "points_allowed_rolling5", "num")}
            </>}
            {teamTab === "offense" && <>
              {sh("FPTS/G", "fpts_per_game", "num")}
              {sh("Plays/G", "plays_per_game", "num")}
              {sh("Pass Yds/G", "passing_yards_per_game", "num")}
              {sh("Pass TDs/G", "passing_tds_per_game", "num")}
              {sh("Pass EPA/G", "passing_epa_per_game", "num")}
              {sh("Rush Yds/G", "rushing_yards_per_game", "num")}
              {sh("Rush TDs/G", "rushing_tds_per_game", "num")}
            </>}
            {teamTab === "defense" && <>
              {sh("Def QB/G", "def_fpts_allowed_qb_per_game", "num")}
              {sh("Def RB/G", "def_fpts_allowed_rb_per_game", "num")}
              {sh("Def WR/G", "def_fpts_allowed_wr_per_game", "num")}
              {sh("Def TE/G", "def_fpts_allowed_te_per_game", "num")}
              {sh("Rk QB", "def_rank_vs_position.season.qb", "num rank-col")}
              {sh("Rk RB", "def_rank_vs_position.season.rb", "num rank-col")}
              {sh("Rk WR", "def_rank_vs_position.season.wr", "num rank-col")}
              {sh("Rk TE", "def_rank_vs_position.season.te", "num rank-col")}
            </>}
            {sh("Next", "schedule.opponent")}
          </tr>
        </thead>
        <tbody>
          {sorted.map(t => {
            const rnk = t.def_rank_vs_position?.season || {};
            const sched = t.schedule;
            const nextLabel = sched
              ? `${sched.is_home ? "vs" : "@"} ${sched.opponent}`
              : "—";
            return (
              <tr key={t.team}>
                <td>
                  <button className="team-link-btn" onClick={() => onTeamClick(t.team)}>
                    <TeamBadge team={t.team} />
                  </button>
                </td>
                {teamTab === "scoring" && <>
                  <td className="num">{fmt(t.points_per_game)}</td>
                  <td className="num">{fmt(t.points_allowed_per_game)}</td>
                  <td className="num">{fmt(t.points_rolling3)}</td>
                  <td className="num">{fmt(t.points_rolling5)}</td>
                  <td className="num">{fmt(t.points_allowed_rolling3)}</td>
                  <td className="num">{fmt(t.points_allowed_rolling5)}</td>
                </>}
                {teamTab === "offense" && <>
                  <td className="num">{fmt(t.fpts_per_game)}</td>
                  <td className="num">{fmt(t.plays_per_game, 0)}</td>
                  <td className="num">{fmt(t.passing_yards_per_game)}</td>
                  <td className="num">{fmt(t.passing_tds_per_game, 2)}</td>
                  <td className="num">{fmt(t.passing_epa_per_game, 2)}</td>
                  <td className="num">{fmt(t.rushing_yards_per_game)}</td>
                  <td className="num">{fmt(t.rushing_tds_per_game, 2)}</td>
                </>}
                {teamTab === "defense" && <>
                  <td className="num">{fmt(t.def_fpts_allowed_qb_per_game)}</td>
                  <td className="num">{fmt(t.def_fpts_allowed_rb_per_game)}</td>
                  <td className="num">{fmt(t.def_fpts_allowed_wr_per_game)}</td>
                  <td className="num">{fmt(t.def_fpts_allowed_te_per_game)}</td>
                  <td className={`num rank-col ${rankClass(rnk.qb)}`}>{rnk.qb ?? "—"}</td>
                  <td className={`num rank-col ${rankClass(rnk.rb)}`}>{rnk.rb ?? "—"}</td>
                  <td className={`num rank-col ${rankClass(rnk.wr)}`}>{rnk.wr ?? "—"}</td>
                  <td className={`num rank-col ${rankClass(rnk.te)}`}>{rnk.te ?? "—"}</td>
                </>}
                <td className="next-opp">{nextLabel}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Players Table ───────────────────────────────────────────────────────────

function columnsForPosition(pos, perGame) {
  const pg = perGame ? "/G" : "";
  switch (pos) {
    case "QB":
      return [
        { label: "#",              key: "_rank",              cls: "num narrow" },
        { label: "Name",           key: "name" },
        { label: "Team",           key: "team",               cls: "team-col" },
        { label: `FPTS${pg}`,      key: "fantasy_points_ppr", cls: "num" },
        { label: `Pass Yds${pg}`,  key: "passing_yards",      cls: "num" },
        { label: `Pass TDs${pg}`,  key: "passing_tds",        cls: "num" },
        { label: `Int${pg}`,       key: "passing_interceptions", cls: "num" },
        { label: `Rush Yds${pg}`,  key: "rushing_yards",      cls: "num" },
      ];
    case "RB":
      return [
        { label: "#",              key: "_rank",              cls: "num narrow" },
        { label: "Name",           key: "name" },
        { label: "Team",           key: "team",               cls: "team-col" },
        { label: `FPTS${pg}`,      key: "fantasy_points_ppr", cls: "num" },
        { label: `Car${pg}`,       key: "carries",            cls: "num" },
        { label: `Rush Yds${pg}`,  key: "rushing_yards",      cls: "num" },
        { label: `Rush TDs${pg}`,  key: "rushing_tds",        cls: "num" },
        { label: `Tgt${pg}`,       key: "targets",            cls: "num" },
        { label: `Rec${pg}`,       key: "receptions",         cls: "num" },
        { label: `Rec Yds${pg}`,   key: "receiving_yards",    cls: "num" },
        { label: "Tgt%",           key: "target_share",       cls: "num", fmt: v => fmtPct(v), title: "Target Share — % of team targets this player received" },
      ];
    case "WR":
    case "TE":
      return [
        { label: "#",              key: "_rank",              cls: "num narrow" },
        { label: "Name",           key: "name" },
        { label: "Team",           key: "team",               cls: "team-col" },
        { label: `FPTS${pg}`,      key: "fantasy_points_ppr", cls: "num" },
        { label: `Tgt${pg}`,       key: "targets",            cls: "num" },
        { label: `Rec${pg}`,       key: "receptions",         cls: "num" },
        { label: `Rec Yds${pg}`,   key: "receiving_yards",    cls: "num" },
        { label: `Rec TDs${pg}`,   key: "receiving_tds",      cls: "num" },
        { label: "Tgt%",           key: "target_share",       cls: "num", fmt: v => fmtPct(v), title: "Target Share — % of team targets this player received" },
        { label: "AY%",            key: "air_yards_share",    cls: "num", fmt: v => fmtPct(v), title: "Air Yards Share — % of team air yards thrown to this player" },
        { label: "WOPR",           key: "wopr",               cls: "num", fmt: v => fmt(v, 2), title: "Weighted Opportunity Rating — combines target share and air yards share into one opportunity metric" },
        { label: "RACR",           key: "racr",               cls: "num", fmt: v => fmt(v, 2), title: "Receiver Air Conversion Ratio — receiving yards per air yard; measures how well a receiver converts deep targets" },
      ];
    default: // ALL
      return [
        { label: "#",              key: "_rank",              cls: "num narrow" },
        { label: "Name",           key: "name" },
        { label: "Team",           key: "team",               cls: "team-col" },
        { label: "Pos",            key: "position",           cls: "pos-col" },
        { label: `FPTS PPR${pg}`,  key: "fantasy_points_ppr",      cls: "num" },
        { label: `FPTS Half${pg}`, key: "fantasy_points_half_ppr", cls: "num" },
      ];
  }
}

// Numeric stat keys that can be divided by games_played for per-game view
const PER_GAME_KEYS = new Set([
  "fantasy_points_ppr", "fantasy_points_half_ppr", "fantasy_points", "passing_yards", "passing_tds",
  "passing_interceptions", "rushing_yards", "rushing_tds", "carries",
  "targets", "receptions", "receiving_yards", "receiving_tds",
]);

function applyPerGame(players, perGame) {
  if (!perGame) return players;
  return players.map(p => {
    const gp = p.games_played || 1;
    const patched = { ...p };
    PER_GAME_KEYS.forEach(k => {
      if (patched[k] != null) patched[k] = patched[k] / gp;
    });
    return patched;
  });
}

const ADV_COLS = [
  { label: "Snap%", key: "snap_pct_avg",    cls: "num", fmt: v => fmtPct(v) },
  { label: "xFPTS", key: "expected_fp_avg", cls: "num", fmt: v => fmt(v) },
  { label: "+/-",   key: "fp_diff_avg",     cls: "num", fmt: v => fmtDiff(v) },
];

function PlayersTable({ players, advancedData, onTeamClick, position, perGame }) {
  const [sortConfig, setSortConfig] = useState({ key: "fantasy_points_ppr", dir: "desc" });

  const enriched = applyPerGame(
    players.map((p, i) => ({
      ...p,
      ...(p.season_totals || {}),
      _rank: i + 1,
      ...(advancedData[p.sleeper_id] || {}),
    })),
    perGame
  );

  const sorted = useSortedData(enriched, sortConfig);

  function onSort(key) {
    setSortConfig(prev =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "name" || key === "team" || key === "position" ? "asc" : "desc" }
    );
  }

  const cols = columnsForPosition(position, perGame);
  const allCols = position !== "ALL" ? [...cols, ...ADV_COLS] : cols;

  return (
    <div className="stats-table-wrap">
      <table className="stats-table">
        <thead>
          <tr>
            {allCols.map(c => (
              <SortHeader key={c.key} label={c.label} sortKey={c.key}
                sortConfig={sortConfig} onSort={onSort} className={c.cls} title={c.title} />
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map(p => (
            <tr key={p.sleeper_id}>
              {allCols.map(c => {
                if (c.key === "team") {
                  return (
                    <td key={c.key} className={c.cls}>
                      <button className="team-link-btn" onClick={() => onTeamClick(p.team)}>
                        <TeamBadge team={p.team} />
                      </button>
                    </td>
                  );
                }
                if (c.key === "position") {
                  return <td key={c.key} className={`${c.cls || ""} pos-${p.position?.toLowerCase()}`}>{p.position}</td>;
                }
                const raw = p[c.key];
                const isNum = c.cls && c.cls.includes("num");
                const display = c.fmt ? c.fmt(raw) : (isNum ? fmt(raw) : (raw ?? "—"));
                const cls = c.key === "fp_diff_avg"
                  ? `${c.cls || ""} ${raw >= 0 ? "diff-pos" : "diff-neg"}`
                  : c.cls || "";
                return <td key={c.key} className={cls}>{display}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Team Detail Table ───────────────────────────────────────────────────────

function TeamDetailTable({ players, advancedData }) {
  const [sortConfig, setSortConfig] = useState({ key: "fantasy_points_ppr", dir: "desc" });

  function onSort(key) {
    setSortConfig(prev =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "desc" }
    );
  }

  const enriched = players.map(p => {
    const st = p.season_totals || {};
    const adv = advancedData[p.sleeper_id] || {};
    return {
      sleeper_id: p.sleeper_id,
      name: p.name,
      position: p.position,
      fantasy_points_ppr: st.fantasy_points_ppr,
      snap_pct_avg: adv.snap_pct_avg,
      expected_fp_avg: adv.expected_fp_avg,
      fp_diff_avg: adv.fp_diff_avg,
      target_share: st.target_share,
      air_yards_share: st.air_yards_share,
      wopr: st.wopr,
      racr: st.racr,
    };
  });

  const sorted = useSortedData(enriched, sortConfig);

  const sh = (label, key, cls) => (
    <SortHeader label={label} sortKey={key} sortConfig={sortConfig} onSort={onSort} className={cls} />
  );

  return (
    <div className="stats-table-wrap">
      <table className="stats-table">
        <thead>
          <tr>
            {sh("Name", "name")}
            {sh("Pos", "position", "pos-col")}
            {sh("FPTS", "fantasy_points_ppr", "num")}
            {sh("Snap%", "snap_pct_avg", "num")}
            {sh("xFPTS", "expected_fp_avg", "num")}
            {sh("+/-", "fp_diff_avg", "num")}
            {sh("Tgt%", "target_share", "num")}
            {sh("AY%", "air_yards_share", "num")}
            {sh("WOPR", "wopr", "num")}
            {sh("RACR", "racr", "num")}
          </tr>
        </thead>
        <tbody>
          {sorted.map(p => {
            const isSkill = ["RB","WR","TE"].includes(p.position);
            return (
              <tr key={p.sleeper_id}>
                <td>{p.name}</td>
                <td className={`pos-col pos-${p.position?.toLowerCase()}`}>{p.position}</td>
                <td className="num">{fmt(p.fantasy_points_ppr)}</td>
                <td className="num">{fmtPct(p.snap_pct_avg)}</td>
                <td className="num">{fmt(p.expected_fp_avg)}</td>
                <td className={`num ${p.fp_diff_avg >= 0 ? "diff-pos" : "diff-neg"}`}>{fmtDiff(p.fp_diff_avg)}</td>
                <td className="num">{isSkill ? fmtPct(p.target_share) : "—"}</td>
                <td className="num">{isSkill ? fmtPct(p.air_yards_share) : "—"}</td>
                <td className="num">{isSkill ? fmt(p.wopr, 2) : "—"}</td>
                <td className="num">{isSkill ? fmt(p.racr, 2) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main Stats Component ────────────────────────────────────────────────────

export default function Stats() {
  const [view, setView] = useState("teams"); // "teams" | "players" | "team-detail"
  const [teamsData, setTeamsData] = useState([]);
  const [playersData, setPlayersData] = useState([]);
  const [playersCache, setPlayersCache] = useState({}); // { "ALL": [...], "QB": [...], ... }
  const [teamDetailPlayers, setTeamDetailPlayers] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [positionFilter, setPositionFilter] = useState("ALL");
  const [advancedData, setAdvancedData] = useState({}); // { sleeper_id: advObj }
  const [perGame, setPerGame] = useState(false);
  const [nameFilter, setNameFilter] = useState("");
  const [loading, setLoading] = useState(false);

  // Fetch teams on mount
  useEffect(() => {
    fetch(`${BASE_URL}/stats/teams`)
      .then(r => r.json())
      .then(data => setTeamsData(data))
      .catch(err => console.error("Error fetching teams:", err));
  }, []);

  // Fetch players when position filter changes in players view
  const fetchPlayers = useCallback(async (pos) => {
    if (playersCache[pos]) {
      setPlayersData(playersCache[pos]);
      return;
    }
    setLoading(true);
    try {
      const url = pos === "ALL"
        ? `${BASE_URL}/stats/players?limit=300`
        : `${BASE_URL}/stats/players?position=${pos}&limit=300`;
      const data = await fetch(url).then(r => r.json());
      setPlayersCache(prev => ({ ...prev, [pos]: data }));
      setPlayersData(data);
    } catch (err) {
      console.error("Error fetching players:", err);
    } finally {
      setLoading(false);
    }
  }, [playersCache]);

  // Fetch advanced stats for a list of players
  const fetchAdvanced = useCallback(async (players) => {
    const missing = players.filter(p => !advancedData[p.sleeper_id]);
    if (missing.length === 0) return;
    try {
      const results = await Promise.all(
        missing.map(p =>
          fetch(`${BASE_URL}/stats/player/${p.sleeper_id}/advanced`)
            .then(r => r.ok ? r.json() : null)
            .catch(() => null)
        )
      );
      const update = {};
      results.forEach(r => { if (r) update[r.sleeper_id] = r; });
      setAdvancedData(prev => ({ ...prev, ...update }));
    } catch (err) {
      console.error("Error fetching advanced stats:", err);
    }
  }, [advancedData]);

  // Load players when switching to players view
  useEffect(() => {
    if (view === "players") {
      fetchPlayers(positionFilter);
    }
  }, [view, positionFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load advanced whenever players load for a specific position
  useEffect(() => {
    if (view === "players" && positionFilter !== "ALL" && playersData.length > 0) {
      fetchAdvanced(playersData);
    }
  }, [playersData]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTeamClick = useCallback(async (team) => {
    setSelectedTeam(team);
    setView("team-detail");
    setLoading(true);
    try {
      const players = await fetch(`${BASE_URL}/stats/players/team/${team}`).then(r => r.json());
      setTeamDetailPlayers(players);
      // Fetch advanced for all team players in parallel
      fetchAdvanced(players);
    } catch (err) {
      console.error("Error fetching team detail:", err);
    } finally {
      setLoading(false);
    }
  }, [fetchAdvanced]);

  function handlePositionChange(pos) {
    setPositionFilter(pos);
    setNameFilter("");
  }

  function handleViewToggle(v) {
    setView(v);
  }

  return (
    <div className="stats-page">
      {/* View toggle */}
      {view !== "team-detail" && (
        <div className="stats-view-toggle">
          <button
            className={`stats-toggle-btn ${view === "teams" ? "active" : ""}`}
            onClick={() => handleViewToggle("teams")}
          >
            Teams
          </button>
          <button
            className={`stats-toggle-btn ${view === "players" ? "active" : ""}`}
            onClick={() => handleViewToggle("players")}
          >
            Players
          </button>
          {view === "players" && (
            <button
              className={`stats-toggle-btn pg-toggle ${perGame ? "active" : ""}`}
              onClick={() => setPerGame(v => !v)}
            >
              {perGame ? "Per Game" : "Totals"}
            </button>
          )}
        </div>
      )}

      {/* Team detail breadcrumb */}
      {view === "team-detail" && (
        <div className="stats-breadcrumb">
          <button className="stats-back-btn" onClick={() => setView("teams")}>
            ← Back
          </button>
          <span className="stats-breadcrumb-label">{selectedTeam} — Players</span>
        </div>
      )}

      {/* Teams view */}
      {view === "teams" && (
        teamsData.length === 0
          ? <div className="stats-loading">Loading teams…</div>
          : <TeamsTable teams={teamsData} onTeamClick={handleTeamClick} />
      )}

      {/* Players view */}
      {view === "players" && (
        <>
          <div className="stats-filters">
            <div className="stats-pos-tabs">
              {POSITIONS.map(pos => (
                <button
                  key={pos}
                  className={`stats-pos-tab ${positionFilter === pos ? "active" : ""}`}
                  onClick={() => handlePositionChange(pos)}
                >
                  {pos}
                </button>
              ))}
            </div>
            <input
              className="stats-name-filter"
              type="text"
              placeholder="Filter player…"
              value={nameFilter}
              onChange={e => setNameFilter(e.target.value)}
            />
          </div>
          {loading
            ? <div className="stats-loading">Loading players…</div>
            : <PlayersTable
                players={playersData.filter(p =>
                  !nameFilter || p.name?.toLowerCase().includes(nameFilter.toLowerCase())
                )}
                advancedData={advancedData}
                onTeamClick={handleTeamClick}
                position={positionFilter}
                perGame={perGame}
              />
          }
        </>
      )}

      {/* Team detail view */}
      {view === "team-detail" && (
        loading
          ? <div className="stats-loading">Loading {selectedTeam}…</div>
          : <TeamDetailTable players={teamDetailPlayers} advancedData={advancedData} />
      )}
    </div>
  );
}

import React, { useState, useEffect, useCallback } from "react";
import "./Stats.css";

const mock = process.env.REACT_APP_MOCK === "true";
const BASE_URL = mock
  ? "http://localhost:5000"
  : "https://shaggy-latashia-carnade-2ea2054a.koyeb.app";

const POSITIONS = ["ALL", "QB", "RB", "WR", "TE"];

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

function SortHeader({ label, sortKey, sortConfig, onSort, className }) {
  const active = sortConfig.key === sortKey;
  const arrow = active ? (sortConfig.dir === "asc" ? " ↑" : " ↓") : "";
  return (
    <th className={`sortable ${className || ""}`} onClick={() => onSort(sortKey)}>
      {label}{arrow}
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

function TeamsTable({ teams, onTeamClick }) {
  const [sortConfig, setSortConfig] = useState({ key: "team", dir: "asc" });
  const sorted = useSortedData(teams, sortConfig);

  function onSort(key) {
    setSortConfig(prev =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "team" ? "asc" : "desc" }
    );
  }

  const sh = (label, key, cls) => (
    <SortHeader label={label} sortKey={key} sortConfig={sortConfig} onSort={onSort} className={cls} />
  );

  return (
    <div className="stats-table-wrap">
      <table className="stats-table">
        <thead>
          <tr>
            {sh("Team", "team")}
            {sh("PPG", "points_per_game", "num")}
            {sh("Pass%", "pass_rate", "num")}
            {sh("Pass Yds/G", "pass_yards_per_game", "num")}
            {sh("Rush Yds/G", "rush_yards_per_game", "num")}
            <th className="group-header" colSpan={4}>Def Pts Allowed/G</th>
            <th className="group-header" colSpan={4}>Def Rank (season)</th>
            {sh("Next", "schedule.opponent")}
          </tr>
          <tr className="subheader">
            <th /><th /><th /><th /><th />
            {sh("QB", "def_fpts_allowed_qb_per_game", "num")}
            {sh("RB", "def_fpts_allowed_rb_per_game", "num")}
            {sh("WR", "def_fpts_allowed_wr_per_game", "num")}
            {sh("TE", "def_fpts_allowed_te_per_game", "num")}
            {sh("QB", "def_rank_vs_position.season.qb", "num rank-col")}
            {sh("RB", "def_rank_vs_position.season.rb", "num rank-col")}
            {sh("WR", "def_rank_vs_position.season.wr", "num rank-col")}
            {sh("TE", "def_rank_vs_position.season.te", "num rank-col")}
            <th />
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
                  <button className="team-link" onClick={() => onTeamClick(t.team)}>
                    {t.team}
                  </button>
                </td>
                <td className="num">{fmt(t.points_per_game)}</td>
                <td className="num">{fmtPct(t.pass_rate)}</td>
                <td className="num">{fmt(t.pass_yards_per_game)}</td>
                <td className="num">{fmt(t.rush_yards_per_game)}</td>
                <td className="num">{fmt(t.def_fpts_allowed_qb_per_game)}</td>
                <td className="num">{fmt(t.def_fpts_allowed_rb_per_game)}</td>
                <td className="num">{fmt(t.def_fpts_allowed_wr_per_game)}</td>
                <td className="num">{fmt(t.def_fpts_allowed_te_per_game)}</td>
                <td className={`num rank-col ${rankClass(rnk.qb)}`}>{rnk.qb ?? "—"}</td>
                <td className={`num rank-col ${rankClass(rnk.rb)}`}>{rnk.rb ?? "—"}</td>
                <td className={`num rank-col ${rankClass(rnk.wr)}`}>{rnk.wr ?? "—"}</td>
                <td className={`num rank-col ${rankClass(rnk.te)}`}>{rnk.te ?? "—"}</td>
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

function columnsForPosition(pos) {
  switch (pos) {
    case "QB":
      return [
        { label: "#",        key: "_rank",            cls: "num narrow" },
        { label: "Name",     key: "name" },
        { label: "Team",     key: "team",             cls: "team-col" },
        { label: "FPTS",     key: "fantasy_points_ppr", cls: "num" },
        { label: "Pass Yds", key: "passing_yards",    cls: "num" },
        { label: "Pass TDs", key: "passing_tds",      cls: "num" },
        { label: "Rush Yds", key: "rushing_yards",    cls: "num" },
      ];
    case "RB":
      return [
        { label: "#",       key: "_rank",            cls: "num narrow" },
        { label: "Name",    key: "name" },
        { label: "Team",    key: "team",             cls: "team-col" },
        { label: "FPTS",    key: "fantasy_points_ppr", cls: "num" },
        { label: "Car",     key: "carries",          cls: "num" },
        { label: "Rush Yds",key: "rushing_yards",    cls: "num" },
        { label: "Rush TDs",key: "rushing_tds",      cls: "num" },
        { label: "Tgt",     key: "targets",          cls: "num" },
        { label: "Rec",     key: "receptions",       cls: "num" },
        { label: "Rec Yds", key: "receiving_yards",  cls: "num" },
      ];
    case "WR":
    case "TE":
      return [
        { label: "#",       key: "_rank",            cls: "num narrow" },
        { label: "Name",    key: "name" },
        { label: "Team",    key: "team",             cls: "team-col" },
        { label: "FPTS",    key: "fantasy_points_ppr", cls: "num" },
        { label: "Tgt",     key: "targets",          cls: "num" },
        { label: "Rec",     key: "receptions",       cls: "num" },
        { label: "Rec Yds", key: "receiving_yards",  cls: "num" },
        { label: "Rec TDs", key: "receiving_tds",    cls: "num" },
      ];
    default: // ALL
      return [
        { label: "#",    key: "_rank",              cls: "num narrow" },
        { label: "Name", key: "name" },
        { label: "Team", key: "team",               cls: "team-col" },
        { label: "Pos",  key: "position",           cls: "pos-col" },
        { label: "FPTS PPR", key: "fantasy_points_ppr", cls: "num" },
        { label: "FPTS Std", key: "fantasy_points", cls: "num" },
      ];
  }
}

const ADV_COLS = [
  { label: "Snap%", key: "snap_pct_avg",    cls: "num", fmt: v => fmtPct(v) },
  { label: "xFPTS", key: "expected_fp_avg", cls: "num", fmt: v => fmt(v) },
  { label: "+/-",   key: "fp_diff_avg",     cls: "num", fmt: v => fmtDiff(v) },
];

function PlayersTable({ players, advancedData, showAdvanced, onTeamClick, position }) {
  const [sortConfig, setSortConfig] = useState({ key: "fantasy_points_ppr", dir: "desc" });

  const enriched = players.map((p, i) => ({
    ...p,
    _rank: i + 1,
    ...(advancedData[p.sleeper_id] || {}),
  }));

  const sorted = useSortedData(enriched, sortConfig);

  function onSort(key) {
    setSortConfig(prev =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "name" || key === "team" || key === "position" ? "asc" : "desc" }
    );
  }

  const cols = columnsForPosition(position);
  const allCols = showAdvanced ? [...cols, ...ADV_COLS] : cols;

  return (
    <div className="stats-table-wrap">
      <table className="stats-table">
        <thead>
          <tr>
            {allCols.map(c => (
              <SortHeader key={c.key} label={c.label} sortKey={c.key}
                sortConfig={sortConfig} onSort={onSort} className={c.cls} />
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
                      <button className="team-link" onClick={() => onTeamClick(p.team)}>
                        {p.team}
                      </button>
                    </td>
                  );
                }
                if (c.key === "position") {
                  return <td key={c.key} className={`${c.cls || ""} pos-${p.position?.toLowerCase()}`}>{p.position}</td>;
                }
                const raw = p[c.key];
                const display = c.fmt ? c.fmt(raw) : (raw ?? "—");
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
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [advancedData, setAdvancedData] = useState({}); // { sleeper_id: advObj }
  const [loading, setLoading] = useState(false);
  const [advLoading, setAdvLoading] = useState(false);

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
    setAdvLoading(true);
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
    } finally {
      setAdvLoading(false);
    }
  }, [advancedData]);

  // Load players when switching to players view
  useEffect(() => {
    if (view === "players") {
      fetchPlayers(positionFilter);
    }
  }, [view, positionFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load advanced when toggled on (players view, non-ALL position)
  useEffect(() => {
    if (view === "players" && showAdvanced && positionFilter !== "ALL" && playersData.length > 0) {
      fetchAdvanced(playersData);
    }
  }, [showAdvanced, playersData]); // eslint-disable-line react-hooks/exhaustive-deps

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
    setShowAdvanced(false);
  }

  function handleViewToggle(v) {
    setView(v);
    if (v === "players") setShowAdvanced(false);
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
            {positionFilter !== "ALL" && (
              <div className="stats-adv-toggle">
                <button
                  className={`stats-toggle-btn small ${showAdvanced ? "active" : ""}`}
                  onClick={() => setShowAdvanced(v => !v)}
                >
                  {showAdvanced ? "Advanced ✓" : "Advanced"}
                </button>
                {advLoading && <span className="stats-adv-loading">loading…</span>}
              </div>
            )}
          </div>
          {loading
            ? <div className="stats-loading">Loading players…</div>
            : <PlayersTable
                players={playersData}
                advancedData={advancedData}
                showAdvanced={showAdvanced && positionFilter !== "ALL"}
                onTeamClick={handleTeamClick}
                position={positionFilter}
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

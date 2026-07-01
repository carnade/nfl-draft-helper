import React, { useState, useEffect, useCallback } from "react";
import "./Odds.css";

const mock = process.env.REACT_APP_MOCK === "true";
const BASE_URL = mock
  ? "http://localhost:5000"
  : "https://shaggy-latashia-carnade-2ea2054a.koyeb.app";

const POSITIONS = ["ALL", "QB", "RB", "WR", "TE"];

const MARKET_LABELS = {
  player_pass_yds:      "Pass Yds",
  player_rush_yds:      "Rush Yds",
  player_reception_yds: "Rec Yds",
  player_anytime_td:    "Anytime TD",
};

const TEAM_COLORS = {
  ARI: "#97233F", ATL: "#A71930", BAL: "#241773", BUF: "#00338D",
  CAR: "#0085CA", CHI: "#0B162A", CIN: "#FB4F14", CLE: "#311D00",
  DAL: "#003594", DEN: "#FB4F14", DET: "#0076B6", GB:  "#203731",
  HOU: "#03202F", IND: "#002C5F", JAX: "#006778", KC:  "#E31837",
  LAC: "#0080C6", LA:  "#003594", LV:  "#000000", MIA: "#008E97",
  MIN: "#4F2683", NE:  "#002244", NO:  "#D3BC8D", NYG: "#0B2265",
  NYJ: "#125740", PHI: "#004C54", PIT: "#FFB612", SEA: "#002244",
  SF:  "#AA0000", TB:  "#D50A0A", TEN: "#4B92DB", WAS: "#5A1414",
};

function TeamBadge({ team }) {
  const color = TEAM_COLORS[team] || "#555";
  return (
    <span className="odds-team-badge" style={{ backgroundColor: color }}>
      {team}
    </span>
  );
}

function fmt(val, decimals = 1) {
  if (val == null || val === "" || isNaN(val)) return "—";
  return Number(val).toFixed(decimals);
}

function fmtPrice(price) {
  if (price == null) return "—";
  return Number(price).toFixed(2);
}

function fmtTime(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

// ─── Sort hook ───────────────────────────────────────────────────────────────

function getWeekBucket(commence_time) {
  if (!commence_time) return null;
  const d = new Date(commence_time);
  // Use Tuesday as the NFL week boundary (games run Thu–Mon)
  const day = d.getDay(); // 0=Sun,1=Mon,2=Tue,...
  const daysToTue = (day - 2 + 7) % 7;
  const tue = new Date(d);
  tue.setDate(d.getDate() - daysToTue);
  tue.setHours(0, 0, 0, 0);
  return tue.getTime();
}

function groupByWeek(rows) {
  const map = new Map();
  for (const r of rows) {
    const bucket = getWeekBucket(r.commence_time);
    const key = bucket ?? -1;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(r);
  }
  const sorted = [...map.entries()].sort(([a], [b]) => a - b);
  return sorted.map(([ts, weekRows], i) => {
    const label = ts === -1 ? "Unknown Week" : `Week ${i + 1}`;
    return [label, weekRows];
  });
}

function useSortedData(data, sortConfig) {
  if (!sortConfig.key) return data;
  return [...data].sort((a, b) => {
    const av = a[sortConfig.key];
    const bv = b[sortConfig.key];
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === "string") return sortConfig.dir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    return sortConfig.dir === "asc" ? av - bv : bv - av;
  });
}

function SortHeader({ label, sortKey, sortConfig, onSort, className, title }) {
  const active = sortConfig.key === sortKey;
  const arrow = active ? (sortConfig.dir === "asc" ? " ↑" : " ↓") : "";
  return (
    <th
      className={`odds-sortable ${className || ""}`}
      onClick={() => onSort(sortKey)}
      title={title}
    >
      {label}{arrow}
    </th>
  );
}

// ─── Game Lines Table ────────────────────────────────────────────────────────

function GameLinesRows({ games, sortConfig, onSort }) {
  const sh = (label, key, cls) => (
    <SortHeader label={label} sortKey={key} sortConfig={sortConfig} onSort={onSort} className={cls} />
  );
  const flat = games.map(g => ({
    ...g,
    spread_line: g.spread?.home_spread,
    total_line:  g.total?.line,
    home_ml:     g.h2h?.home_price,
    away_ml:     g.h2h?.away_price,
    ou_implied:  g.ou_eval?.implied,
    ou_edge_pct: g.ou_eval?.edge_pct,
    ou_signal:   g.ou_eval?.signal,
  }));
  const sorted = useSortedData(flat, sortConfig);
  return (
    <table className="odds-table">
      <thead>
        <tr>
          {sh("Matchup", "away_abbr")}
          {sh("Date", "commence_time", "num")}
          {sh("Spread", "spread_line", "num")}
          {sh("Total", "total_line", "num")}
          {sh("Our Total", "ou_implied", "num")}
          {sh("Edge", "ou_edge_pct", "num")}
          {sh("Home ML", "home_ml", "num")}
          {sh("Away ML", "away_ml", "num")}
        </tr>
      </thead>
      <tbody>
        {sorted.map(g => (
          <tr key={g.event_id}>
            <td className="odds-matchup">
              <TeamBadge team={g.away_abbr} />
              <span className="odds-at"> @ </span>
              <TeamBadge team={g.home_abbr} />
            </td>
            <td className="num odds-time">{fmtTime(g.commence_time)}</td>
            <td className="num">{g.spread_line != null ? (g.spread_line > 0 ? `+${g.spread_line}` : g.spread_line) : "—"}</td>
            <td className="num">{fmt(g.total_line)}</td>
            <td className="num">{g.ou_implied != null ? fmt(g.ou_implied) : "—"}</td>
            <td className="num">
              {g.ou_signal ? (
                <span className={`value-badge value-badge-${g.ou_signal}`}>
                  {g.ou_signal === "over" ? "▲" : "▼"} {Math.abs((g.ou_edge_pct || 0) * 100).toFixed(1)}%
                </span>
              ) : "—"}
            </td>
            <td className="num">{fmtPrice(g.home_ml)}</td>
            <td className="num">{fmtPrice(g.away_ml)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function GameLinesTable({ games, weeklyView }) {
  const [sortConfig, setSortConfig] = useState({ key: "commence_time", dir: "asc" });
  function onSort(key) {
    setSortConfig(prev => prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" });
  }

  if (!weeklyView) {
    return (
      <div className="odds-table-wrap">
        <GameLinesRows games={games} sortConfig={sortConfig} onSort={onSort} />
      </div>
    );
  }

  const groups = groupByWeek(games);
  return (
    <div className="odds-weeks">
      {groups.map(([weekLabel, weekGames]) => (
        <WeekSection key={weekLabel} label={weekLabel}>
          <GameLinesRows games={weekGames} sortConfig={sortConfig} onSort={onSort} />
        </WeekSection>
      ))}
    </div>
  );
}

// ─── Player Props Table ──────────────────────────────────────────────────────

function flattenProps(players, marketFilter) {
  const rows = [];
  for (const p of players) {
    for (const [mkey, m] of Object.entries(p.props || {})) {
      if (marketFilter && marketFilter !== "ALL" && mkey !== marketFilter) continue;
      rows.push({
        sleeper_id:    p.sleeper_id,
        name:          p.name,
        position:      p.position,
        team:          p.team,
        home_abbr:     p.home_abbr,
        away_abbr:     p.away_abbr,
        commence_time: p.commence_time,
        market:        mkey,
        market_label:  MARKET_LABELS[mkey] || mkey,
        line:          m.line,
        best_over:     m.best_over_price,
        best_over_book: m.best_over_book,
        best_under:    m.best_under_price,
        best_under_book: m.best_under_book,
        rolling_avg:   m.rolling_avg,
        value_flag:    m.value_flag,
        value_pct:     m.value_pct,
      });
    }
  }
  return rows;
}

function WeekSection({ label, children }) {
  return (
    <div className="odds-week-section">
      <h3 className="odds-week-header">{label}</h3>
      <div className="odds-table-wrap">{children}</div>
    </div>
  );
}

function PropsRows({ rows, sortConfig, onSort }) {
  const sh = (label, key, cls, title) => (
    <SortHeader label={label} sortKey={key} sortConfig={sortConfig} onSort={onSort} className={cls} title={title} />
  );
  const sorted = useSortedData(rows, sortConfig);
  return (
    <table className="odds-table">
      <thead>
        <tr>
          {sh("Player", "name")}
          {sh("Pos", "position", "pos-col")}
          {sh("Team", "team")}
          {sh("Market", "market_label")}
          {sh("Line", "line", "num")}
          {sh("Best Over", "best_over", "num")}
          {sh("Best Under", "best_under", "num")}
          {sh("Rolling Avg", "rolling_avg", "num", "5-game rolling average for this stat")}
          {sh("Value", "value_pct", "num", "% difference between rolling avg and line")}
        </tr>
      </thead>
      <tbody>
        {sorted.map((r, i) => (
          <tr key={`${r.sleeper_id}-${r.market}-${i}`} className={r.value_flag ? `value-${r.value_flag}` : ""}>
            <td className="odds-player-name">{r.name}</td>
            <td className={`pos-col pos-${r.position?.toLowerCase()}`}>{r.position}</td>
            <td><TeamBadge team={r.team} /></td>
            <td className="odds-market-label">{r.market_label}</td>
            <td className="num">{fmt(r.line)}</td>
            <td className="num odds-price">{fmtPrice(r.best_over)}</td>
            <td className="num odds-price">{fmtPrice(r.best_under)}</td>
            <td className="num">{fmt(r.rolling_avg)}</td>
            <td className="num odds-value">
              {r.value_flag ? (
                <span className={`value-badge value-badge-${r.value_flag}`}>
                  {r.value_flag === "over" ? "▲" : "▼"} {Math.abs((r.value_pct || 0) * 100).toFixed(1)}%
                </span>
              ) : "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PropsTable({ players, marketFilter, weeklyView }) {
  const [sortConfig, setSortConfig] = useState({ key: "value_pct", dir: "desc" });
  function onSort(key) {
    setSortConfig(prev =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "name" || key === "team" ? "asc" : "desc" }
    );
  }

  const rows = flattenProps(players, marketFilter);

  if (!weeklyView) {
    return (
      <div className="odds-table-wrap">
        <PropsRows rows={rows} sortConfig={sortConfig} onSort={onSort} />
      </div>
    );
  }

  const groups = groupByWeek(rows);
  return (
    <div className="odds-weeks">
      {groups.map(([weekLabel, weekRows]) => (
        <WeekSection key={weekLabel} label={weekLabel}>
          <PropsRows rows={weekRows} sortConfig={sortConfig} onSort={onSort} />
        </WeekSection>
      ))}
    </div>
  );
}

// ─── Main Odds Component ─────────────────────────────────────────────────────

export default function Odds() {
  const [tab, setTab] = useState("games");
  const [gamesData, setGamesData] = useState([]);
  const [propsData, setPropsData] = useState([]);
  const [status, setStatus] = useState(null);
  const [posFilter, setPosFilter] = useState("ALL");
  const [marketFilter, setMarketFilter] = useState("ALL");
  const [valueOnly, setValueOnly] = useState(false);
  const [weeklyView, setWeeklyView] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchStatus = useCallback(() => {
    fetch(`${BASE_URL}/odds/status`)
      .then(r => r.json())
      .then(setStatus)
      .catch(() => {});
  }, []);

  const fetchGames = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch(`${BASE_URL}/odds/games`)
      .then(r => r.json())
      .then(data => { setGamesData(data); setLoading(false); })
      .catch(err => { setError("Failed to load game lines."); setLoading(false); });
  }, []);

  const fetchProps = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (posFilter !== "ALL") params.set("position", posFilter);
    if (marketFilter !== "ALL") params.set("market", marketFilter);
    if (valueOnly) params.set("value_only", "true");
    fetch(`${BASE_URL}/odds/props?${params}`)
      .then(r => r.json())
      .then(data => { setPropsData(data); setLoading(false); })
      .catch(err => { setError("Failed to load player props."); setLoading(false); });
  }, [posFilter, marketFilter, valueOnly]);

  useEffect(() => {
    fetchStatus();
    fetchGames();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (tab === "props") fetchProps();
  }, [tab, posFilter, marketFilter, valueOnly]); // eslint-disable-line react-hooks/exhaustive-deps

  const noData = tab === "games" ? gamesData.length === 0 : propsData.length === 0;

  return (
    <div className="odds-page">

      {/* Header with status */}
      <div className="odds-header">
        <div className="odds-tab-toggle">
          <button className={`odds-tab-btn ${tab === "games" ? "active" : ""}`} onClick={() => setTab("games")}>
            Game Lines
          </button>
          <button className={`odds-tab-btn ${tab === "props" ? "active" : ""}`} onClick={() => setTab("props")}>
            Player Props
          </button>
        </div>
        <div className="odds-view-toggle">
          <button
            className={`odds-view-btn${!weeklyView ? " active" : ""}`}
            onClick={() => setWeeklyView(false)}
          >All</button>
          <button
            className={`odds-view-btn${weeklyView ? " active" : ""}`}
            onClick={() => setWeeklyView(true)}
          >Weekly</button>
        </div>

        {status && (
          <div className="odds-status">
            {status.last_updated
              ? <span>Updated {fmtTime(status.last_updated)}</span>
              : <span className="odds-no-data">No data yet — trigger a refresh via admin</span>
            }
            {status.credits_remaining != null && (
              <span className="odds-credits">{status.credits_remaining} credits left</span>
            )}
            {status.value_flag_count > 0 && (
              <span className="odds-value-count">{status.value_flag_count} value flags</span>
            )}
          </div>
        )}
      </div>

      {/* Props filters */}
      {tab === "props" && (
        <div className="odds-filters">
          <div className="odds-pos-tabs">
            {POSITIONS.map(pos => (
              <button
                key={pos}
                className={`odds-pos-tab ${posFilter === pos ? "active" : ""}`}
                onClick={() => setPosFilter(pos)}
              >
                {pos}
              </button>
            ))}
          </div>
          <div className="odds-market-tabs">
            {["ALL", ...Object.keys(MARKET_LABELS)].map(m => (
              <button
                key={m}
                className={`odds-market-tab ${marketFilter === m ? "active" : ""}`}
                onClick={() => setMarketFilter(m)}
              >
                {MARKET_LABELS[m] || m}
              </button>
            ))}
          </div>
          <label className="odds-value-toggle">
            <input
              type="checkbox"
              checked={valueOnly}
              onChange={e => setValueOnly(e.target.checked)}
            />
            Value flags only
          </label>
        </div>
      )}

      {/* Content */}
      {loading && <div className="odds-loading">Loading…</div>}
      {error   && <div className="odds-error">{error}</div>}

      {!loading && !error && noData && (
        <div className="odds-empty">
          No odds data available. The season may be in the off-season, or the data has not been fetched yet.
        </div>
      )}

      {!loading && !error && !noData && (
        <>
          {tab === "games" && <GameLinesTable games={gamesData} weeklyView={weeklyView} />}
          {tab === "props" && <PropsTable players={propsData} marketFilter={marketFilter === "ALL" ? null : marketFilter} weeklyView={weeklyView} />}
        </>
      )}
    </div>
  );
}

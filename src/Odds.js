import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import "./Odds.css";
import { getDvpColor } from "./dvpColor";
import { PrivilegedOnly } from "./auth";

const mock = process.env.REACT_APP_MOCK === "true";
const BASE_URL = mock
  ? "http://localhost:5000"
  : "https://shaggy-latashia-carnade-2ea2054a.koyeb.app";

const POSITIONS = ["ALL", "QB", "RB", "WR", "TE"];

// Order here drives the market filter tab order: volume stat before the
// yardage it produces, TD last.
const MARKET_LABELS = {
  player_pass_yds:      "Pass Yds",
  player_rush_attempts: "Rush Att",
  player_rush_yds:      "Rush Yds",
  player_receptions:    "Receptions",
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

// Yes/no markets (Anytime TD) carry a scoring *rate*, not a yardage total —
// show those as a percentage so 0.6 doesn't read as "0.6 touchdowns".
const BINARY_MARKETS = new Set(["player_anytime_td"]);

// Anytime TD is a different kind of bet from the yardage markets: a rate rather
// than a line, on its own scale. Mixing it into "All" buries the yardage rows it
// is not comparable with, so "All" means every yardage market and Anytime TD is
// picked on its own.
const ANYTIME_TD = "player_anytime_td";
function fmtStat(val, market) {
  if (val == null || val === "" || isNaN(val)) return "—";
  if (BINARY_MARKETS.has(market)) return `${(Number(val) * 100).toFixed(0)}%`;
  return Number(val).toFixed(1);
}

function fmtTime(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
  } catch {
    return iso;
  }
}

// Compact duration, e.g. 3.2 -> "3h", 50 -> "2d 2h"
function fmtAge(hours) {
  if (hours == null || isNaN(hours)) return "—";
  const h = Math.max(0, Math.round(Number(hours)));
  if (h < 1) return "<1h";
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  const rem = h % 24;
  return rem ? `${d}d ${rem}h` : `${d}d`;
}

function fmtCountdown(iso) {
  if (!iso) return "—";
  const ms = new Date(iso) - new Date();
  return ms <= 0 ? "due now" : `in ${fmtAge(ms / 3600000)}`;
}

// Admin-only manual refresh. Confirms first because a refresh spends API
// credits from a limited monthly budget.
function RefreshButton({ onDone }) {
  const [state, setState] = useState("idle"); // idle | confirm | working
  const [result, setResult] = useState(null);

  async function run() {
    setState("working");
    setResult(null);
    try {
      const r = await fetch(`${BASE_URL}/admin/trigger-odds-fetch`, { method: "POST" });
      const d = await r.json().catch(() => ({}));
      setResult(d.ok === false || !r.ok
        ? { ok: false, msg: d.error || d.message || `HTTP ${r.status}` }
        : { ok: true, msg: `${d.games ?? 0} games, ${d.players ?? 0} players` });
      onDone?.();
    } catch (e) {
      setResult({ ok: false, msg: "Request failed" });
    } finally {
      setState("idle");
    }
  }

  if (state === "working") return <span className="odds-refresh-working">Refreshing…</span>;

  if (state === "confirm") {
    return (
      <span className="odds-refresh-confirm">
        Refresh now? Uses ~50 credits.
        <button className="odds-refresh-yes" onClick={run}>Yes</button>
        <button className="odds-refresh-no" onClick={() => setState("idle")}>Cancel</button>
      </span>
    );
  }

  return (
    <>
      <button className="odds-refresh-btn" onClick={() => { setResult(null); setState("confirm"); }}>
        Refresh
      </button>
      {result && (
        <span className={result.ok ? "odds-refresh-ok" : "odds-refresh-err"} title={result.msg}>
          {result.ok ? `✓ ${result.msg}` : `✗ ${result.msg}`}
        </span>
      )}
    </>
  );
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
  // A null filter is how the page spells "All".
  const showingAll = !marketFilter || marketFilter === "ALL";
  for (const p of players) {
    for (const [mkey, m] of Object.entries(p.props || {})) {
      if (showingAll ? mkey === ANYTIME_TD : mkey !== marketFilter) continue;
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
        // Anytime TD has no real yardage line — show the Yes price there instead.
        line:          mkey === "player_anytime_td" ? m.best_over_price : m.line,
        rolling_avg:   m.rolling_avg,
        projection:    m.projection,
        value_flag:    m.value_flag,
        value_pct:     m.value_pct,
        last5:         m.last5,
        opp_defense:   m.opp_defense,
        opp_defense_rank: m.opp_defense?.rank,
        opponent:      p.team === p.home_abbr ? p.away_abbr : p.team === p.away_abbr ? p.home_abbr : null,
      });
    }
  }
  return rows;
}

function Last5Chips({ values, line, market }) {
  if (!values || !values.length) return <span className="odds-last5-empty">—</span>;
  return (
    <span className="odds-last5">
      {values.map((v, i) => {
        const binary = BINARY_MARKETS.has(market);
        let cls = "odds-last5-chip";
        if (binary) {
          cls += v.value >= 1 ? " hit" : " miss";
        } else if (line != null) {
          cls += v.value > line ? " hit" : v.value < line ? " miss" : " push";
        }
        // Binary markets are 1/0 — a tick/dash reads faster than a number
        const label = binary ? (v.value >= 1 ? "✓" : "–") : v.value;
        const tip = binary
          ? `Week ${v.week}: ${v.value >= 1 ? "scored" : "no TD"}`
          : `Week ${v.week}: ${v.value}`;
        return (
          <span key={i} className={cls} title={tip}>
            {label}
          </span>
        );
      })}
    </span>
  );
}

function OppDefenseCell({ opp, opponent }) {
  if (!opp) return <span className="num">—</span>;
  const basisLabel = opp.basis === "rolling5" ? "Last 5 games" : "Season";
  return (
    <span className="odds-opp-def-wrap" title={`${basisLabel} — ${opp.value} allowed/gm`}>
      {opponent && <TeamBadge team={opponent} />}
      <span className="odds-opp-def" style={{ color: getDvpColor(opp.rank) || undefined }}>
        #{opp.rank}
      </span>
    </span>
  );
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
          {sh("Date", "commence_time", "num")}
          {sh("Player", "name")}
          {sh("Pos", "position", "pos-col")}
          {sh("Team", "team")}
          {sh("Market", "market_label")}
          {sh("Line", "line", "num", "Yardage line, or the Yes price for Anytime TD")}
          {sh("Rolling Avg", "rolling_avg", "num", "5-game rolling average for this stat")}
          {sh("Proj", "projection", "num", "Rolling average adjusted for the opponent's defence — this is what the Value % is measured from")}
          <th className="odds-last5-col" title="Last 5 individual games for this stat, colored vs. the current line">Last 5</th>
          {sh("Opp Def", "opp_defense_rank", "num", "Opponent's rank (1=stingiest) vs. this position for this stat")}
          {sh("Value", "value_pct", "num", "% difference between rolling avg and line")}
        </tr>
      </thead>
      <tbody>
        {sorted.map((r, i) => (
          <tr key={`${r.sleeper_id}-${r.market}-${i}`} className={r.value_flag ? `value-${r.value_flag}` : ""}>
            <td className="num odds-time">{fmtTime(r.commence_time)}</td>
            <td className="odds-player-name">{r.name}</td>
            <td className={`pos-col pos-${r.position?.toLowerCase()}`}>{r.position}</td>
            <td><TeamBadge team={r.team} /></td>
            <td className="odds-market-label">{r.market_label}</td>
            <td className="num">{r.market === "player_anytime_td" ? fmtPrice(r.line) : fmt(r.line)}</td>
            <td className="num">{fmtStat(r.rolling_avg, r.market)}</td>
            <td className="num">{fmtStat(r.projection, r.market)}</td>
            <td><Last5Chips values={r.last5} line={r.line} market={r.market} /></td>
            <td className="num"><OppDefenseCell opp={r.opp_defense} opponent={r.opponent} /></td>
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

// ─── Results Table ───────────────────────────────────────────────────────────

function ResultsRows({ games, sortConfig, onSort }) {
  const sh = (label, key, cls) => (
    <SortHeader label={label} sortKey={key} sortConfig={sortConfig} onSort={onSort} className={cls} />
  );
  const flat = games.map(g => ({
    ...g,
    total_line:   g.total?.line,
    ou_signal:    g.ou_eval?.signal,
    home_score:   g.result?.home_score,
    away_score:   g.result?.away_score,
    actual_total: g.result?.actual_total,
    ml_winner:    g.result?.ml_winner,
    ou_result:    g.result?.ou_result,
    edge_correct: g.result?.edge_correct,
  }));
  const sorted = useSortedData(flat, sortConfig);
  return (
    <table className="odds-table">
      <thead>
        <tr>
          {sh("Wk", "nfl_week", "num")}
          {sh("Matchup", "away_abbr")}
          {sh("Date", "commence_time", "num")}
          {sh("Score", "home_score", "num")}
          {sh("Total Line", "total_line", "num")}
          {sh("Actual Total", "actual_total", "num")}
          {sh("ML Winner", "ml_winner")}
          {sh("Our Edge", "ou_signal")}
        </tr>
      </thead>
      <tbody>
        {sorted.map(g => {
          const played = g.result !== null;
          const rowCls = played && g.edge_correct === true
            ? "value-over"
            : played && g.edge_correct === false
            ? "value-under"
            : "";
          return (
            <tr key={g.event_id} className={rowCls}>
              <td className="num">{g.nfl_week ?? "—"}</td>
              <td className="odds-matchup">
                <TeamBadge team={g.away_abbr} />
                <span className="odds-at"> @ </span>
                <TeamBadge team={g.home_abbr} />
              </td>
              <td className="num odds-time">{fmtTime(g.commence_time)}</td>
              <td className="num">
                {played ? `${g.away_score}–${g.home_score}` : "—"}
              </td>
              <td className="num">{fmt(g.total_line)}</td>
              <td className="num">{played ? fmt(g.actual_total, 0) : "—"}</td>
              <td>
                {played ? (
                  <TeamBadge team={g.ml_winner === "home" ? g.home_abbr : g.away_abbr} />
                ) : "—"}
              </td>
              <td>
                {g.ou_signal ? (
                  <span className={`value-badge value-badge-${played && g.ou_result !== "push" ? (g.edge_correct ? g.ou_signal : (g.ou_signal === "over" ? "under" : "over")) : g.ou_signal}`}>
                    {g.ou_signal === "over" ? "▲" : "▼"} {g.ou_signal.toUpperCase()}
                  </span>
                ) : "—"}
                {played && g.ou_result === "push" && (
                  <span className="value-badge value-badge-push"> PUSH</span>
                )}
                {played && g.ou_result !== "push" && g.edge_correct !== null && (
                  <span className={`value-badge value-badge-${g.edge_correct ? "over" : "under"}`} style={{ marginLeft: 4 }}>
                    {g.edge_correct ? "✓" : "✗"}
                  </span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// Weeks present in a set of rows, newest first, so a filter can offer only the
// weeks that exist rather than a fixed 1-18.
function weeksIn(rows) {
  const weeks = new Set();
  for (const r of rows) if (r.nfl_week != null) weeks.add(r.nfl_week);
  return [...weeks].sort((a, b) => b - a);
}

// The week a results view should open on: the most recent one that has something
// graded, since that is the week you have just watched. Falls back to the newest
// week present, then to everything.
function latestGradedWeek(rows, isGraded) {
  const graded = rows.filter((r) => r.nfl_week != null && isGraded(r));
  if (graded.length > 0) return Math.max(...graded.map((r) => r.nfl_week));
  const weeks = weeksIn(rows);
  return weeks.length > 0 ? weeks[0] : "all";
}

function WeekSelect({ value, onChange, weeks, label = "Week" }) {
  return (
    <label className="odds-filter">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value === "all" ? "all" : Number(e.target.value))}>
        <option value="all">All</option>
        {weeks.map((w) => (
          <option key={w} value={w}>{w}</option>
        ))}
      </select>
    </label>
  );
}

function ResultsTable({ games }) {
  const [sortConfig, setSortConfig] = useState({ key: "commence_time", dir: "desc" });
  const weeks = useMemo(() => weeksIn(games), [games]);
  const [week, setWeek] = useState(() => latestGradedWeek(games, (g) => g.result));
  const [team, setTeam] = useState("");

  // The default is derived from data that arrives after the first render, so
  // settle on it once the rows are in rather than leaving the view on "all".
  const settledRef = useRef(false);
  useEffect(() => {
    if (!settledRef.current && games.length > 0) {
      settledRef.current = true;
      setWeek(latestGradedWeek(games, (g) => g.result));
    }
  }, [games]);

  function onSort(key) {
    setSortConfig(prev => prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" });
  }

  const teams = useMemo(() => {
    const set = new Set();
    for (const g of games) {
      if (g.home_abbr) set.add(g.home_abbr);
      if (g.away_abbr) set.add(g.away_abbr);
    }
    return [...set].sort();
  }, [games]);

  const shown = useMemo(() => games.filter(
    (g) => (week === "all" || g.nfl_week === week) &&
           (!team || g.home_abbr === team || g.away_abbr === team)
  ), [games, week, team]);

  if (!games.length) {
    return <div className="odds-empty">No results yet — lines will appear here after games are snapshotted and played.</div>;
  }

  return (
    <>
      <div className="odds-filter-bar">
        <WeekSelect value={week} onChange={setWeek} weeks={weeks} />
        <label className="odds-filter">
          Team
          <select value={team} onChange={(e) => setTeam(e.target.value)}>
            <option value="">All</option>
            {teams.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <span className="odds-filter-count">{shown.length} of {games.length}</span>
      </div>
      {shown.length === 0 ? (
        <div className="odds-empty">No games match these filters.</div>
      ) : (
        <div className="odds-table-wrap">
          <ResultsRows games={shown} sortConfig={sortConfig} onSort={onSort} />
        </div>
      )}
    </>
  );
}

// ─── Prop Results (model scorecard) ──────────────────────────────────────────

function pct(v) {
  return v == null ? "—" : `${(v * 100).toFixed(1)}%`;
}

// Hit rates are only meaningful once there is a real sample behind them.
const MIN_SAMPLE = 20;

function HitRate({ value, n }) {
  if (value == null) return <span className="odds-hit-none">—</span>;
  const thin = n < MIN_SAMPLE;
  // >50% is the only bar that matters: better than a coin flip against the line
  const cls = thin ? "odds-hit-thin" : value > 0.5 ? "odds-hit-good" : "odds-hit-bad";
  return (
    <span className={cls} title={thin ? `Only ${n} graded — too few to read into` : `${n} graded`}>
      {pct(value)}{thin && " *"}
    </span>
  );
}

function PropResultsTable({ data }) {
  const [sortConfig, setSortConfig] = useState({ key: "commence_time", dir: "desc" });
  function onSort(key) {
    setSortConfig(prev => prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" });
  }
  const sh = (label, key, cls, title) => (
    <SortHeader label={label} sortKey={key} sortConfig={sortConfig} onSort={onSort} className={cls} title={title} />
  );

  const rows = useMemo(() => (data?.results || []).map(r => ({
    ...r,
    market_label: MARKET_LABELS[r.market] || r.market,
    outcome: r.result?.outcome,
    call_correct: r.result?.call_correct,
    line_moved: r.first_line != null && r.line != null ? r.line - r.first_line : null,
  })), [data]);

  const weeks = useMemo(() => weeksIn(rows), [rows]);
  const [week, setWeek] = useState("all");
  const [player, setPlayer] = useState("");
  const [market, setMarket] = useState("");
  const [team, setTeam] = useState("");
  const [gradedOnly, setGradedOnly] = useState(false);

  const settledRef = useRef(false);
  useEffect(() => {
    if (!settledRef.current && rows.length > 0) {
      settledRef.current = true;
      setWeek(latestGradedWeek(rows, (r) => r.result));
    }
  }, [rows]);

  const teams = useMemo(
    () => [...new Set(rows.map((r) => r.team).filter(Boolean))].sort(),
    [rows]
  );
  const markets = useMemo(
    () => [...new Set(rows.map((r) => r.market).filter(Boolean))]
      .sort((a, b) => Object.keys(MARKET_LABELS).indexOf(a) - Object.keys(MARKET_LABELS).indexOf(b)),
    [rows]
  );

  const shown = useMemo(() => rows.filter(
    (r) => (week === "all" || r.nfl_week === week) &&
           (!player || r.name?.toLowerCase().includes(player.toLowerCase())) &&
           (!market || r.market === market) &&
           (!team || r.team === team) &&
           (!gradedOnly || r.result)
  ), [rows, week, player, market, team, gradedOnly]);

  const sorted = useSortedData(shown, sortConfig);

  // Hit rates describe what is on screen, so filtering to a market or a week
  // answers "how good are we at this" rather than always restating the season.
  const s = useMemo(() => {
    const calls = shown.filter((r) => r.result?.call_correct != null);
    const sides = shown.filter((r) => r.result?.projection_side_correct != null);
    const rate = (subset, key) =>
      subset.length ? Math.round((subset.filter((r) => r.result[key]).length / subset.length) * 1000) / 1000 : null;
    return {
      snapshots: shown.length,
      graded: shown.filter((r) => r.result).length,
      flagged_calls: calls.length,
      flagged_hit_rate: rate(calls, "call_correct"),
      all_sides: sides.length,
      side_hit_rate: rate(sides, "projection_side_correct"),
    };
  }, [shown]);

  return (
    <>
      <div className="odds-filter-bar">
        <WeekSelect value={week} onChange={setWeek} weeks={weeks} />
        <label className="odds-filter">
          Player
          <input
            type="text"
            value={player}
            onChange={(e) => setPlayer(e.target.value)}
            placeholder="name"
          />
        </label>
        <label className="odds-filter">
          Market
          <select value={market} onChange={(e) => setMarket(e.target.value)}>
            <option value="">All</option>
            {markets.map((m) => (
              <option key={m} value={m}>{MARKET_LABELS[m] || m}</option>
            ))}
          </select>
        </label>
        <label className="odds-filter">
          Team
          <select value={team} onChange={(e) => setTeam(e.target.value)}>
            <option value="">All</option>
            {teams.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label className="odds-filter odds-filter-check">
          <input
            type="checkbox"
            checked={gradedOnly}
            onChange={(e) => setGradedOnly(e.target.checked)}
          />
          Graded only
        </label>
        <span className="odds-filter-count">{shown.length} of {rows.length}</span>
      </div>
      <div className="odds-scorecard">
        <div className="odds-score-card">
          <div className="odds-score-label">Snapshots</div>
          <div className="odds-score-val">{s?.snapshots ?? 0}</div>
          <div className="odds-score-sub">{s?.graded ?? 0} graded</div>
        </div>
        <div className="odds-score-card">
          <div className="odds-score-label" title="Of the props we flagged as value, how often the call was right">
            Flagged hit rate
          </div>
          <div className="odds-score-val"><HitRate value={s?.flagged_hit_rate} n={s?.flagged_calls ?? 0} /></div>
          <div className="odds-score-sub">{s?.flagged_calls ?? 0} calls</div>
        </div>
        <div className="odds-score-card">
          <div className="odds-score-label" title="Across every prop, how often the projection landed on the correct side of the line">
            All-sides hit rate
          </div>
          <div className="odds-score-val"><HitRate value={s?.side_hit_rate} n={s?.all_sides ?? 0} /></div>
          <div className="odds-score-sub">{s?.all_sides ?? 0} sides</div>
        </div>
      </div>

      {s?.graded === 0 && (
        <div className="odds-note">
          Lines are being captured, but no games have been played yet — hit rates appear once results land.
        </div>
      )}

      {data?.by_market && Object.keys(data.by_market).length > 0 && (
        <div className="odds-table-wrap">
          <table className="odds-table">
            <thead>
              <tr>
                <th>Market</th><th className="num">Snapshots</th><th className="num">Graded</th>
                <th className="num">Flagged hit</th><th className="num">All-sides hit</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(data.by_market).map(([m, v]) => (
                <tr key={m}>
                  <td className="odds-market-label">{MARKET_LABELS[m] || m}</td>
                  <td className="num">{v.snapshots}</td>
                  <td className="num">{v.graded}</td>
                  <td className="num"><HitRate value={v.flagged_hit_rate} n={v.flagged_calls} /></td>
                  <td className="num"><HitRate value={v.side_hit_rate} n={v.all_sides} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3 className="odds-week-header">Captured props</h3>
      <div className="odds-table-wrap">
        <table className="odds-table">
          <thead>
            <tr>
              {sh("Wk", "nfl_week", "num")}
              {sh("Date", "commence_time", "num")}
              {sh("Player", "name")}
              {sh("Pos", "position", "pos-col")}
              {sh("Team", "team")}
              {sh("Market", "market_label")}
              {sh("Line", "line", "num", "Last line seen before kickoff")}
              {sh("Move", "line_moved", "num", "How far the line moved after we first saw it")}
              {sh("Proj", "projection", "num", "Our matchup-adjusted projection")}
              {sh("Call", "value_flag")}
              {sh("Actual", "actual", "num")}
              {sh("Result", "outcome")}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => (
              <tr key={`${r.event_id}-${r.sleeper_id}-${r.market}-${i}`}
                  className={r.call_correct === true ? "value-over" : r.call_correct === false ? "value-under" : ""}>
                <td className="num">{r.nfl_week ?? "—"}</td>
                <td className="num odds-time">{fmtTime(r.commence_time)}</td>
                <td className="odds-player-name">{r.name}</td>
                <td className={`pos-col pos-${r.position?.toLowerCase()}`}>{r.position}</td>
                <td><TeamBadge team={r.team} /></td>
                <td className="odds-market-label">{MARKET_LABELS[r.market] || r.market}</td>
                <td className="num">{fmt(r.line)}</td>
                <td className="num">{r.line_moved == null || r.line_moved === 0 ? "—" : (r.line_moved > 0 ? `+${fmt(r.line_moved)}` : fmt(r.line_moved))}</td>
                <td className="num">{fmt(r.projection)}</td>
                <td className="num">
                  {r.value_flag ? (
                    <span className={`value-badge value-badge-${r.value_flag}`}>
                      {r.value_flag === "over" ? "▲" : "▼"}
                    </span>
                  ) : "—"}
                </td>
                <td className="num">{fmt(r.actual)}</td>
                <td className="num">
                  {r.outcome ? (
                    <span className={`value-badge value-badge-${r.outcome === "push" ? "push" : r.outcome}`}>
                      {r.outcome.toUpperCase()}
                    </span>
                  ) : <span className="odds-hit-none">pending</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ─── Main Odds Component ─────────────────────────────────────────────────────

export default function Odds() {
  const [tab, setTab] = useState("games");
  const [gamesData, setGamesData] = useState([]);
  const [propsData, setPropsData] = useState([]);
  const [resultsData, setResultsData] = useState(null);
  const [status, setStatus] = useState(null);
  const [posFilter, setPosFilter] = useState("ALL");
  const [marketFilter, setMarketFilter] = useState("ALL");
  const [valueOnly, setValueOnly] = useState(false);
  const [weeklyView, setWeeklyView] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [nameFilter, setNameFilter] = useState("");
  const [teamFilter, setTeamFilter] = useState(null);
  const [teamsOpen, setTeamsOpen] = useState(false);
  const [propResults, setPropResults] = useState(null);

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

  const fetchResults = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch(`${BASE_URL}/odds/results`)
      .then(r => r.json())
      .then(data => { setResultsData(data); setLoading(false); })
      .catch(() => { setError("Failed to load results."); setLoading(false); });
  }, []);

  useEffect(() => {
    fetchStatus();
    fetchGames();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (tab === "props") fetchProps();
  }, [tab, posFilter, marketFilter, valueOnly]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (tab === "results" && resultsData === null) fetchResults();
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchPropResults = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch(`${BASE_URL}/odds/prop-results`)
      .then(r => r.json())
      .then(data => { setPropResults(data); setLoading(false); })
      .catch(() => { setError("Failed to load prop results."); setLoading(false); });
  }, []);

  useEffect(() => {
    if (tab === "propresults" && propResults === null) fetchPropResults();
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredPropsData = useMemo(() => {
    return propsData.filter(p =>
      (!nameFilter || p.name?.toLowerCase().includes(nameFilter.toLowerCase())) &&
      (!teamFilter || p.team === teamFilter)
    );
  }, [propsData, nameFilter, teamFilter]);

  // After a manual refresh, reload whichever table is on screen
  const refetchActiveTab = useCallback(() => {
    if (tab === "games") fetchGames();
    else if (tab === "props") fetchProps();
    else if (tab === "results") fetchResults();
    else if (tab === "propresults") fetchPropResults();
  }, [tab, fetchGames, fetchProps, fetchResults, fetchPropResults]);

  const noData = tab === "games"
    ? gamesData.length === 0
    : tab === "props"
    ? filteredPropsData.length === 0
    : false;

  return (
    <div className="odds-page">

      {/* Header with status */}
      <div className="odds-header">
        <div className="odds-tab-toggle">
          <button className={`odds-tab-btn ${tab === "games" ? "active" : ""}`} onClick={() => { setTab("games"); setError(null); setLoading(false); }}>
            Game Lines
          </button>
          <button className={`odds-tab-btn ${tab === "props" ? "active" : ""}`} onClick={() => { setTab("props"); setError(null); setLoading(false); }}>
            Player Props
          </button>
          <button className={`odds-tab-btn ${tab === "results" ? "active" : ""}`} onClick={() => { setTab("results"); setError(null); setLoading(false); }}>
            Results
          </button>
          <button className={`odds-tab-btn ${tab === "propresults" ? "active" : ""}`} onClick={() => { setTab("propresults"); setError(null); setLoading(false); }}>
            Prop Results
          </button>
        </div>
        {tab !== "results" && tab !== "propresults" && (
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
        )}

        {status && (
          <div className="odds-status">
            {status.last_updated
              ? <span>Updated {fmtTime(status.last_updated)}</span>
              : <span className="odds-no-data">No data yet — trigger a refresh via admin</span>
            }
            {status.data_age_hours != null && (
              <span className="odds-age" title="How old the odds currently being shown are">
                {fmtAge(status.data_age_hours)} old
              </span>
            )}
            {status.overdue_hours != null && (
              <span className="odds-overdue" title="A scheduled refresh did not run">
                ⚠ refresh overdue by {fmtAge(status.overdue_hours)}
              </span>
            )}
            {status.refresh_paused ? (
              <span className="odds-paused" title={status.refresh_note || ""}>
                auto-refresh paused
              </span>
            ) : status.next_refresh && (
              <span className="odds-next" title={fmtTime(status.next_refresh)}>
                next {fmtCountdown(status.next_refresh)}
              </span>
            )}
            {status.value_flag_count > 0 && (
              <span className="odds-value-count">{status.value_flag_count} value flags</span>
            )}
            <PrivilegedOnly>
              <>
                {status.credits_remaining != null && (
                  <span className="odds-credits">{status.credits_remaining} credits left</span>
                )}
                <RefreshButton onDone={() => { fetchStatus(); refetchActiveTab(); }} />
              </>
            </PrivilegedOnly>
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
              <React.Fragment key={m}>
                {m === ANYTIME_TD && <span className="odds-market-sep" aria-hidden="true" />}
                <button
                  className={`odds-market-tab ${marketFilter === m ? "active" : ""}`}
                  onClick={() => setMarketFilter(m)}
                >
                  {MARKET_LABELS[m] || m}
                </button>
              </React.Fragment>
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
          <input
            className="odds-name-filter"
            type="text"
            placeholder="Search player…"
            value={nameFilter}
            onChange={e => setNameFilter(e.target.value)}
          />
          <div className="odds-team-filter">
            <button
              className={`odds-teams-toggle ${teamFilter ? "active" : ""}`}
              onClick={() => setTeamsOpen(o => !o)}
            >
              Teams{teamFilter ? `: ${teamFilter}` : ""}
              {teamFilter && (
                <span
                  className="odds-teams-clear"
                  onClick={e => { e.stopPropagation(); setTeamFilter(null); }}
                > ×</span>
              )}
            </button>
            {teamsOpen && (
              <div className="odds-team-icon-bar">
                {Object.keys(TEAM_COLORS).sort().map(team => (
                  <button
                    key={team}
                    className="odds-team-icon-btn"
                    onClick={() => {
                      setTeamFilter(f => f === team ? null : team);
                      setTeamsOpen(false);
                    }}
                  >
                    <TeamBadge team={team} />
                  </button>
                ))}
              </div>
            )}
          </div>
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
          {tab === "props" && <PropsTable players={filteredPropsData} marketFilter={marketFilter === "ALL" ? null : marketFilter} weeklyView={weeklyView} />}
          {tab === "results" && <ResultsTable games={resultsData || []} />}
          {tab === "propresults" && <PropResultsTable data={propResults} />}
        </>
      )}
    </div>
  );
}

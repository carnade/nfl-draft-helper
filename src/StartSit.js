import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./StartSit.css";
import { getDvpColor } from "./dvpColor";
import { useSleeperAuth } from "./auth";
import { projectedPoints, hasProjection, fetchWeekProjectionsUrl } from "./leagueScoring";
import { evaluateLineup, countActionable, isEligible } from "./startSitModel";

const SEASON = 2026;
const BASE_URL = process.env.REACT_APP_MOCK
  ? "http://localhost:5000"
  : "https://shaggy-latashia-carnade-2ea2054a.koyeb.app";

// Sleeper and nflverse spell a few teams differently.
const TEAM_ABBR_MAP = { LAR: "LA", WSH: "WAS", JAC: "JAX" };
const nflverseTeam = (team) => TEAM_ABBR_MAP[team] || team;

// nflverse only ranks defences against these positions.
const DVP_POSITIONS = new Set(["qb", "rb", "wr", "te"]);

const PROJECTION_TTL_MS = 30 * 60 * 1000;
const DFS_TTL_MS = 60 * 60 * 1000;

function readCache(key, ttl) {
  try {
    const raw = sessionStorage.getItem(key);
    const at = sessionStorage.getItem(`${key}_timestamp`);
    if (!raw || !at || Date.now() - parseInt(at, 10) > ttl) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeCache(key, value) {
  // Storage can be full or blocked; the page works without it.
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
    sessionStorage.setItem(`${key}_timestamp`, Date.now().toString());
  } catch {
    /* ignore */
  }
}

// Sleeper publishes ~3300 rows a week but only a few hundred carry a real
// projection. Keep just what a lineup needs, so this fits in sessionStorage —
// the raw payload is over 2 MB and would blow the quota.
function reduceProjections(rows) {
  const out = {};
  for (const row of Array.isArray(rows) ? rows : []) {
    const player = row.player || {};
    out[String(row.player_id)] = {
      stats: row.stats || null,
      team: row.team || player.team_abbr || player.team || null,
      opponent: row.opponent || null,
      name: [player.first_name, player.last_name].filter(Boolean).join(" ").trim(),
      position: player.position || null,
      fantasyPositions: player.fantasy_positions || null,
      injuryStatus: player.injury_status || null,
    };
  }
  return out;
}

// DFS rows are keyed "{id}_W{week}_D{date}"; index them by player, keeping the
// earliest game so a player is judged against the game they actually play next.
function indexDfs(data) {
  const out = {};
  for (const row of Object.values(data || {})) {
    const id = row?.sleeper_id;
    if (!id) continue;
    const existing = out[id];
    if (!existing || String(row.game_date || "") < String(existing.game_date || "")) {
      out[id] = row;
    }
  }
  return out;
}

// A game that is no longer "pre_game" cannot be changed, so everyone playing in
// it is locked. Using Sleeper's own status avoids parsing kickoff times and the
// timezone guesswork that comes with them.
function lockedTeamsFor(schedule, week) {
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

function fmt(value, decimals = 1) {
  if (value == null || value === "" || Number.isNaN(Number(value))) return "—";
  return Number(value).toFixed(decimals);
}

function TeamCell({ team, opponent }) {
  if (!team) return <span className="ss-muted">—</span>;
  return (
    <span className="ss-matchup">
      {team}
      {opponent ? <span className="ss-vs"> vs {opponent}</span> : <span className="ss-vs ss-bye"> bye</span>}
    </span>
  );
}

function DvpCell({ rank }) {
  if (!rank) return <span className="ss-muted">—</span>;
  const color = getDvpColor(rank);
  return (
    <span style={color ? { color, fontWeight: 600 } : undefined} title="Opponent rank vs this position (1 = toughest)">
      {rank}
    </span>
  );
}

function StatusCell({ player }) {
  const status = player?.status;
  if (!status) return <span className="ss-muted">—</span>;
  return <span className={`ss-status ss-status-${String(status).replace(/\s+/g, "")}`}>{status}</span>;
}

const VERDICT_LABEL = {
  sit: "Sit",
  start: "Start",
  tossup: "Toss-up",
  locked: "Locked",
};

function VerdictCell({ row }) {
  const label = VERDICT_LABEL[row.verdict] || "—";
  const reason =
    row.verdict === "sit" && row.reason === "out" ? "not playing"
      : row.verdict === "sit" && row.reason === "bye" ? "on bye"
      : row.verdict === "sit" && row.reason === "empty" ? "slot empty"
      : row.verdict === "sit" && row.reason === "no projection" ? "no projection"
      : null;
  return (
    <span className={`ss-verdict ss-verdict-${row.verdict}`} title={reason || undefined}>
      {row.verdict === "locked" ? "🔒 " : ""}{label}
    </span>
  );
}

function SuggestionCell({ row }) {
  if (row.verdict === "locked") return <span className="ss-muted">—</span>;
  if (row.noReplacement) return <span className="ss-muted">no eligible replacement</span>;
  if (!row.suggestion) return <span className="ss-muted">—</span>;
  const delta = row.delta;
  return (
    <span className="ss-suggestion">
      → {row.suggestion.name}
      {delta != null && <span className="ss-delta"> (+{delta.toFixed(1)})</span>}
    </span>
  );
}

function PlayerRow({ row }) {
  const p = row.starter;
  return (
    <tr className={`ss-row ss-row-${row.verdict}`}>
      <td className="ss-slot">{row.slot}</td>
      <td className="ss-player">
        {p ? p.name : <span className="ss-muted">empty</span>}
        {p?.position && <span className="ss-pos"> {p.position}</span>}
      </td>
      <td><TeamCell team={p?.team} opponent={p?.opponent} /></td>
      <td className="ss-num" title={p && !p.hasProjection ? "Sleeper has no projection for this player" : undefined}>
        {p?.hasProjection ? fmt(p.proj) : <span className="ss-muted">—</span>}
      </td>
      <td className="ss-num"><DvpCell rank={p?.dvpRank} /></td>
      <td className="ss-num">{fmt(p?.l5)}</td>
      <td><StatusCell player={p} /></td>
      <td><VerdictCell row={row} /></td>
      <td className="ss-suggestion-cell"><SuggestionCell row={row} /></td>
    </tr>
  );
}

function BenchRow({ player, slots }) {
  const fits = [...new Set(slots.filter((slot) => isEligible(slot, player)))];
  return (
    <tr className="ss-row ss-row-bench">
      <td className="ss-slot ss-muted">{fits.length ? fits.join(", ") : "—"}</td>
      <td className="ss-player">
        {player.name}
        {player.position && <span className="ss-pos"> {player.position}</span>}
      </td>
      <td><TeamCell team={player.team} opponent={player.opponent} /></td>
      <td className="ss-num">{player.hasProjection ? fmt(player.proj) : <span className="ss-muted">—</span>}</td>
      <td className="ss-num"><DvpCell rank={player.dvpRank} /></td>
      <td className="ss-num">{fmt(player.l5)}</td>
      <td><StatusCell player={player} /></td>
      <td className="ss-muted">bench</td>
      <td />
    </tr>
  );
}

function LeagueCard({ league, onlyActionable }) {
  const [showBench, setShowBench] = useState(false);
  const { rows, bench, slots, flagged } = league;
  const shown = onlyActionable ? rows.filter((r) => r.verdict === "sit") : rows;

  return (
    <section className="ss-card">
      <header className="ss-card-head">
        <h3 className="ss-league-name">{league.name}</h3>
        <span className={`ss-flag-count ${flagged ? "ss-flag-on" : ""}`}>
          {flagged ? `${flagged} to look at` : "lineup looks right"}
        </span>
      </header>
      <div className="ss-table-wrap">
        <table className="ss-table">
          <thead>
            <tr>
              <th>Slot</th><th>Player</th><th>Matchup</th>
              <th className="ss-num">Proj</th><th className="ss-num">DvP</th><th className="ss-num">L5</th>
              <th>Status</th><th>Verdict</th><th>Suggestion</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => <PlayerRow key={`${row.slot}-${row.index}`} row={row} />)}
            {showBench && bench.map((p) => <BenchRow key={p.id} player={p} slots={slots} />)}
          </tbody>
        </table>
      </div>
      {bench.length > 0 && (
        <button className="ss-bench-toggle" onClick={() => setShowBench((v) => !v)}>
          {showBench ? "▼" : "►"} Bench ({bench.length})
        </button>
      )}
    </section>
  );
}

function StartSit({ userName }) {
  const auth = useSleeperAuth();
  const [week, setWeek] = useState(null);
  const [leagues, setLeagues] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [onlyActionable, setOnlyActionable] = useState(false);
  const [problems, setProblems] = useState([]);
  const projectionsRef = useRef(null);

  const displayName = auth?.display_name || userName;

  const load = useCallback(async (name, signal) => {
    setLoading(true);
    setError(null);
    try {
      const state = await fetch("https://api.sleeper.app/v1/state/nfl", { signal }).then((r) => r.json());
      const currentWeek = state?.week > 0 ? state.week : 1;
      setWeek(currentWeek);

      const user = await fetch(`https://api.sleeper.app/v1/user/${name}`, { signal }).then((r) => r.json());
      if (!user?.user_id) throw new Error(`No Sleeper user called "${name}"`);

      const allLeagues = await fetch(
        `https://api.sleeper.app/v1/user/${user.user_id}/leagues/nfl/${SEASON}`,
        { signal }
      ).then((r) => r.json());

      // Head-to-head only: best ball has no lineup to set.
      const playable = (Array.isArray(allLeagues) ? allLeagues : []).filter((l) => {
        const t = l.settings?.type;
        return (t === 0 || t === 2) && l.settings?.best_ball !== 1;
      });
      if (playable.length === 0) {
        setLeagues([]);
        return;
      }

      const projKey = `sleeper_proj_week_${currentWeek}`;
      const dfsKey = `dfs_projections_week_${currentWeek}`;

      // Everything below that comes from our own backend is optional: the page is
      // still useful without it, but a silently blank column is indistinguishable
      // from a player having no data, so failures are collected and shown.
      const failed = [];

      const [projections, dfsRaw, teamStats, schedule, rosterLists] = await Promise.all([
        (async () => {
          if (projectionsRef.current?.week === currentWeek) return projectionsRef.current.data;
          const cached = readCache(projKey, PROJECTION_TTL_MS);
          if (cached) return cached;
          const rows = await fetch(fetchWeekProjectionsUrl(SEASON, currentWeek), { signal }).then((r) => r.json());
          const reduced = reduceProjections(rows);
          writeCache(projKey, reduced);
          return reduced;
        })(),
        (async () => {
          const cached = readCache(dfsKey, DFS_TTL_MS);
          if (cached) return cached;
          // Only the current week is kept server-side; an older week 404s and the
          // page simply goes without recent-form numbers.
          try {
            const res = await fetch(`${BASE_URL}/dfs-salaries/week/${currentWeek}`, { signal });
            if (!res.ok) throw new Error(String(res.status));
            const data = await res.json();
            writeCache(dfsKey, data);
            return data;
          } catch (err) {
            if (err.name !== "AbortError") failed.push("recent form");
            return {};
          }
        })(),
        fetch(`${BASE_URL}/stats/teams`, { signal })
          .then((r) => {
            if (!r.ok) throw new Error(String(r.status));
            return r.json();
          })
          // Older backends wrap this in {teams: [...]}; accept either shape.
          .then((d) => (Array.isArray(d) ? d : d?.teams || []))
          .catch((err) => {
            if (err.name !== "AbortError") failed.push("matchup ranks");
            return [];
          }),
        fetch(`https://api.sleeper.app/schedule/nfl/regular/${SEASON}`, { signal })
          .then((r) => (r.ok ? r.json() : [])).catch(() => []),
        Promise.all(
          playable.map((l) =>
            fetch(`https://api.sleeper.app/v1/league/${l.league_id}/rosters`, { signal })
              .then((r) => r.json())
              .catch(() => [])
          )
        ),
      ]);

      projectionsRef.current = { week: currentWeek, data: projections };

      const dfsById = indexDfs(dfsRaw);
      const locked = lockedTeamsFor(schedule, currentWeek);
      const teamByAbbr = {};
      for (const t of Array.isArray(teamStats) ? teamStats : []) {
        if (t?.team) teamByAbbr[t.team] = t;
      }

      // One metadata call for every rostered player across every league. It is the
      // freshest injury source we have — the backend refreshes it hourly on gamedays.
      const rosters = playable.map((l, i) => {
        const list = Array.isArray(rosterLists[i]) ? rosterLists[i] : [];
        return list.find((r) => r.owner_id === user.user_id) || null;
      });
      const everyId = new Set();
      rosters.forEach((r) => (r?.players || []).forEach((id) => everyId.add(id)));

      let meta = {};
      if (everyId.size > 0) {
        meta = await fetch(`${BASE_URL}/getplayers/data`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ playerlist: [...everyId] }),
          signal,
        })
          .then((r) => {
            if (!r.ok) throw new Error(String(r.status));
            return r.json();
          })
          .then((d) => d.players || d || {})
          .catch((err) => {
            if (err.name !== "AbortError") failed.push("injury status");
            return {};
          });
      }

      const built = playable.map((league, i) => {
        const roster = rosters[i];
        const starters = roster?.starters || [];
        const reserve = roster?.reserve || [];
        const taxi = roster?.taxi || [];
        const all = roster?.players || [];
        const bench = all.filter(
          (id) => !starters.includes(id) && !reserve.includes(id) && !taxi.includes(id)
        );

        const playerById = {};
        for (const id of new Set([...all, ...starters])) {
          if (!id || id === "0") continue;
          const proj = projections[String(id)] || {};
          const info = meta[id] || {};
          const dfs = dfsById[id] || {};
          const position = proj.position || info.position || dfs.position || null;
          const team = proj.team || info.team || dfs.team || null;
          const opponent = proj.opponent || dfs.opponent || null;
          const status = info.injury_status || proj.injuryStatus || null;
          const posKey = String(position || "").toLowerCase();
          const oppStats = teamByAbbr[nflverseTeam(opponent)];

          playerById[id] = {
            id,
            name:
              proj.name ||
              [info.first_name, info.last_name].filter(Boolean).join(" ").trim() ||
              dfs.name ||
              id,
            position,
            fantasyPositions: proj.fantasyPositions || (position ? [position] : []),
            team,
            opponent,
            proj: projectedPoints(proj.stats, league.scoring_settings),
            hasProjection: hasProjection(proj.stats),
            status,
            // No opponent on a row Sleeper does project means the team is idle.
            onBye: status === "Bye" || (hasProjection(proj.stats) && !opponent),
            locked: !!team && locked.has(team),
            l5: dfs.l5_avg ?? null,
            l10: dfs.l10_avg ?? null,
            dvpRank: DVP_POSITIONS.has(posKey)
              ? oppStats?.def_rank_vs_position?.season?.[posKey] ?? null
              : null,
          };
        }

        const rows = evaluateLineup({
          rosterPositions: league.roster_positions || [],
          starters,
          bench,
          playerById,
        });

        return {
          id: league.league_id,
          name: league.name,
          // Same test the league page uses: type 2 is dynasty, 0 is redraft.
          isDynasty: league.settings?.type === 2,
          slots: rows.map((r) => r.slot),
          rows,
          bench: bench.map((id) => playerById[id]).filter(Boolean).sort((a, b) => (b.proj ?? 0) - (a.proj ?? 0)),
          flagged: countActionable(rows),
        };
      });

      built.sort(
        (a, b) =>
          Number(b.isDynasty) - Number(a.isDynasty) ||
          b.flagged - a.flagged ||
          a.name.localeCompare(b.name)
      );
      setLeagues(built);
      setProblems(failed);
    } catch (err) {
      if (err.name !== "AbortError") setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!displayName) return undefined;
    const controller = new AbortController();
    load(displayName, controller.signal);
    return () => controller.abort();
  }, [displayName, load]);

  const totalFlagged = useMemo(
    () => leagues.reduce((n, l) => n + l.flagged, 0),
    [leagues]
  );

  const visible = useMemo(
    () => leagues.filter((l) => !onlyActionable || l.flagged > 0),
    [leagues, onlyActionable]
  );

  if (!displayName) {
    return (
      <div className="ss-page">
        <h1 className="ss-title">Start/Sit</h1>
        <p className="ss-empty">Set a user name, or connect your Sleeper account in Settings, to see your lineups.</p>
      </div>
    );
  }

  return (
    <div className="ss-page">
      <header className="ss-head">
        <h1 className="ss-title">
          Start/Sit{week ? <span className="ss-week"> — week {week}</span> : null}
        </h1>
        {!loading && leagues.length > 0 && (
          <div className="ss-summary">
            <span>{leagues.length} leagues</span>
            <span className={totalFlagged ? "ss-flag-on" : ""}>
              {totalFlagged} to look at
            </span>
            <label className="ss-filter">
              <input
                type="checkbox"
                checked={onlyActionable}
                onChange={(e) => setOnlyActionable(e.target.checked)}
              />
              Only show flagged
            </label>
          </div>
        )}
      </header>

      {!loading && problems.length > 0 && (
        <p className="ss-warning" title={BASE_URL}>
          Couldn't reach the stats backend for {problems.join(" and ")}, so those columns
          show “—”. Everything else comes straight from Sleeper and is unaffected.
        </p>
      )}

      {loading && <p className="ss-empty">Reading your lineups…</p>}
      {error && <p className="ss-error">{error}</p>}
      {!loading && !error && leagues.length === 0 && (
        <p className="ss-empty">No head-to-head leagues found for {displayName}.</p>
      )}

      {!loading && visible.map((league, i) => {
        const previous = visible[i - 1];
        const startsGroup = !previous || previous.isDynasty !== league.isDynasty;
        return (
          <React.Fragment key={league.id}>
            {startsGroup && (
              <h2 className="ss-group-header">{league.isDynasty ? "Dynasty" : "Redraft"}</h2>
            )}
            <LeagueCard league={league} onlyActionable={onlyActionable} />
          </React.Fragment>
        );
      })}

      {!loading && leagues.length > 0 && (
        <p className="ss-footnote">
          Projections are Sleeper's, priced with each league's own scoring. A suggestion means
          the bench player projects at least a point higher — small gaps sit inside the
          projection's own error, so treat them as a prompt to look, not an instruction.
          One player is only ever suggested for one slot.
        </p>
      )}
    </div>
  );
}

export default StartSit;

// The Contender Helper: what a trade does to the weeks that are left.
//
// Thin on purpose. The arithmetic is in contenderModel.js and the fetching in
// contenderLoad.js; what is here is the two boxes, the league picker, and the
// wiring between them.
//
// Two things about this tab that are not obvious from the markup:
//
//   It fetches nothing until it is opened. The Trade Helper page keeps all
//   three tabs mounted so the trade survives switching between them, which
//   means a mounted-but-hidden tab would otherwise download on every visit to
//   the page. `active` going true once is what releases the fetches.
//
//   It opens on points per game, not projections. Both are what the user asked
//   for, but one costs 200 KB and the other 2.1 MB a week across an eight-week
//   horizon, so the expensive one waits to be asked for.
//
// The look is borrowed: `.trade-panel` and friends are global classes from
// TradeAnalyzer.css, so the two tabs match without TradeAnalyzer being touched.
// Only what is genuinely new here takes a `ch-` prefix.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSearch, faTimes } from "@fortawesome/free-solid-svg-icons";

import "./ContenderTab.css";
import PositionPill from "./PositionPill";
import { getCurrentWeek } from "./currentWeekCache";
import { nameRank } from "./playerSearch";
import { nflverseTeam } from "./nflSchedule";
import { orderLeagues } from "./leagueOrder";
import { projectedPoints } from "./leagueScoring";
import { fptsPerGame } from "./playerForm";
import { rankColor } from "./dvpColor";
import { ordinal } from "./ordinal";
import {
  averageSos,
  byeStatusFor,
  byeWeekByTeam,
  inferPartner,
  rankAmong,
  representativeLineup,
  tradeImpact,
  windowsFor,
} from "./contenderModel";
import * as load from "./contenderLoad";

const SOS_BASES = ["2026", "2025", "vspos"];
const SOS_LABEL = { 2026: "this year", 2025: "last year", vspos: "vs position" };
const MAX_RESULTS = 8;

const fmt = (n, digits = 1) =>
  typeof n === "number" && Number.isFinite(n) ? n.toFixed(digits) : "–";

const signed = (n, digits = 1) =>
  typeof n === "number" && Number.isFinite(n)
    ? `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(digits)}`
    : "–";

/** A win rate reads as a percentage; points allowed reads as a score. */
const sosFigure = (value, basis) => {
  if (typeof value !== "number" || !Number.isFinite(value)) return "–";
  return basis === "vspos" ? value.toFixed(1) : `${Math.round(value * 100)}%`;
};

const weekSpan = (weeks) => {
  if (!weeks || weeks.length === 0) return "none left";
  const first = weeks[0];
  const last = weeks[weeks.length - 1];
  return first === last ? `wk ${first}` : `wk ${first}–${last}`;
};

function ContenderTab({ userName, active = false }) {
  // Opened once is opened for good: the pane stays mounted after the first
  // visit, and so should its data.
  const opened = useRef(false);
  if (active) opened.current = true;
  const live = opened.current;

  // Which league-and-horizon the projection loader has already run for.
  //
  // A ref rather than state on purpose: held in state it would be a dependency
  // of that effect, so marking the load as started would re-run the effect, and
  // the re-run's cleanup would abort the loop after its first week — seven
  // weeks silently missing, with no error anywhere to say so.
  const projKey = useRef(null);

  const [status, setStatus] = useState("idle");
  const [error, setError] = useState(null);

  const [userId, setUserId] = useState(null);
  const [leagues, setLeagues] = useState([]);
  const [leagueId, setLeagueId] = useState("");
  const [currentWeek, setCurrentWeek] = useState(null);
  const [schedule, setSchedule] = useState([]);

  const [rosters, setRosters] = useState([]);
  const [users, setUsers] = useState([]);
  const [meta, setMeta] = useState({});
  const [seasonStats, setSeasonStats] = useState({});
  const [sos, setSos] = useState({ byTeam: {}, byPlayer: {} });
  const [detailStatus, setDetailStatus] = useState("idle");

  const [give, setGive] = useState([]);
  const [take, setTake] = useState([]);
  const [queries, setQueries] = useState({ give: "", take: "" });

  const [basis, setBasis] = useState("ppg");
  const [sosBasis, setSosBasis] = useState("2026");
  const [projections, setProjections] = useState({});
  const [projStatus, setProjStatus] = useState("idle");
  const [projDone, setProjDone] = useState(0);

  // ── Loading ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!live || !userName) return undefined;
    const controller = new AbortController();
    let alive = true;

    (async () => {
      setStatus("loading");
      try {
        const [week, found, fixtures] = await Promise.all([
          getCurrentWeek(),
          load.loadLeagues(userName, { signal: controller.signal }),
          load.loadSchedule({ signal: controller.signal }),
        ]);
        if (!alive) return;
        setCurrentWeek(week);
        setUserId(found.userId);
        setLeagues(found.leagues);
        setSchedule(fixtures);
        setStatus("ready");
      } catch (e) {
        if (!alive || e.name === "AbortError") return;
        setError(e.message);
        setStatus("failed");
      }
    })();

    return () => {
      alive = false;
      controller.abort();
    };
  }, [live, userName]);

  const league = useMemo(
    () => leagues.find((l) => String(l.league_id) === String(leagueId)) || null,
    [leagues, leagueId]
  );

  useEffect(() => {
    if (!live || !league) return undefined;
    const controller = new AbortController();
    let alive = true;

    (async () => {
      setDetailStatus("loading");
      try {
        const [detail, stats] = await Promise.all([
          load.loadLeagueDetail(league.league_id, { signal: controller.signal }),
          load.loadSeasonStats(league, { signal: controller.signal }),
        ]);
        if (!alive) return;
        setRosters(detail.rosters);
        setUsers(detail.users);
        setSeasonStats(stats);

        const ids = detail.rosters.flatMap((roster) => roster.players || []);
        // The schedule-strength rows are a nice-to-have: without them the page
        // loses the schedule column and keeps everything else, so a failure
        // there must not take the points figures down with it.
        const [players, strength] = await Promise.all([
          load.loadPlayerMeta(ids, { signal: controller.signal }),
          load.loadScheduleStrength({ signal: controller.signal }).catch(() => ({
            byTeam: {},
            byPlayer: {},
          })),
        ]);
        if (!alive) return;
        setMeta(players);
        setSos(strength);
        setDetailStatus("ready");
      } catch (e) {
        if (!alive || e.name === "AbortError") return;
        setError(e.message);
        setDetailStatus("failed");
      }
    })();

    return () => {
      alive = false;
      controller.abort();
    };
  }, [live, league]);

  // Switching league invalidates the trade: the players belong to the old one.
  useEffect(() => {
    setGive([]);
    setTake([]);
    setQueries({ give: "", take: "" });
    setProjections({});
    setProjStatus("idle");
    setProjDone(0);
    setBasis("ppg");
    projKey.current = null;
  }, [leagueId]);

  const windows = useMemo(
    () => windowsFor(currentWeek, league?.settings?.playoff_week_start),
    [currentWeek, league]
  );

  const horizon = useMemo(
    () => [...windows.regular, ...windows.playoffs],
    [windows]
  );

  // Projections are fetched one week at a time rather than eight at once: each
  // response is 2.1 MB and parsing eight in parallel visibly stalls the tab.
  //
  useEffect(() => {
    if (!live || basis !== "proj" || !league || horizon.length === 0) return undefined;

    const key = `${league.league_id}:${horizon.join(",")}`;
    if (projKey.current === key) return undefined;
    projKey.current = key;

    const controller = new AbortController();
    let alive = true;

    (async () => {
      setProjStatus("loading");
      setProjDone(0);
      const priced = {};
      let failures = 0;
      for (const week of horizon) {
        try {
          // eslint-disable-next-line no-await-in-loop
          priced[week] = await load.loadWeekProjections(league, week, {
            signal: controller.signal,
            currentWeek,
          });
        } catch (e) {
          if (!alive || e.name === "AbortError") return;
          failures += 1;
        }
        if (!alive) return;
        setProjDone((done) => done + 1);
        setProjections({ ...priced });
      }
      if (!alive) return;
      if (failures === horizon.length) {
        // Let the pill be clicked again to retry rather than being stuck.
        projKey.current = null;
        setProjStatus("failed");
      } else {
        setProjStatus("ready");
      }
    })();

    return () => {
      alive = false;
      controller.abort();
    };
  }, [live, basis, league, horizon, currentWeek]);

  // ── Reading the league ────────────────────────────────────────────────────

  const myRoster = useMemo(
    () =>
      rosters.find(
        (roster) =>
          String(roster.owner_id) === String(userId) ||
          (roster.co_owners || []).some((id) => String(id) === String(userId))
      ) || null,
    [rosters, userId]
  );

  const teamName = useCallback(
    (roster) => {
      const owner = users.find((user) => String(user.user_id) === String(roster?.owner_id));
      return owner?.metadata?.team_name || owner?.display_name || `Roster ${roster?.roster_id}`;
    },
    [users]
  );

  const rosterIdOf = useMemo(() => {
    const owners = {};
    for (const roster of rosters) {
      for (const id of roster.players || []) owners[String(id)] = roster.roster_id;
    }
    return (id) => (owners[String(id)] == null ? null : owners[String(id)]);
  }, [rosters]);

  const partner = useMemo(() => inferPartner(take, rosterIdOf), [take, rosterIdOf]);

  const partnerRoster = useMemo(
    () =>
      partner
        ? rosters.find((roster) => String(roster.roster_id) === String(partner.rosterId)) || null
        : null,
    [partner, rosters]
  );

  const positionsOf = useCallback(
    (id) => {
      const position = meta[String(id)]?.position;
      return position ? [position] : [];
    },
    [meta]
  );

  const teamOf = useCallback((id) => meta[String(id)]?.team || null, [meta]);

  const byeWeeks = useMemo(() => byeWeekByTeam(schedule), [schedule]);

  const scoring = league?.scoring_settings || {};

  const rates = useMemo(() => {
    const out = {};
    for (const id of Object.keys(meta)) {
      out[id] = fptsPerGame(seasonStats[id], scoring, projectedPoints);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta, seasonStats, league]);

  const pointsFor = useCallback(
    (id, week) => {
      if (basis === "proj") {
        const value = projections[week]?.[String(id)];
        return typeof value === "number" ? value : null;
      }
      const rate = rates[String(id)];
      return typeof rate === "number" && Number.isFinite(rate) ? rate : null;
    },
    [basis, projections, rates]
  );

  // ── The comparison ───────────────────────────────────────────────────────

  const shape = useMemo(
    () => ({
      rosterPositions: league?.roster_positions || [],
      positionsOf,
      pointsFor,
      teamOf,
      byeWeeks,
    }),
    [league, positionsOf, pointsFor, teamOf, byeWeeks]
  );

  const impactFor = useCallback(
    (roster, out, incoming, weeks) => {
      if (!roster || weeks.length === 0) return null;
      return tradeImpact({
        ...shape,
        playerIds: roster.players || [],
        give: out,
        get: incoming,
        weeks,
      });
    },
    [shape]
  );

  const mine = useMemo(
    () => ({
      regular: impactFor(myRoster, give, take, windows.regular),
      playoffs: impactFor(myRoster, give, take, windows.playoffs),
    }),
    [impactFor, myRoster, give, take, windows]
  );

  const theirs = useMemo(
    () => ({
      regular: impactFor(partnerRoster, take, give, windows.regular),
      playoffs: impactFor(partnerRoster, take, give, windows.playoffs),
    }),
    [impactFor, partnerRoster, take, give, windows]
  );

  // ── Strength of schedule ─────────────────────────────────────────────────

  const cellFor = useCallback(
    (window) => (id) => {
      if (sosBasis === "vspos") {
        // Already narrowed to the player's own position server-side, so it has
        // to be read from their row rather than from their team.
        return sos.byPlayer[String(id)]?.sos?.[window]?.vspos || null;
      }
      const team = nflverseTeam(teamOf(id));
      return sos.byTeam[team]?.[window]?.[sosBasis] || null;
    },
    [sos, sosBasis, teamOf]
  );

  // Which lineup the schedule is measured over is decided on the season rate,
  // whichever basis the points above are on. Two reasons: the rate is the
  // stable read on who you would field across a whole window, and a player
  // Sleeper does not project would otherwise drop out of the schedule average
  // as well as out of the points — losing his schedule, which we do know.
  const sosShape = useMemo(
    () => ({
      ...shape,
      pointsFor: (id) => {
        const rate = rates[String(id)];
        return typeof rate === "number" && Number.isFinite(rate) ? rate : null;
      },
    }),
    [shape, rates]
  );

  const lineupSos = useCallback(
    (roster, out, incoming, weeks, window) => {
      if (!roster || weeks.length === 0) return null;
      const lineup = representativeLineup({
        ...sosShape,
        playerIds: roster.players || [],
        weeks,
      });
      const after = representativeLineup({
        ...sosShape,
        playerIds: [
          ...(roster.players || []).map(String).filter((id) => !out.map(String).includes(id)),
          ...incoming.map(String),
        ],
        weeks,
      });
      const starters = (picked) => (picked?.assignments || []).map((slot) => slot.playerId);
      return {
        before: averageSos(starters(lineup), cellFor(window)),
        after: averageSos(starters(after), cellFor(window)),
      };
    },
    [sosShape, cellFor]
  );

  // Every roster's figure, so an average that has no rank of its own can be
  // given a real one: "3rd easiest of twelve" beats an uncoloured number.
  const leagueSos = useCallback(
    (weeks, window) => {
      if (weeks.length === 0) return [];
      return rosters
        .map((roster) => {
          const lineup = representativeLineup({
            ...sosShape,
            playerIds: roster.players || [],
            weeks,
          });
          const starters = (lineup?.assignments || []).map((slot) => slot.playerId);
          return averageSos(starters, cellFor(window)).value;
        })
        .filter((value) => value != null);
    },
    [rosters, sosShape, cellFor]
  );

  const schedules = useMemo(() => {
    const build = (roster, out, incoming) => ({
      regular: lineupSos(roster, out, incoming, windows.regular, "ros"),
      playoffs: lineupSos(roster, out, incoming, windows.playoffs, "post"),
    });
    return {
      mine: build(myRoster, give, take),
      theirs: build(partnerRoster, take, give),
      league: {
        regular: leagueSos(windows.regular, "ros"),
        playoffs: leagueSos(windows.playoffs, "post"),
      },
    };
  }, [lineupSos, leagueSos, myRoster, partnerRoster, give, take, windows]);

  // ── Search ────────────────────────────────────────────────────────────────

  const searchIn = useCallback(
    (rosterList, query, exclude) => {
      const text = String(query || "").trim();
      if (text.length < 2) return [];
      const taken = new Set(exclude.map(String));
      const hits = [];
      for (const roster of rosterList) {
        for (const raw of roster.players || []) {
          const id = String(raw);
          if (taken.has(id)) continue;
          const player = meta[id];
          if (!player) continue;
          const score = nameRank(text, player.first_name || "", player.last_name || "");
          if (score === null) continue;
          hits.push({ id, player, roster, score });
        }
      }
      return hits
        .sort(
          (a, b) =>
            a.score - b.score ||
            (b.player.pts_ppr || 0) - (a.player.pts_ppr || 0)
        )
        .slice(0, MAX_RESULTS);
    },
    [meta]
  );

  const otherRosters = useMemo(() => {
    const others = rosters.filter(
      (roster) => String(roster.roster_id) !== String(myRoster?.roster_id)
    );
    // Once the partner is settled, their side's search narrows to that manager.
    // Everything on offer then belongs to one team, which is what keeps the
    // inferred partner honest without a dropdown to disagree with.
    if (partnerRoster) {
      return others.filter(
        (roster) => String(roster.roster_id) === String(partnerRoster.roster_id)
      );
    }
    return others;
  }, [rosters, myRoster, partnerRoster]);

  const giveHits = searchIn(myRoster ? [myRoster] : [], queries.give, give);
  const takeHits = searchIn(otherRosters, queries.take, take);

  const addPlayer = (side, id) => {
    if (side === "give") setGive((ids) => [...ids, String(id)]);
    else setTake((ids) => [...ids, String(id)]);
    setQueries((q) => ({ ...q, [side]: "" }));
  };

  const removePlayer = (side, id) => {
    if (side === "give") setGive((ids) => ids.filter((held) => held !== String(id)));
    else setTake((ids) => ids.filter((held) => held !== String(id)));
  };

  // ── Render ───────────────────────────────────────────────────────────────

  if (!userName) {
    return <p className="ch-note">Set a Sleeper username to compare a trade in one of your leagues.</p>;
  }
  if (status === "failed") {
    return <p className="ch-note ch-error">Could not load your leagues: {error}</p>;
  }
  if (status !== "ready") {
    return <p className="ch-note">Loading your leagues…</p>;
  }

  const ordered = orderLeagues(leagues);

  const playerCard = (side, id) => {
    const player = meta[String(id)] || {};
    const team = player.team || null;
    const bye = byeStatusFor(team, byeWeeks, currentWeek);
    const rate = rates[String(id)];
    const owner = rosters.find((roster) => String(roster.roster_id) === String(rosterIdOf(id)));

    return (
      <div className="trade-player-card" key={id}>
        <div className="player-info">
          <div className="player-name">
            <PositionPill position={player.position} />{" "}
            {[player.first_name, player.last_name].filter(Boolean).join(" ") || id}
          </div>
          <div className="player-details">
            {team || "FA"}
            {side === "take" && owner ? ` · ${teamName(owner)}` : ""}
            {bye ? (
              <span className={bye.done ? "ch-bye-done" : "ch-bye-ahead"}>
                {bye.done ? "bye done" : `bye wk ${bye.week}`}
              </span>
            ) : null}
          </div>
        </div>
        <div className="player-value">
          <div className="value-row">
            <span className="value-label">Pts/g</span>
            <span className="value-proj">{fmt(rate)}</span>
          </div>
        </div>
        <button
          type="button"
          className="remove-player"
          aria-label={`Remove ${player.last_name || id}`}
          onClick={() => removePlayer(side, id)}
        >
          <FontAwesomeIcon icon={faTimes} />
        </button>
      </div>
    );
  };

  const panel = (side, heading, hits, held, subtitle) => (
    <div className="trade-panel">
      <div className="panel-header">
        <h3>{heading}</h3>
        {subtitle ? <span className="ch-panel-note">{subtitle}</span> : null}
      </div>

      <div className="search-container">
        <div className="search-input-wrapper">
          <FontAwesomeIcon icon={faSearch} className="search-icon" />
          <input
            type="text"
            className="search-input"
            aria-label={side === "give" ? "Search my roster" : "Search the league"}
            placeholder={side === "give" ? "Search my roster…" : "Search the league…"}
            value={queries[side]}
            disabled={!league || detailStatus !== "ready"}
            onChange={(event) =>
              setQueries((q) => ({ ...q, [side]: event.target.value }))
            }
          />
        </div>
        {hits.length > 0 && (
          <div className="search-results">
            {hits.map((hit) => (
              <div
                className="search-result-item"
                key={hit.id}
                role="button"
                tabIndex={0}
                onClick={() => addPlayer(side, hit.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") addPlayer(side, hit.id);
                }}
              >
                <span className="player-name">
                  {[hit.player.first_name, hit.player.last_name].filter(Boolean).join(" ")}
                </span>
                <span className="player-details">
                  {hit.player.position} · {hit.player.team || "FA"}
                  {side === "take" ? ` · ${teamName(hit.roster)}` : ""}
                </span>
              </div>
            ))}
          </div>
        )}
        {queries[side].trim().length >= 2 && hits.length === 0 && (
          <p className="ch-note ch-note-tight">
            {side === "give"
              ? "Nobody on your roster by that name."
              : "Nobody on a roster in this league by that name — free agents cannot be traded for."}
          </p>
        )}
      </div>

      <div className="selected-players">{held.map((id) => playerCard(side, id))}</div>
    </div>
  );

  const sosRow = (figures, leagueValues, window) => {
    if (!figures) return <span className="team-value">–</span>;
    const { before, after } = figures;
    const rank = rankAmong(leagueValues, after.value, {
      easierIsHigher: sosBasis === "vspos",
    });
    const delta =
      before.value == null || after.value == null ? null : after.value - before.value;
    // Easier is lower for a win rate and higher for points allowed.
    const easier = delta == null ? null : sosBasis === "vspos" ? delta > 0 : delta < 0;

    return (
      <>
        <span className="team-value">
          {sosFigure(before.value, sosBasis)} → {sosFigure(after.value, sosBasis)}
          {rank ? (
            <sup style={{ color: rankColor(rank, leagueValues.length, true) }}>
              {ordinal(rank)}
            </sup>
          ) : null}
        </span>
        <span className="ch-delta">
          {delta == null ? "–" : easier ? "easier" : delta === 0 ? "no change" : "harder"}
        </span>
        <span className="ch-coverage" title={`${window} window`}>
          {after.counted}/{after.total} priced
        </span>
      </>
    );
  };

  const pointsRow = (impact) => {
    if (!impact) return <span className="team-value">–</span>;
    return (
      <>
        <span className="team-value">
          {fmt(impact.before.perWeek)} → {fmt(impact.after.perWeek)}
        </span>
        <span className="ch-delta">{signed(impact.deltaPerWeek)} / wk</span>
        <span className="ch-coverage">{signed(impact.deltaTotal)} total</span>
      </>
    );
  };

  const sideBlock = (label, impacts, scheduleFigures) => (
    <div className="ch-side">
      <h4 className="section-heading">{label}</h4>
      <div className="ch-grid">
        <span className="ch-rowhead" />
        <span className="ch-colhead">Rest of season ({weekSpan(windows.regular)})</span>
        <span className="ch-colhead">Playoffs ({weekSpan(windows.playoffs)})</span>

        <span className="ch-rowhead">{basis === "proj" ? "Projection" : "Points per game"}</span>
        <span className="ch-cell">{pointsRow(impacts.regular)}</span>
        <span className="ch-cell">{pointsRow(impacts.playoffs)}</span>

        <span className="ch-rowhead">Schedule ({SOS_LABEL[sosBasis]})</span>
        <span className="ch-cell">{sosRow(scheduleFigures.regular, schedules.league.regular, "ros")}</span>
        <span className="ch-cell">{sosRow(scheduleFigures.playoffs, schedules.league.playoffs, "post")}</span>
      </div>
    </div>
  );

  const playerName = (id) =>
    [meta[String(id)]?.first_name, meta[String(id)]?.last_name].filter(Boolean).join(" ") ||
    String(id);

  const caveats = [];

  // The one worth putting first, because it is the only one that makes a
  // figure disappear rather than merely wobble. Sleeper publishes nothing for a
  // player listed Out, including for the weeks he is due back, so this is what
  // a trade for an injured star looks like on the projection basis.
  const blocked = [
    ...new Set([...(mine.regular?.unpriceable || []), ...(mine.playoffs?.unpriceable || [])]),
  ];
  const skipped = [
    ...new Set([...(mine.regular?.skippedWeeks || []), ...(mine.playoffs?.skippedWeeks || [])]),
  ];
  if (blocked.length > 0 && projStatus !== "loading") {
    caveats.push(
      `No ${basis === "proj" ? "projection" : "scoring history"} for ${blocked
        .map(playerName)
        .join(", ")}, so ${
        skipped.length === 1 ? "week" : "weeks"
      } ${skipped.join(", ")} cannot be compared and are left out`
    );
  }

  const unpriced =
    (mine.regular?.after.unpricedStarters || 0) + (mine.playoffs?.after.unpricedStarters || 0);
  if (unpriced > 0) {
    caveats.push(
      `${unpriced} starter-week${unpriced === 1 ? "" : "s"} had no number and count as 0`
    );
  }
  const empties =
    (mine.regular?.after.emptySlots || 0) + (mine.playoffs?.after.emptySlots || 0);
  if (empties > 0) {
    caveats.push(`${empties} lineup slot${empties === 1 ? "" : "s"} left empty after the trade`);
  }

  const traded = give.length > 0 || take.length > 0;

  return (
    <div className="ch-tab">
      <div className="ch-bar">
        <label className="ch-field">
          <span>League</span>
          <select
            value={leagueId}
            onChange={(event) => setLeagueId(event.target.value)}
            aria-label="League"
          >
            <option value="">Choose a league…</option>
            {ordered.map((option) => (
              <option key={option.league_id} value={option.league_id}>
                {option.name} · {option.settings?.type === 2 ? "dynasty" : "redraft"} ·{" "}
                {option.total_rosters}-team
              </option>
            ))}
          </select>
        </label>

        {league ? (
          <span className="ch-context">
            Week {currentWeek} · rest of season {weekSpan(windows.regular)} · playoffs{" "}
            {weekSpan(windows.playoffs)}
          </span>
        ) : (
          <span className="ch-context">
            Pick a league and the boxes below fill from its rosters.
          </span>
        )}

        <div className="ch-pills" role="group" aria-label="Scoring basis">
          <button
            type="button"
            className={`ch-pill${basis === "ppg" ? " ch-pill-on" : ""}`}
            onClick={() => setBasis("ppg")}
          >
            Pts/g
          </button>
          <button
            type="button"
            className={`ch-pill${basis === "proj" ? " ch-pill-on" : ""}`}
            onClick={() => setBasis("proj")}
          >
            Projections
          </button>
        </div>
      </div>

      {basis === "proj" && projStatus === "loading" && (
        <p className="ch-note">
          Loading Sleeper projections — week {projDone} of {horizon.length}. Each week is a
          separate 2 MB download, so this takes a moment the first time.
        </p>
      )}
      {basis === "proj" && projStatus === "failed" && (
        <p className="ch-note ch-error">The Sleeper projections could not be loaded.</p>
      )}

      {league && detailStatus === "loading" && <p className="ch-note">Loading the league…</p>}
      {league && detailStatus === "ready" && !myRoster && (
        <p className="ch-note ch-error">
          You do not hold a roster in {league.name}, so there is no side of yours to compare.
        </p>
      )}

      {/* Defensive rather than reachable: the search narrows to the partner as
          soon as the first player is taken, so a split can only come from
          rosters that changed since they were loaded. Cheap to keep, and a
          wrong partner would quietly misprice the other side. */}
      {partner && partner.teamCount > 1 && (
        <p className="ch-note ch-error">
          The players you are getting come from {partner.teamCount} different teams. Their
          side is left out — a three-way trade is more than this can answer. Your own figures
          below are still correct.
        </p>
      )}

      <div className="ch-panels">
        {panel("give", "I give", giveHits, give, myRoster ? teamName(myRoster) : null)}
        {panel(
          "take",
          "I get",
          takeHits,
          take,
          partnerRoster ? `from ${teamName(partnerRoster)}` : "anyone in the league"
        )}
      </div>

      {traded && myRoster && (
        <div className="trade-analysis">
          <h3>Impact</h3>

          <div className="ch-headline">
            {["regular", "playoffs"].map((key) => {
              const impact = mine[key];
              const weeks = key === "regular" ? windows.regular : windows.playoffs;
              return (
                <div className="ch-tile" key={key}>
                  <span className="ch-tile-label">
                    {key === "regular" ? "Rest of season" : "Playoffs"} ({weekSpan(weeks)})
                  </span>
                  <strong
                    className={`ch-tile-figure${
                      impact?.deltaPerWeek > 0
                        ? " ch-up"
                        : impact?.deltaPerWeek < 0
                        ? " ch-down"
                        : ""
                    }`}
                  >
                    {signed(impact?.deltaPerWeek)} pts/wk
                  </strong>
                  <span className="ch-tile-sub">
                    {impact?.deltaPerWeek == null
                      ? "not priceable on this basis"
                      : `${signed(impact.deltaTotal)} over ${
                          impact.after.pricedWeeks.length
                        } of ${weeks.length} week${weeks.length === 1 ? "" : "s"}`}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="ch-sos-pills" role="group" aria-label="Schedule basis">
            {SOS_BASES.map((option) => (
              <button
                key={option}
                type="button"
                className={`ch-pill${sosBasis === option ? " ch-pill-on" : ""}`}
                onClick={() => setSosBasis(option)}
              >
                {SOS_LABEL[option]}
              </button>
            ))}
          </div>

          {sideBlock("My team", mine, schedules.mine)}
          {partnerRoster && partner.teamCount === 1 &&
            sideBlock(teamName(partnerRoster), theirs, schedules.theirs)}

          {caveats.length > 0 && (
            <p className="ch-note ch-note-tight">{caveats.join(" · ")}</p>
          )}

          <details className="ch-weeks">
            <summary>Week by week</summary>
            <table className="ch-week-table">
              <thead>
                <tr>
                  <th>Week</th>
                  <th>Before</th>
                  <th>After</th>
                  <th>Change</th>
                  <th>Out that week</th>
                </tr>
              </thead>
              <tbody>
                {["regular", "playoffs"].flatMap((key) => {
                  const impact = mine[key];
                  if (!impact) return [];
                  return impact.after.byWeek.map((lineup) => {
                    const was = impact.before.byWeek.find((row) => row.week === lineup.week);
                    const delta = was ? lineup.total - was.total : null;
                    return (
                      <tr key={`${key}-${lineup.week}`}>
                        <td>{lineup.week}</td>
                        <td>{fmt(was?.total)}</td>
                        <td>{fmt(lineup.total)}</td>
                        <td className={delta > 0 ? "ch-up" : delta < 0 ? "ch-down" : ""}>
                          {signed(delta)}
                        </td>
                        <td className="ch-bye-cell">
                          {lineup.onBye
                            .map((id) => meta[id]?.last_name || id)
                            .join(", ") || "—"}
                        </td>
                      </tr>
                    );
                  });
                })}
              </tbody>
            </table>
            <p className="ch-note ch-note-tight">
              The playoff schedule figure is always weeks 15–17, which is how it is computed
              for the whole league — so in a league whose playoffs start elsewhere it will not
              match the weeks the points are taken over.
            </p>
          </details>
        </div>
      )}
    </div>
  );
}

export default ContenderTab;

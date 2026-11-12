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
import { useLocation } from "react-router-dom";
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
  decodeTrade,
  impliedRoster,
  staleTradePlayers,
  tradeLinkFor,
} from "./tradeLink";
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

function ContenderTab({ userName, active = false, onSendTrade }) {
  const location = useLocation();
  // Read once: a shared trade is a starting point, not a binding. Re-reading it
  // would undo every edit the moment anything else re-rendered.
  const [link] = useState(() => decodeTrade(location.search));

  // Opened once is opened for good: the pane stays mounted after the first
  // visit, and so should its data.
  const opened = useRef(false);
  if (active) opened.current = true;
  const live = opened.current;

  // The projection download, which outlives the effect that starts it.
  //
  // `key` is the league and horizon it is for; `controller` aborts it. Both are
  // refs rather than state because they must not be dependencies of the effect
  // below: marking the load as started would re-run it, and the re-run's
  // cleanup would abort the loop after its first week.
  const projRun = useRef({ key: null, controller: null });

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
  // The roster the trade is drawn from, when a link fixed it rather than the
  // signed-in user's own.
  const [linkRoster, setLinkRoster] = useState(null);
  const [copied, setCopied] = useState(false);

  const [basis, setBasis] = useState("ppg");
  const [sosBasis, setSosBasis] = useState("2026");
  const [projections, setProjections] = useState({});
  const [projStatus, setProjStatus] = useState("idle");
  const [projDone, setProjDone] = useState(0);

  // ── Loading ───────────────────────────────────────────────────────────────

  useEffect(() => {
    // A link needs no username: it names the league, and whoever opens it may
    // not be in it, or signed in at all.
    if (!live || (!userName && !link)) return undefined;
    const controller = new AbortController();
    let alive = true;

    (async () => {
      setStatus("loading");
      try {
        const [week, found, fixtures, shared] = await Promise.all([
          getCurrentWeek(),
          userName
            ? load.loadLeagues(userName, { signal: controller.signal })
            : Promise.resolve({ userId: null, leagues: [] }),
          load.loadSchedule({ signal: controller.signal }),
          link
            ? load.loadLeague(link.leagueId, { signal: controller.signal })
            : Promise.resolve(null),
        ]);
        if (!alive) return;
        setCurrentWeek(week);
        setUserId(found.userId);
        setSchedule(fixtures);

        // The shared league need not be one of the viewer's own, so it joins
        // the list rather than being looked up in it.
        const known = found.leagues.some(
          (one) => String(one.league_id) === String(link?.leagueId)
        );
        setLeagues(shared && !known ? [shared, ...found.leagues] : found.leagues);
        if (link) {
          setLeagueId(String(link.leagueId));
          setGive(link.give);
          setTake(link.get);
        }
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
  }, [live, userName, link]);

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
  // The league a link names is excepted, because the link set that trade up.
  const linkLeague = useRef(link ? String(link.leagueId) : null);
  useEffect(() => {
    if (linkLeague.current && leagueId === linkLeague.current) {
      // Once only. Leave and come back and it is an ordinary league again.
      linkLeague.current = null;
      return;
    }
    setGive([]);
    setTake([]);
    setLinkRoster(null);
    setQueries({ give: "", take: "" });
    setProjections({});
    setProjStatus("idle");
    setProjDone(0);
    setBasis("ppg");
    projRun.current.controller?.abort();
    projRun.current = { key: null, controller: null };
  }, [leagueId]);

  const windows = useMemo(
    () => windowsFor(currentWeek, league?.settings?.playoff_week_start),
    [currentWeek, league]
  );

  const horizon = useMemo(
    () => [...windows.regular, ...windows.playoffs],
    [windows]
  );

  // Only ever abort the download because the component is going away. Leaving
  // the tab or the page does not: the pane stays mounted, and the bytes are
  // already being paid for.
  useEffect(() => () => projRun.current.controller?.abort(), []);

  // Projections are fetched one week at a time rather than eight at once: each
  // response is 2.1 MB and parsing eight in parallel visibly stalls the tab.
  //
  // The run deliberately has no cleanup of its own. It used to abort when the
  // effect re-ran, and `basis` is one of the effect's dependencies — so
  // flipping to Pts/g to read something while the eight weeks downloaded killed
  // the loop after whichever week it was on, and flipping back hit the
  // already-started guard and never restarted. The tab sat on "week 1 of 8"
  // for good, with no error to say why. Eight 2 MB downloads are far too
  // expensive to throw away over a glance at the other basis, so the run now
  // owns its own life: it is started here and only the unmount above stops it.
  useEffect(() => {
    if (!live || basis !== "proj" || !league || horizon.length === 0) return undefined;

    const key = `${league.league_id}:${horizon.join(",")}`;
    if (projRun.current.key === key) return undefined;

    const controller = new AbortController();
    projRun.current = { key, controller };
    // Still ours only while nothing newer has replaced it — a league switch
    // does, and so does the unmount.
    const current = () => projRun.current.key === key;

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
          if (!current() || e.name === "AbortError") return;
          failures += 1;
        }
        if (!current()) return;
        setProjDone((done) => done + 1);
        setProjections({ ...priced });
      }
      if (!current()) return;
      if (failures === horizon.length) {
        // Let the pill be clicked again to retry rather than being stuck.
        projRun.current = { key: null, controller: null };
        setProjStatus("failed");
      } else {
        setProjStatus("ready");
      }
    })();

    return undefined;
  }, [live, basis, league, horizon, currentWeek]);

  // ── Reading the league ────────────────────────────────────────────────────

  const viewerRoster = useMemo(
    () =>
      rosters.find(
        (roster) =>
          String(roster.owner_id) === String(userId) ||
          (roster.co_owners || []).some((id) => String(id) === String(userId))
      ) || null,
    [rosters, userId]
  );

  // Whose side the trade is drawn from. Normally the viewer's own; for a trade
  // that arrived by link, whichever roster the link named — or, once the sides
  // have been swapped below, the viewer's, because they turned out to be the
  // other half of it.
  const myRoster = useMemo(() => {
    if (linkRoster != null) {
      return (
        rosters.find((roster) => String(roster.roster_id) === String(linkRoster)) || null
      );
    }
    return viewerRoster;
  }, [linkRoster, rosters, viewerRoster]);

  // Is the team on the left the viewer's own? It decides nothing about the
  // figures and everything about what to call it.
  const mineIsViewers =
    !!myRoster && !!viewerRoster && String(myRoster.roster_id) === String(viewerRoster.roster_id);

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

  // Players the link named who are somewhere else now. A link outlives the
  // rosters it describes, and priced as though nothing had moved the figures
  // are quietly wrong.
  const moved = useMemo(() => {
    if (!link || !myRoster) return [];
    return staleTradePlayers({
      give,
      get: take,
      rosterId: myRoster.roster_id,
      partnerId: partnerRoster?.roster_id ?? null,
      holder: rosterIdOf,
    });
  }, [link, myRoster, partnerRoster, give, take, rosterIdOf]);

  // Where the giving side actually sits, when it sits somewhere else to a team.
  // That is a link built against the wrong roster rather than one gone stale,
  // and it is recoverable in one click.
  const impliedId = useMemo(
    () =>
      link && myRoster
        ? impliedRoster({ give, rosterId: myRoster.roster_id, holder: rosterIdOf })
        : null,
    [link, myRoster, give, rosterIdOf]
  );

  // A trade arriving by link is drawn from the roster it names — unless the
  // viewer turns out to be the other half of it, in which case the two sides
  // swap so it reads from theirs. Swapping the sides rather than relabelling
  // them means every figure below is already the right way round.
  const settled = useRef(false);
  useEffect(() => {
    // Not waiting on a partner: when every player the link asks for has since
    // moved there is nobody to infer, and the trade still has to be drawn from
    // the roster the link named so the staleness can be reported at all.
    if (!link || settled.current || rosters.length === 0) return;
    settled.current = true;

    const theirs = partner ? String(partner.rosterId) : null;
    if (theirs && viewerRoster && String(viewerRoster.roster_id) === theirs) {
      setLinkRoster(theirs);
      setGive(link.get);
      setTake(link.give);
    } else {
      setLinkRoster(String(link.rosterId));
    }
  }, [link, rosters, partner, viewerRoster]);

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

  const ratePoints = useCallback(
    (id) => {
      const rate = rates[String(id)];
      return typeof rate === "number" && Number.isFinite(rate) ? rate : null;
    },
    [rates]
  );

  const projectionPoints = useCallback(
    (id, week) => {
      const value = projections[week]?.[String(id)];
      return typeof value === "number" ? value : null;
    },
    [projections]
  );

  // ── The comparison ───────────────────────────────────────────────────────

  const shape = useMemo(
    () => ({
      rosterPositions: league?.roster_positions || [],
      positionsOf,
      teamOf,
      byeWeeks,
    }),
    [league, positionsOf, teamOf, byeWeeks]
  );

  // Both bases are worked out, not just the one the pill is on. The season rate
  // costs nothing once the stats are loaded, and hiding it behind the pill was
  // the reason a trade could be read on projections alone — which is the one
  // basis that goes quiet on an injured player.
  const impactsOn = useCallback(
    (pointsFor) => {
      const run = (roster, out, incoming, weeks) =>
        !roster || weeks.length === 0
          ? null
          : tradeImpact({
              ...shape,
              pointsFor,
              playerIds: roster.players || [],
              give: out,
              get: incoming,
              weeks,
            });

      return {
        mine: {
          regular: run(myRoster, give, take, windows.regular),
          playoffs: run(myRoster, give, take, windows.playoffs),
        },
        theirs: {
          regular: run(partnerRoster, take, give, windows.regular),
          playoffs: run(partnerRoster, take, give, windows.playoffs),
        },
      };
    },
    [shape, myRoster, partnerRoster, give, take, windows]
  );

  const byRate = useMemo(() => impactsOn(ratePoints), [impactsOn, ratePoints]);

  const byProjection = useMemo(
    () => (basis === "proj" ? impactsOn(projectionPoints) : null),
    [basis, impactsOn, projectionPoints]
  );

  // What the headline and the caveats speak for: the projection when it has
  // been asked for and arrived, the season rate otherwise.
  const headline = byProjection || byRate;
  const mine = headline.mine;

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

  // A shared trade names its own league, so it needs no username — which is
  // the whole point of being able to send one to a league-mate.
  if (!userName && !link) {
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

  const panel = (side, heading, hits, held, subtitle) => {
    const searching = queries[side].trim().length >= 2;
    return (
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
        {/* The "nothing found" line sits in the dropdown rather than under the
            box. In flow it landed behind the input — `.search-input-wrapper` is
            positioned and the paragraph was not, so the input painted over it —
            and it belongs where the results would have been anyway. */}
        {searching && (
          <div className="search-results">
            {hits.length === 0 && (
              <div className="search-result-item ch-no-hits">
                {side === "give"
                  ? "Nobody on your roster by that name."
                  : partnerRoster
                  ? `Nobody on ${teamName(partnerRoster)} by that name. Clear their side to look at another team.`
                  : "Nobody on a roster in this league by that name — a free agent cannot be traded for."}
              </div>
            )}
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
      </div>

      <div className="selected-players">{held.map((id) => playerCard(side, id))}</div>
    </div>
    );
  };

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

  // One window, read across: everything of mine on the left, everything of
  // theirs on the right, the measure between them. A trade has two sides and
  // the question is which way each figure moves, so the two sides face each
  // other rather than being stacked one above the other.
  const windowBlock = (label, key, sosKey, weeks) => {
    const theirSide = partnerRoster && partner.teamCount === 1;
    const row = (name, mineCell, theirCell) => (
      <React.Fragment key={name}>
        <span className="ch-mine">{mineCell}</span>
        <span className="ch-measure">{name}</span>
        <span className="ch-theirs">{theirSide ? theirCell : <span className="ch-muted">—</span>}</span>
      </React.Fragment>
    );

    return (
      <div className="ch-window">
        <h4 className="ch-window-head">
          {label} <span className="ch-window-weeks">{weekSpan(weeks)}</span>
        </h4>
        <div className="ch-face">
          {row(
            "Points per game",
            pointsRow(byRate.mine[key]),
            pointsRow(byRate.theirs[key])
          )}
          {byProjection &&
            row(
              "Sleeper projection",
              pointsRow(byProjection.mine[key]),
              pointsRow(byProjection.theirs[key])
            )}
          {row(
            `Schedule (${SOS_LABEL[sosBasis]})`,
            sosRow(schedules.mine[key], schedules.league[key], sosKey),
            sosRow(schedules.theirs[key], schedules.league[key], sosKey)
          )}
        </div>
      </div>
    );
  };

  // What to call the side the trade is drawn from. "My team" only when it is
  // actually the viewer's — someone opening a link to a league they are not in
  // should see two team names, not one of them claiming to be theirs.
  const mineLabel = mineIsViewers || !myRoster ? "My team" : teamName(myRoster);

  const shareLink = tradeLinkFor(
    typeof window === "undefined" ? "" : window.location.origin,
    location.pathname,
    { leagueId, rosterId: myRoster?.roster_id, give, get: take }
  );

  const copyLink = () => {
    if (!shareLink) return;
    try {
      navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // A browser that refuses the clipboard is not worth an error state; the
      // link is in the box beside the button either way.
    }
  };

  const playerName = (id) =>
    [meta[String(id)]?.first_name, meta[String(id)]?.last_name].filter(Boolean).join(" ") ||
    String(id);

  // One side's horizon, week by week. Both sides get one: a week where a bye
  // swings the trade swings it for them too, and which of the two it hurts is
  // the thing you are actually weighing up.
  const weekTable = (label, impacts) => {
    const rows = ["regular", "playoffs"].flatMap((key) => {
      const impact = impacts[key];
      if (!impact) return [];
      return impact.after.byWeek.map((lineup) => {
        const was = impact.before.byWeek.find((row) => row.week === lineup.week);
        return {
          key: `${key}-${lineup.week}`,
          week: lineup.week,
          playoff: key === "playoffs",
          before: was?.total,
          after: lineup.total,
          delta: was ? lineup.total - was.total : null,
          onBye: lineup.onBye,
        };
      });
    });

    return (
      <div className="ch-week-side">
        <h5 className="ch-week-head">{label}</h5>
        {rows.length === 0 ? (
          <p className="ch-note ch-note-tight">No week could be priced on this basis.</p>
        ) : (
          <table className="ch-week-table">
            <thead>
              <tr>
                <th>Week</th>
                <th>Before</th>
                <th>After</th>
                <th>Change</th>
                <th>On bye</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className={row.playoff ? "ch-week-playoff" : ""}>
                  <td>{row.week}</td>
                  <td>{fmt(row.before)}</td>
                  <td>{fmt(row.after)}</td>
                  <td className={row.delta > 0 ? "ch-up" : row.delta < 0 ? "ch-down" : ""}>
                    {signed(row.delta)}
                  </td>
                  <td className="ch-bye-cell">
                    {row.onBye.map((id) => meta[id]?.last_name || id).join(", ") || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    );
  };

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
        <p className="ch-note ch-error">
          The Sleeper projections could not be loaded. Switch to Pts/g and back to try
          again.
        </p>
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
      {moved.length > 0 && (
        <p className="ch-note ch-error">
          {/* Say where they are, not only that they are elsewhere. "Not on this
              roster" is a dead end; "they are on Hindenburg Hooligans" is the
              answer and, below, the way out. */}
          This trade came from a link, and{" "}
          {moved
            .map((row) => {
              const holder = rosters.find(
                (roster) => String(roster.roster_id) === String(row.now)
              );
              return `${playerName(row.id)} (${
                holder ? teamName(holder) : "no roster in this league"
              })`;
            })
            .join(", ")}{" "}
          {moved.length === 1 ? "is" : "are"} not on{" "}
          {myRoster ? teamName(myRoster) : "the roster it names"}. The figures below
          count {moved.length === 1 ? "them" : "them"} anyway, so they are worth less
          than they look.
          {impliedId && (
            <>
              {" "}
              <button
                type="button"
                className="ch-inline-button"
                onClick={() => setLinkRoster(impliedId)}
              >
                Draw it from{" "}
                {teamName(
                  rosters.find((roster) => String(roster.roster_id) === String(impliedId))
                )}{" "}
                instead
              </button>
            </>
          )}
        </p>
      )}

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

          {/* A tile per team, each carrying both windows. Grouped by window
              instead — which is how this first read — the left tile sat under
              the heading that said "My team" while holding both sides' figures
              for the run-in, which is a confusing thing to put there. */}
          <div className="ch-headline">
            {[
              ["mine", mineLabel, true],
              [
                "theirs",
                partnerRoster && partner.teamCount === 1
                  ? teamName(partnerRoster)
                  : "Their team",
                Boolean(partnerRoster && partner.teamCount === 1),
              ],
            ].map(([side, label, known]) => (
              <div className={`ch-tile ch-tile-${side}`} key={side}>
                <span className="ch-tile-label">
                  {label}
                  <span className="ch-tile-basis">
                    {byProjection ? "projection" : "points per game"}
                  </span>
                </span>
                {["regular", "playoffs"].map((key) => {
                  const weeks = key === "regular" ? windows.regular : windows.playoffs;
                  const impact = known ? headline[side][key] : null;
                  return (
                    <div className="ch-tile-window" key={key}>
                      <span className="ch-tile-when">
                        {key === "regular" ? "Rest of season" : "Playoffs"}{" "}
                        {weekSpan(weeks)}
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
                        {!known
                          ? "nobody on the other side yet"
                          : impact == null
                          ? "no weeks left"
                          : impact.deltaPerWeek == null
                          ? "not priceable on this basis"
                          : `${signed(impact.deltaTotal)} over ${
                              impact.after.pricedWeeks.length
                            } of ${weeks.length} week${weeks.length === 1 ? "" : "s"}`}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="ch-send">
            {onSendTrade && (
              <button
                type="button"
                className="ch-send-button"
                onClick={() => onSendTrade({ give, get: take })}
              >
                Price this trade in the Trade Helper
              </button>
            )}
            {shareLink && (
              <button type="button" className="ch-send-button" onClick={copyLink}>
                {copied ? "Link copied" : "Copy a link to this trade"}
              </button>
            )}
            <span className="ch-send-note">
              The link carries the league and the two rosters, so it opens for whoever you
              send it to — signed in or not — and is worked out again from the
              rosters as they stand that day rather than showing the figures frozen here.
            </span>
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

          <div className="ch-teams">
            <span className="ch-mine">{mineLabel}</span>
            <span className="ch-measure" />
            <span className="ch-theirs">
              {partnerRoster && partner.teamCount === 1
                ? teamName(partnerRoster)
                : "nobody yet"}
            </span>
          </div>

          {windowBlock("Rest of season", "regular", "ros", windows.regular)}
          {windowBlock("Playoffs", "playoffs", "post", windows.playoffs)}

          {caveats.length > 0 && (
            <p className="ch-note ch-note-tight">{caveats.join(" · ")}</p>
          )}

          {/* Open to begin with. It was a disclosure on the grounds of being
              busy, but it is where a bye or a hard week shows itself, which is
              most of why the horizon is walked week by week at all. React
              writes `open` on mount and then leaves it alone, so closing it
              sticks for as long as the tab is up. */}
          <details className="ch-weeks" open>
            <summary>Week by week</summary>
            <div className="ch-week-tables">
              {weekTable(mineLabel, headline.mine)}
              {partnerRoster && partner.teamCount === 1
                ? weekTable(teamName(partnerRoster), headline.theirs)
                : null}
            </div>
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

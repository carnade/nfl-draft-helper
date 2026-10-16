// Every trade waiting on a decision, in one place.
//
// Sleeper shows pending trades a league at a time, which with forty of them
// means forty places to look. This asks all of them at once and draws each
// offer with the numbers you would want before answering it: KeepTradeCut and
// FantasyCalc values, age, points per game, and for a draft pick the slot it
// is projected to become.
//
// The order of the fetching matters more than it looks. Pending trades are
// rare — a handful out of forty leagues — so the trades are asked for first,
// in batches, and the per-league detail needed to price them is fetched only
// for the leagues that turned out to have one. Asking every league for its
// rosters up front would be most of the page's cost spent on leagues with
// nothing to show.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import "./TableStyles.css";
import "./TradeCentral.css";
import PositionPill from "./PositionPill";
import { useSleeperAuth } from "./auth";
import { loadHiddenLeagues, visibleLeagues, useHiddenLeagues } from "./leagueVisibility";
import { readCache, writeCache } from "./ttlCache";
import { fetchPendingTrades } from "./pendingTrades";
import { SleeperAuthError } from "./sleeperGraphql";
import { draftOrder } from "./draftOrder";
import { buildLeagueView } from "./tradeView";

const SEASON = 2026;

// Matches StartSit's spelling rather than LeagueList's `=== 'true'`; the two
// disagree and this is the one that works with `npm run mock`.
const BASE_URL = process.env.REACT_APP_MOCK
  ? "http://localhost:5000"
  : "https://shaggy-latashia-carnade-2ea2054a.koyeb.app";

const POSITIONS = "position[]=DEF&position[]=K&position[]=QB&position[]=RB&position[]=TE&position[]=WR";
const LEAGUES_TTL = 10 * 60 * 1000;
const ROSTERS_TTL = 15 * 60 * 1000;
const POINTS_TTL = 6 * 60 * 60 * 1000;

// Sleeper's season payloads are a couple of megabytes of fields nothing here
// reads. Reduced to the two numbers that make a per-game figure before they go
// anywhere near storage.
function reducePoints(rows) {
  const out = {};
  for (const row of Array.isArray(rows) ? rows : []) {
    const id = row?.player_id;
    if (!id) continue;
    out[String(id)] = { pts_ppr: row?.stats?.pts_ppr ?? 0, gp: row?.stats?.gp ?? 0 };
  }
  return out;
}

async function cachedJson(key, ttl, url, signal, reduce = (x) => x) {
  const hit = readCache(key, ttl);
  if (hit) return hit;
  const rows = await fetch(url, { signal }).then((r) => {
    if (!r.ok) throw new Error(String(r.status));
    return r.json();
  });
  const value = reduce(rows);
  writeCache(key, value);
  return value;
}

/** How long is left on an offer, said the way a person would say it. */
export function expiryLabel(expiresAt, now = Date.now()) {
  if (!expiresAt) return null;
  const left = expiresAt - now;
  if (left <= 0) return "expired";
  const hours = Math.floor(left / 3600000);
  if (hours < 1) return `${Math.max(1, Math.round(left / 60000))}m left`;
  if (hours < 48) return `${hours}h left`;
  return `${Math.round(hours / 24)}d left`;
}

const fmt = (value, digits = 1) =>
  value == null ? <span className="ss-muted">—</span> : value.toFixed(digits);

const whole = (value) =>
  value == null ? <span className="ss-muted">—</span> : Math.round(value).toLocaleString();

// Why a pick has no projected slot, in words rather than a blank cell.
const PICK_REASONS = {
  "no-order": "No projected draft order yet — nobody has scored",
  "past-season": "That draft has already been held",
  "unknown-roster": "The roster this pick belongs to is no longer in the league",
  unparsed: "Sleeper sent this pick in a shape we could not read",
};

export function AssetRow({ asset }) {
  const sub =
    asset.kind === "pick"
      ? asset.label || PICK_REASONS[asset.reason] || null
      : asset.injuryStatus;

  return (
    <tr className="ss-row">
      <td className="tc-asset">
        <span className="tc-asset-name">{asset.name}</span>
        {sub && <span className="tc-asset-sub">{sub}</span>}
      </td>
      <td className="tc-pos">
        {asset.position ? <PositionPill position={asset.position} /> : <span className="ss-muted">—</span>}
      </td>
      <td className="ss-center">{asset.team || <span className="ss-muted">—</span>}</td>
      <td className="ss-num">{asset.age == null ? <span className="ss-muted">—</span> : asset.age}</td>
      <td className="ss-num">{fmt(asset.projPg)}</td>
      <td className="ss-num">{fmt(asset.actualPg)}</td>
      <td className="ss-num">{whole(asset.ktc)}</td>
      <td className="ss-num">{whole(asset.fc)}</td>
    </tr>
  );
}

export function SideTable({ title, side }) {
  const { assets, totals } = side;
  return (
    <div className="tc-side">
      <h4 className="tc-side-title">
        {title}
        {totals.unknown > 0 && (
          <span
            className="tc-side-note"
            title={`${totals.unknown} asset${totals.unknown === 1 ? "" : "s"} have no published value, so the totals leave them out`}
          >
            {totals.unknown} unpriced
          </span>
        )}
      </h4>
      <div className="ss-table-wrap">
        <table className="ss-table">
          <thead>
            <tr>
              <th>Asset</th>
              <th className="ss-center">Pos</th>
              <th className="ss-center">Team</th>
              <th className="ss-num">Age</th>
              <th className="ss-num" title="Sleeper's projection for the season, per game">Proj</th>
              <th className="ss-num" title="Points per game actually scored this season">Pts/g</th>
              <th className="ss-num" title="KeepTradeCut superflex value">KTC</th>
              <th className="ss-num" title="FantasyCalc superflex value">FC</th>
            </tr>
          </thead>
          <tbody>
            {assets.length === 0 ? (
              <tr>
                <td colSpan={8} className="ss-muted">nothing</td>
              </tr>
            ) : (
              assets.map((asset) => <AssetRow key={asset.key} asset={asset} />)
            )}
          </tbody>
          {assets.length > 0 && (
            <tfoot>
              <tr className="tc-totals-row">
                <td colSpan={4}>Total</td>
                <td className="ss-num">{fmt(totals.projPg)}</td>
                <td className="ss-num">{fmt(totals.actualPg)}</td>
                <td className="ss-num">{whole(totals.ktc)}</td>
                <td className="ss-num">{whole(totals.fc)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

export function Comparison({ rows }) {
  return (
    <div className="tc-compare">
      {rows.map((row) => (
        <div key={row.key} className={`tc-compare-cell tc-favours-${row.favours || "none"}`}>
          <span className="tc-compare-label">{row.label}</span>
          <span className="tc-compare-value">
            {row.delta == null
              ? "—"
              : row.favours === "even"
              ? "even"
              : `${row.favours === "receive" ? "+" : "−"}${Math.abs(row.delta).toLocaleString()}`}
          </span>
        </div>
      ))}
    </div>
  );
}

export function TradeBlock({ trade, now }) {
  const expiry = expiryLabel(trade.expiresAt, now);
  const names = trade.counterparties.map((c) => c.name).join(", ");
  const unreadablePicks = trade.unreadable.draftPicks.length;

  return (
    <article className="tc-trade">
      <header className="tc-trade-head">
        <span className={`tc-badge tc-badge-${trade.direction}`}>
          {trade.direction === "incoming" ? "Awaiting you" : "Waiting on them"}
        </span>
        <span className="tc-with">{names}</span>
        {trade.isCounter && <span className="tc-tag">counter</span>}
        {trade.multiTeam && <span className="tc-tag">{trade.counterparties.length + 1}-team</span>}
        {expiry && <span className="tc-expiry">{expiry}</span>}
      </header>

      <div className="tc-sides">
        <SideTable title="You get" side={trade.receive} />
        <SideTable title="You give" side={trade.give} />
      </div>

      <Comparison rows={trade.comparisons} />

      {(unreadablePicks > 0 || trade.unreadable.faab) && (
        <p className="tc-warn">
          This trade also includes{" "}
          {[
            unreadablePicks > 0 && `${unreadablePicks} draft pick${unreadablePicks === 1 ? "" : "s"}`,
            trade.unreadable.faab && "a FAAB transfer",
          ]
            .filter(Boolean)
            .join(" and ")}{" "}
          we could not read, so the totals above are incomplete.
        </p>
      )}
    </article>
  );
}

export function LeagueTrades({ league, now }) {
  const summary = [
    league.incoming && `${league.incoming} awaiting you`,
    league.outgoing && `${league.outgoing} waiting on them`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section className="ss-card">
      <header className="ss-card-head">
        <h3 className="ss-league-name">{league.name}</h3>
        <span className="tc-summary">{summary}</span>
      </header>
      {league.confidence !== "ok" && (
        <p className="tc-note">
          {league.confidence === "none"
            ? "No projected draft order yet, so picks show without a band or slot."
            : "This league has not set a playoff count, so the projected order is max points for alone."}
        </p>
      )}
      {league.trades.map((trade) => (
        <TradeBlock key={trade.id} trade={trade} now={now} />
      ))}
    </section>
  );
}

function TradeCentral() {
  const auth = useSleeperAuth();
  const hidden = useHiddenLeagues();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expired, setExpired] = useState(false);
  const [problems, setProblems] = useState([]);
  const [views, setViews] = useState([]);
  const [checked, setChecked] = useState({ done: 0, total: 0 });

  // useSleeperAuth hands back whatever is in storage without looking at `exp`.
  // An expired token answers every GraphQL query with "unauthorized", which
  // would render as "no pending trades anywhere" — true-looking and wrong.
  const token = auth?.token || null;
  const userId = auth?.user_id || null;
  const live = token && (!auth.exp || auth.exp * 1000 > Date.now());

  const load = useCallback(
    async (signal) => {
      setLoading(true);
      setError(null);
      setExpired(false);
      const failed = [];

      try {
        const allLeagues = await cachedJson(
          `tc_leagues_${userId}_${SEASON}`,
          LEAGUES_TTL,
          `https://api.sleeper.app/v1/user/${userId}/leagues/nfl/${SEASON}`,
          signal
        );

        const leagues = visibleLeagues(
          (Array.isArray(allLeagues) ? allLeagues : []).filter((l) => {
            const type = l.settings?.type;
            return (type === 0 || type === 2) && l.settings?.best_ball !== 1;
          }),
          loadHiddenLeagues()
        );
        setChecked({ done: 0, total: leagues.length });

        const { byLeague, failed: unreachable } = await fetchPendingTrades(
          leagues.map((l) => l.league_id),
          token,
          {
            signal,
            onChunk: ({ byLeague: seen, failed: missed }) =>
              setChecked({ done: Object.keys(seen).length + missed.length, total: leagues.length }),
          }
        );
        if (unreachable.length) failed.push(`${unreachable.length} leagues`);

        const withTrades = leagues.filter((l) => (byLeague[l.league_id] || []).length > 0);

        // Rosters carry the points the draft order is projected from; users
        // carry the names. Only for the leagues that have something to show.
        const [rosterLists, userLists] = await Promise.all([
          Promise.all(
            withTrades.map((l) =>
              cachedJson(
                `tc_rosters_${l.league_id}`,
                ROSTERS_TTL,
                `https://api.sleeper.app/v1/league/${l.league_id}/rosters`,
                signal
              ).catch(() => null)
            )
          ),
          Promise.all(
            withTrades.map((l) =>
              cachedJson(
                `tc_users_${l.league_id}`,
                ROSTERS_TTL,
                `https://api.sleeper.app/v1/league/${l.league_id}/users`,
                signal
              ).catch(() => [])
            )
          ),
        ]);

        // Every player mentioned anywhere, asked for once. include_picks adds
        // the draft pick value table to the same response.
        const playerIds = new Set();
        withTrades.forEach((l) =>
          (byLeague[l.league_id] || []).forEach((t) => {
            Object.keys(t.player_map || {}).forEach((id) => playerIds.add(id));
            Object.keys(t.adds || {}).forEach((id) => playerIds.add(id));
          })
        );

        let values = {};
        if (withTrades.length > 0) {
          values = await fetch(`${BASE_URL}/getplayers/data`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ playerlist: [...playerIds], include_picks: true }),
            signal,
          })
            .then((r) => {
              if (!r.ok) throw new Error(String(r.status));
              return r.json();
            })
            .catch((err) => {
              if (err.name !== "AbortError") failed.push("player and pick values");
              return {};
            });
        }

        let projections = {};
        let stats = {};
        if (playerIds.size > 0) {
          [projections, stats] = await Promise.all([
            cachedJson(
              `tc_proj_${SEASON}`,
              POINTS_TTL,
              `https://api.sleeper.com/projections/nfl/${SEASON}?season_type=regular&${POSITIONS}&order_by=adp_ppr`,
              signal,
              reducePoints
            ).catch((err) => {
              if (err.name !== "AbortError") failed.push("projections");
              return {};
            }),
            cachedJson(
              `tc_stats_${SEASON}`,
              POINTS_TTL,
              `https://api.sleeper.com/stats/nfl/${SEASON}?season_type=regular&${POSITIONS}&order_by=adp_ppr`,
              signal,
              reducePoints
            ).catch((err) => {
              if (err.name !== "AbortError") failed.push("season points");
              return {};
            }),
          ]);
        }

        const built = withTrades
          .map((league, index) => {
            const rosters = rosterLists[index];
            if (!rosters) {
              failed.push(league.name);
              return null;
            }
            // Co-owned rosters list the second manager separately, and
            // matching owner_id alone would lose my roster entirely — which
            // would badge every trade in that league as incoming.
            const mine = rosters.find(
              (r) => r.owner_id === userId || (r.co_owners || []).includes(userId)
            );
            const names = {};
            (userLists[index] || []).forEach((u) => {
              names[u.user_id] = u.metadata?.team_name || u.display_name;
            });

            return buildLeagueView(league, byLeague[league.league_id], {
              myRosterId: mine?.roster_id ?? null,
              order: draftOrder(rosters, { playoffTeams: league.settings?.playoff_teams }),
              values,
              projections,
              stats,
              currentSeason: SEASON,
              nameFor: (rosterId) => {
                const roster = rosters.find((r) => r.roster_id === rosterId);
                return names[roster?.owner_id] || null;
              },
            });
          })
          .filter((view) => view && view.trades.length > 0);

        setViews(built);
        setProblems([...new Set(failed)]);
      } catch (err) {
        if (err instanceof SleeperAuthError) setExpired(true);
        else if (err.name !== "AbortError") setError(err.message || String(err));
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [token, userId]
  );

  useEffect(() => {
    if (!live) {
      setLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [live, load, hidden]);

  const now = Date.now();
  const totals = useMemo(
    () =>
      views.reduce(
        (acc, v) => ({ incoming: acc.incoming + v.incoming, outgoing: acc.outgoing + v.outgoing }),
        { incoming: 0, outgoing: 0 }
      ),
    [views]
  );

  if (!live) {
    return (
      <div className="tc-page">
        <h1>Trade Central</h1>
        <p className="tc-gate">
          {token
            ? "Your Sleeper sign-in has expired. Head to Settings to sign in again."
            : "You must be logged in to see your pending trades."}
        </p>
        <p className="tc-gate-sub">
          Sleeper only shows a proposed trade to the managers in it, so this page needs your
          account. Head to <strong>Settings</strong> to log in.
        </p>
      </div>
    );
  }

  return (
    <div className="tc-page">
      <h1>Trade Central</h1>
      <p className="tc-sub">
        Every trade still waiting on a decision, across all your leagues. Draft picks are placed
        using each manager&apos;s max points for, so a pick&apos;s band and slot are a projection
        rather than a fact.
      </p>

      {expired && (
        <p className="tc-error">
          Your Sleeper sign-in has expired, so no league could be checked. Sign in again in
          Settings.
        </p>
      )}
      {error && <p className="tc-error">{error}</p>}

      {loading && (
        <p className="tc-loading">
          Checking your leagues{checked.total ? ` — ${checked.done} of ${checked.total}` : ""}…
        </p>
      )}

      {!loading && problems.length > 0 && (
        <p className="tc-warn" title={BASE_URL}>
          Couldn&apos;t reach {problems.join(", ")}, so some columns show &ldquo;—&rdquo;.
          Everything else is unaffected.
        </p>
      )}

      {!loading && !expired && views.length === 0 && (
        <p className="tc-empty">No pending trades in any of your leagues.</p>
      )}

      {!loading && views.length > 0 && (
        <p className="tc-tally">
          {totals.incoming} awaiting you · {totals.outgoing} waiting on them, across{" "}
          {views.length} league{views.length === 1 ? "" : "s"}.
        </p>
      )}

      {views.map((league) => (
        <LeagueTrades key={league.leagueId} league={league} now={now} />
      ))}
    </div>
  );
}

export default TradeCentral;

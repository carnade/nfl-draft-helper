// Find a player worth trading for.
//
// The Trade Helper next door prices a trade you have already thought of. This
// answers the other half: sort ~520 players by what they cost against what
// they produce, narrow by the filters, and hand the ones worth asking about
// straight to the trade being built on the other tab.
//
// Everything is filtered and sorted in the browser from one fetch, which is how
// the other tables in this app work and is cheap at this size — the payload is
// around 300 KB and well under 50 once gzipped.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSort, faSortDown, faSortUp, faCheck, faPlus } from "@fortawesome/free-solid-svg-icons";

import "./TableStyles.css";
import "./PlayerFinder.css";
import PositionPill from "./PositionPill";
import { positionClass } from "./positionColors";
import { pointsPerGame, valuePerPoint } from "./tradeValues";
import { ordinal } from "./ordinal";
import { getDvpColor } from "./dvpColor";
import { readCache, writeCache } from "./ttlCache";
import { normalise } from "./playerSearch";

const BASE_URL = process.env.REACT_APP_MOCK
  ? "http://localhost:5000"
  : "https://shaggy-latashia-carnade-2ea2054a.koyeb.app";

// The backend rebuilds this three times a week, so an hour is conservative.
const CACHE_KEY = "player_finder_rows_v1";
const CACHE_TTL_MS = 60 * 60 * 1000;

export const POSITIONS = ["QB", "RB", "WR", "TE"];

// Which year each win-percentage basis is. The backend keys them by the season
// itself, so these labels are the keys.
export const SOS_BASES = ["2025", "2026", "vspos"];
const SOS_LABELS = { 2025: "2025", 2026: "2026", vspos: "vs pos" };

// The numeric columns, in table order. Each is sortable and filterable, and
// `decimals` is how it prints — the values arrive at full precision and only
// the display is rounded, so filtering on 12.5 means 12.5 and not 12.45.
export const COLUMNS = [
  { key: "age", label: "Age", decimals: 1 },
  { key: "ktc", label: "KTC", decimals: 0 },
  { key: "fc", label: "FC", decimals: 0 },
  { key: "points", label: "Pts", decimals: 1 },
  { key: "ppg", label: "Pts/g", decimals: 1 },
  { key: "last5", label: "L5/g", decimals: 1 },
  { key: "games", label: "GP", decimals: 0 },
];

/**
 * The filterable, sortable shape of one fetched row.
 *
 * Both readings of each value are precomputed rather than derived at render:
 * the pill switches between them on every row at once, and sorting needs
 * whichever is showing.
 */
export function finderRow(row) {
  const name = [row.first_name, row.last_name].filter(Boolean).join(" ").trim();
  return {
    id: String(row.sleeper_id),
    name,
    searchable: normalise(name),
    position: row.position,
    team: row.team,
    injuryStatus: row.injury_status || null,
    age: numberOrNull(row.age),
    ktc: numberOrNull(row["KTC Value"]),
    fc: numberOrNull(row["FC Value"]),
    ktcPerPoint: valuePerPoint(row, "KTC Value"),
    fcPerPoint: valuePerPoint(row, "FC Value"),
    points: numberOrNull(row.pts_ppr),
    ppg: pointsPerGame(row),
    last5: numberOrNull(row.last5_ppg),
    games: numberOrNull(row.games_played ?? row.gp),
    positionRank: row["KTC Position Rank"] || null,
    sos: row.sos || null,
  };
}

function numberOrNull(value) {
  // Checked before coercing, because Number(null) and Number("") are both 0 and
  // Number.isFinite(0) is true — so coercing first turns every player nobody has
  // priced into one worth zero, which is the whole mistake this table is trying
  // not to make.
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/**
 * The value column's figure for a row, under the chosen reading.
 *
 * Split out because the table, the sort and the tests all need the same answer
 * and it is the one place the two readings of a value are chosen between.
 */
export function valueOf(row, which, basis) {
  if (which === "ktc") return basis === "perPoint" ? row.ktcPerPoint : row.ktc;
  return basis === "perPoint" ? row.fcPerPoint : row.fc;
}

/** The SoS cell a column is showing, or null. */
export function sosCellOf(row, window, basis) {
  return row.sos?.[window]?.[basis] || null;
}

/**
 * Rows passing every active filter.
 *
 * A null value never passes a bound. "Players costing under 400 per point" is
 * a claim about players whose cost is known; a player with no price is not
 * cheap, they are unpriced — the same reasoning the backend uses for keeping
 * them null rather than zero.
 */
export function filterRows(rows, filters) {
  const query = normalise(filters.query || "");
  const positions = filters.positions || [];

  return rows.filter((row) => {
    if (positions.length && !positions.includes(row.position)) return false;
    if (query && !row.searchable.includes(query)) return false;

    for (const [key, bound] of Object.entries(filters.ranges || {})) {
      const value = row[key];
      if (bound?.min != null && (value == null || value < bound.min)) return false;
      if (bound?.max != null && (value == null || value > bound.max)) return false;
    }
    return true;
  });
}

/**
 * Rows in sorted order.
 *
 * `basis` is part of the sort, not read from the pills, and that is the point:
 * a pill chooses what a column *shows*, and changing what is shown is not a
 * request to reorder the table. So the basis is captured when a header is
 * clicked and carried here, which leaves the order alone until the next click.
 *
 * Missing values always sort last, whichever direction is asked for. They are
 * not the smallest and not the largest; they are absent, and a column sorted
 * to find the cheapest player in the league should not open with every player
 * nobody has priced.
 */
export function sortRows(rows, { key, direction, basis }) {
  const pick = (row) => {
    if (key === "name") return row.name;
    if (key === "position") return row.position;
    if (key === "ktc" || key === "fc") return valueOf(row, key, basis);
    if (key === "sosRos") return sosCellOf(row, "ros", basis)?.value ?? null;
    if (key === "sosPost") return sosCellOf(row, "post", basis)?.value ?? null;
    return row[key];
  };

  const sorted = [...rows];
  sorted.sort((a, b) => {
    const left = pick(a);
    const right = pick(b);
    if (left == null && right == null) return 0;
    if (left == null) return 1;
    if (right == null) return -1;
    if (typeof left === "string") {
      return direction === "asc" ? left.localeCompare(right) : right.localeCompare(left);
    }
    return direction === "asc" ? left - right : right - left;
  });
  return sorted;
}

/**
 * Which pill a column is reading right now.
 *
 * Captured into the sort when a header is clicked, so that a later pill change
 * does not retroactively reorder the table.
 */
export function basisFor(key, { valueBasis, rosBasis, postBasis }) {
  if (key === "ktc" || key === "fc") return valueBasis;
  if (key === "sosRos") return rosBasis;
  if (key === "sosPost") return postBasis;
  return null;
}

/** The direction a column should open on, so one click lands somewhere useful. */
export function defaultDirectionFor(key, basis) {
  if (key === "name" || key === "position") return "asc";
  if (key === "age") return "asc";
  // Cost per point is the one figure where small is good.
  if ((key === "ktc" || key === "fc") && basis === "perPoint") return "asc";
  // A lower win percentage, or more points allowed, is the easier draw — and
  // the easy end is what you look for when shopping for a player.
  if (key === "sosRos" || key === "sosPost") return "asc";
  return "desc";
}

// ── Cells ────────────────────────────────────────────────────────────────────

/**
 * One strength-of-schedule cell: the figure, then its rank.
 *
 * The unit follows the basis rather than being guessed from the number. The
 * year bases are win rates and read as a percentage; `vs pos` is fantasy points
 * allowed and reads as a score. Formatting a win rate as a score would print
 * 0.6 where 58% was meant, and the reverse prints 3160%.
 */
export function SosCell({ cell, basis }) {
  if (!cell || cell.value == null) return <td className="ss-num ss-muted">–</td>;

  const figure = basis === "vspos"
    ? cell.value.toFixed(1)
    : `${Math.round(cell.value * 100)}%`;
  const colour = getDvpColor(cell.rank);

  return (
    <td
      className="ss-num finder-sos"
      style={colour ? { color: colour } : undefined}
      title={`${cell.games} game${cell.games === 1 ? "" : "s"}`}
    >
      {figure}
      {cell.rank ? <sup className="finder-rank">{ordinal(cell.rank)}</sup> : null}
    </td>
  );
}

function Numeric({ value, decimals }) {
  if (value == null) return <td className="ss-num ss-muted">–</td>;
  return <td className="ss-num">{value.toFixed(decimals)}</td>;
}

/** One player. `added` is whether this row has just been sent to the trade. */
export function FinderRow({ row, valueBasis, rosWindowBasis, postWindowBasis, added, onAdd }) {
  return (
    <tr>
      <td className="ss-center">
        <PositionPill position={row.position} />
      </td>
      <td className="finder-name">
        {row.name}
        {row.injuryStatus ? (
          <span className="finder-injury" title={row.injuryStatus}>
            {row.injuryStatus.slice(0, 3).toUpperCase()}
          </span>
        ) : null}
        {row.positionRank ? <span className="ss-muted"> {row.positionRank}</span> : null}
      </td>
      <td className="ss-center ss-muted">{row.team || "–"}</td>
      {COLUMNS.map((column) => (
        <Numeric
          key={column.key}
          value={
            column.key === "ktc" || column.key === "fc"
              ? valueOf(row, column.key, valueBasis)
              : row[column.key]
          }
          decimals={column.decimals}
        />
      ))}
      <SosCell cell={sosCellOf(row, "ros", rosWindowBasis)} basis={rosWindowBasis} />
      <SosCell cell={sosCellOf(row, "post", postWindowBasis)} basis={postWindowBasis} />
      <td className="ss-center">
        <button
          type="button"
          className={`finder-add${added ? " finder-added" : ""}`}
          onClick={() => onAdd(row)}
          title={`Add ${row.name} to the other side of the trade`}
          aria-label={`Add ${row.name} to the trade`}
        >
          <FontAwesomeIcon icon={added ? faCheck : faPlus} />
        </button>
      </td>
    </tr>
  );
}

// ── Controls ─────────────────────────────────────────────────────────────────

/**
 * The connected pills that choose what a column reads.
 *
 * They sit inside the column header, which is itself clickable to sort, so
 * every click here has to be stopped from bubbling: without it, choosing a
 * basis also re-sorted the table, which is not what picking a basis means.
 */
function BasisPills({ bases, labels, value, onChange, group }) {
  const choose = (event, basis) => {
    event.stopPropagation();
    onChange(basis);
  };

  return (
    <div
      className="finder-pills"
      role="group"
      aria-label={group}
      onClick={(event) => event.stopPropagation()}
    >
      {bases.map((basis) => (
        <button
          key={basis}
          type="button"
          className={`finder-pill${value === basis ? " finder-pill-on" : ""}`}
          onClick={(event) => choose(event, basis)}
          aria-pressed={value === basis}
        >
          {labels[basis]}
        </button>
      ))}
    </div>
  );
}

function RangeFilter({ column, bound, onChange }) {
  return (
    <label className="finder-range">
      <span className="finder-range-label">{column.label}</span>
      <input
        type="number"
        inputMode="decimal"
        placeholder="min"
        value={bound?.min ?? ""}
        onChange={(e) => onChange(column.key, "min", e.target.value)}
        aria-label={`Minimum ${column.label}`}
      />
      <input
        type="number"
        inputMode="decimal"
        placeholder="max"
        value={bound?.max ?? ""}
        onChange={(e) => onChange(column.key, "max", e.target.value)}
        aria-label={`Maximum ${column.label}`}
      />
    </label>
  );
}

// ── The page ─────────────────────────────────────────────────────────────────

function PlayerFinder({ onAddPlayer }) {
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState(null);

  const [query, setQuery] = useState("");
  const [positions, setPositions] = useState([]);
  const [ranges, setRanges] = useState({});
  const [valueBasis, setValueBasis] = useState("value");
  const [rosBasis, setRosBasis] = useState("2026");
  const [postBasis, setPostBasis] = useState("2026");
  // `basis` is the pill this sort was taken against, frozen at click time.
  const [sortConfig, setSortConfig] = useState({ key: "ktc", direction: "desc", basis: "value" });
  const [justAdded, setJustAdded] = useState({});

  useEffect(() => {
    let live = true;

    const load = async () => {
      const cached = readCache(CACHE_KEY, CACHE_TTL_MS);
      if (cached) {
        setRows(cached.map(finderRow));
        setStatus("ready");
        return;
      }
      try {
        const response = await fetch(`${BASE_URL}/player-finder/data`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (!live) return;
        writeCache(CACHE_KEY, data);
        setRows(data.map(finderRow));
        setStatus("ready");
      } catch (e) {
        if (!live) return;
        setError(e.message);
        setStatus("failed");
      }
    };

    load();
    return () => {
      live = false;
    };
  }, []);

  const handleSort = useCallback(
    (key) => {
      // The basis is read here, on the click, and then kept. Re-reading it on
      // every render is what used to let a pill reorder the table.
      const basis = basisFor(key, { valueBasis, rosBasis, postBasis });
      setSortConfig((previous) =>
        previous.key === key && previous.basis === basis
          ? { key, basis, direction: previous.direction === "asc" ? "desc" : "asc" }
          : { key, basis, direction: defaultDirectionFor(key, basis) }
      );
    },
    [valueBasis, rosBasis, postBasis]
  );

  const sortIcon = (key) => {
    if (sortConfig.key !== key) return faSort;
    return sortConfig.direction === "asc" ? faSortUp : faSortDown;
  };

  const setBound = (key, edge, raw) => {
    setRanges((previous) => {
      const value = raw === "" ? null : Number(raw);
      const next = { ...previous, [key]: { ...previous[key], [edge]: Number.isFinite(value) ? value : null } };
      if (next[key].min == null && next[key].max == null) delete next[key];
      return next;
    });
  };

  const togglePosition = (position) =>
    setPositions((previous) =>
      previous.includes(position)
        ? previous.filter((p) => p !== position)
        : [...previous, position]
    );

  // Deliberately not dependent on the pills: they change what the cells read,
  // not the order the rows sit in.
  const visible = useMemo(() => {
    const filtered = filterRows(rows, { query, positions, ranges });
    return sortRows(filtered, sortConfig);
  }, [rows, query, positions, ranges, sortConfig]);

  const add = (row) => {
    onAddPlayer?.(row);
    setJustAdded((previous) => ({ ...previous, [row.id]: true }));
  };

  const clearFilters = () => {
    setQuery("");
    setPositions([]);
    setRanges({});
  };

  const activeFilters = positions.length + Object.keys(ranges).length + (query ? 1 : 0);

  if (status === "loading") {
    return <div className="finder-notice">Loading players…</div>;
  }
  if (status === "failed") {
    return <div className="finder-notice finder-error">Could not load players: {error}</div>;
  }

  return (
    <div className="finder">
      <div className="finder-controls">
        <input
          className="finder-search"
          type="search"
          placeholder="Search players…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search players"
        />

        <div className="finder-positions" role="group" aria-label="Filter by position">
          {POSITIONS.map((position) => (
            <button
              key={position}
              type="button"
              className={`finder-position${
                positions.includes(position) ? ` finder-position-on ${positionClass(position)}` : ""
              }`}
              onClick={() => togglePosition(position)}
              aria-pressed={positions.includes(position)}
            >
              {position}
            </button>
          ))}
        </div>

        <span className="finder-count">
          {visible.length} of {rows.length}
        </span>

        {activeFilters > 0 && (
          <button type="button" className="finder-clear" onClick={clearFilters}>
            Clear filters
          </button>
        )}

        <span className="finder-info" tabIndex={0} role="note" aria-label="How to read this table">
          i
          <span className="finder-info-popover">
            Values are <strong>Superflex</strong> KeepTradeCut and FantasyCalc; points are{" "}
            <strong>PPR</strong>.
            <br />
            <strong>per pt</strong> is value divided by points per game — lower is cheaper. It
            compares a price on the years ahead against production this season, so it flatters an
            older productive player and penalises a young one who has not arrived yet.
            <br />
            Schedule strength: <strong>2025</strong> and <strong>2026</strong> are the average
            opponent win percentage; <strong>vs pos</strong> is the fantasy points those opponents
            allow to this player&apos;s position, and exists for this season only. On all three,{" "}
            <strong>1st is the hardest</strong> draw. Hover a figure for how many games it covers.
          </span>
        </span>
      </div>

      <div className="finder-ranges">
        {COLUMNS.map((column) => (
          <RangeFilter key={column.key} column={column} bound={ranges[column.key]} onChange={setBound} />
        ))}
      </div>

      <div className="ss-table-wrap">
        <table className="ss-table finder-table">
          <thead>
            <tr>
              <th className="ss-center">Pos</th>
              <th className="finder-sortable" onClick={() => handleSort("name")}>
                Player <FontAwesomeIcon icon={sortIcon("name")} />
              </th>
              <th className="ss-center">Team</th>
              {COLUMNS.map((column) => (
                <th
                  key={column.key}
                  className="ss-num finder-sortable"
                  onClick={() => handleSort(column.key)}
                >
                  {column.label} <FontAwesomeIcon icon={sortIcon(column.key)} />
                  {(column.key === "ktc" || column.key === "fc") && (
                    <BasisPills
                      bases={["value", "perPoint"]}
                      labels={{ value: "value", perPoint: "per pt" }}
                      value={valueBasis}
                      onChange={setValueBasis}
                      group={`${column.label} reading`}
                    />
                  )}
                </th>
              ))}
              <th className="ss-num finder-sortable" onClick={() => handleSort("sosRos")}>
                Rest of season <FontAwesomeIcon icon={sortIcon("sosRos")} />
                <BasisPills
                  bases={SOS_BASES}
                  labels={SOS_LABELS}
                  value={rosBasis}
                  onChange={setRosBasis}
                  group="Rest of season basis"
                />
              </th>
              <th className="ss-num finder-sortable" onClick={() => handleSort("sosPost")}>
                Playoffs W15-17 <FontAwesomeIcon icon={sortIcon("sosPost")} />
                <BasisPills
                  bases={SOS_BASES}
                  labels={SOS_LABELS}
                  value={postBasis}
                  onChange={setPostBasis}
                  group="Playoff basis"
                />
              </th>
              <th className="ss-center">Add</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <FinderRow
                key={row.id}
                row={row}
                valueBasis={valueBasis}
                rosWindowBasis={rosBasis}
                postWindowBasis={postBasis}
                added={!!justAdded[row.id]}
                onAdd={add}
              />
            ))}
          </tbody>
        </table>
        {visible.length === 0 && (
          <p className="finder-notice">No players match these filters.</p>
        )}
      </div>
    </div>
  );
}

export default PlayerFinder;

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

import {
  COLUMNS,
  FinderRow,
  SosCell,
  defaultDirectionFor,
  filterRows,
  finderRow,
  sortRows,
  valueOf,
} from "./PlayerFinder";
import { valuePerPoint } from "./tradeValues";

// user-event is v13 here and does not flush React 18 state the way the newer
// API expects, so interactions go through fireEvent — same as LeagueIssues.test.
const click = (el) => fireEvent.click(el);

const table = (children) => render(<table><tbody>{children}</tbody></table>);

// ── Fixtures ────────────────────────────────────────────────────────────────

const cell = (value, rank, games = 3) => ({ value, rank, games });

function raw(overrides = {}) {
  return {
    sleeper_id: "1",
    first_name: "Jordan",
    last_name: "Love",
    position: "QB",
    team: "GB",
    age: 27,
    injury_status: null,
    "KTC Value": 5600,
    "KTC Position Rank": "QB8",
    "FC Value": 4100,
    pts_ppr: 120,
    gp: 6,
    games_played: 6,
    last5_ppg: 18.4,
    sos: {
      ros: { 2025: cell(0.54, 6, 11), 2026: cell(0.58, 1, 11), vspos: cell(31.6, 12, 11) },
      post: { 2025: cell(0.33, 30), 2026: cell(0.4, 24), vspos: cell(29.3, 24) },
    },
    ...overrides,
  };
}

const row = (overrides) => finderRow(raw(overrides));

// ── The row model ───────────────────────────────────────────────────────────

describe("finderRow", () => {
  it("derives both readings of each value", () => {
    const built = row();

    expect(built.ktc).toBe(5600);
    // 120 points over 6 games is 20.0 a game, so 5600 / 20 = 280.
    expect(built.ktcPerPoint).toBe(280);
    expect(built.ppg).toBe(20);
  });

  it("keeps a missing value missing rather than zero", () => {
    const built = row({ "KTC Value": null, "FC Value": null });

    expect(built.ktc).toBeNull();
    expect(built.ktcPerPoint).toBeNull();
  });
});

describe("valuePerPoint", () => {
  it("is null for a player who has played and not scored", () => {
    // Sixty-five players in the current season. Either Infinity or 0 would
    // sort them to the top as the best value in the league.
    expect(valuePerPoint({ "KTC Value": 800, pts_ppr: 0, gp: 4 }, "KTC Value")).toBeNull();
  });

  it("is null when nobody has priced the player", () => {
    expect(valuePerPoint({ "KTC Value": null, pts_ppr: 90, gp: 5 }, "KTC Value")).toBeNull();
  });

  it("is null before any game has been played", () => {
    expect(valuePerPoint({ "KTC Value": 800, pts_ppr: 0, gp: 0 }, "KTC Value")).toBeNull();
  });

  it("is null for negative production, which really happens", () => {
    // Andy Dalton is on -1.0 points for the season in the live data. A negative
    // divisor would otherwise produce a negative cost and sort to the very top
    // of the bargains.
    expect(valuePerPoint({ "KTC Value": 800, pts_ppr: -1, gp: 1 }, "KTC Value")).toBeNull();
  });
});

// ── Filters ─────────────────────────────────────────────────────────────────

describe("filterRows", () => {
  const rows = [
    row({ sleeper_id: "1", last_name: "Love", position: "QB", age: 27 }),
    row({ sleeper_id: "2", first_name: "Puka", last_name: "Nacua", position: "WR", age: 25 }),
    row({ sleeper_id: "3", first_name: "Sam", last_name: "LaPorta", position: "TE", age: 24 }),
  ];

  it("narrows by position", () => {
    const kept = filterRows(rows, { positions: ["WR", "TE"] });

    expect(kept.map((r) => r.id)).toEqual(["2", "3"]);
  });

  it("keeps everything when no position is chosen", () => {
    expect(filterRows(rows, { positions: [] })).toHaveLength(3);
  });

  it("matches a name case- and punctuation-insensitively", () => {
    expect(filterRows(rows, { query: "NACUA" }).map((r) => r.id)).toEqual(["2"]);
    expect(filterRows(rows, { query: "laporta" }).map((r) => r.id)).toEqual(["3"]);
  });

  it("applies a minimum inclusively", () => {
    const kept = filterRows(rows, { ranges: { age: { min: 25 } } });

    expect(kept.map((r) => r.age).sort()).toEqual([25, 27]);
  });

  it("applies a maximum inclusively", () => {
    const kept = filterRows(rows, { ranges: { age: { max: 25 } } });

    expect(kept.map((r) => r.age).sort()).toEqual([24, 25]);
  });

  it("combines bounds into a band", () => {
    const kept = filterRows(rows, { ranges: { age: { min: 25, max: 26 } } });

    expect(kept.map((r) => r.id)).toEqual(["2"]);
  });

  it("filters out the small samples a games floor is for", () => {
    const sparse = [
      row({ sleeper_id: "a", games_played: 1 }),
      row({ sleeper_id: "b", games_played: 6 }),
    ];

    expect(filterRows(sparse, { ranges: { games: { min: 4 } } }).map((r) => r.id)).toEqual(["b"]);
  });

  it("excludes a player with no value when a value bound is set", () => {
    // Unpriced is not cheap. "Under 400 per point" is a claim about players
    // whose cost is known.
    const mixed = [row({ sleeper_id: "known" }), row({ sleeper_id: "unknown", "KTC Value": null })];

    const kept = filterRows(mixed, { ranges: { ktc: { min: 1 } } });

    expect(kept.map((r) => r.id)).toEqual(["known"]);
  });
});

// ── Sorting ─────────────────────────────────────────────────────────────────

describe("sortRows", () => {
  const rows = [
    row({ sleeper_id: "cheap", "KTC Value": 2000, pts_ppr: 120, gp: 6 }),   // 100/pt
    row({ sleeper_id: "dear", "KTC Value": 8000, pts_ppr: 120, gp: 6 }),    // 400/pt
    row({ sleeper_id: "scoreless", "KTC Value": 3000, pts_ppr: 0, gp: 6 }), // null
  ];

  it("sorts descending on raw value", () => {
    const sorted = sortRows(rows, { key: "ktc", direction: "desc" }, { valueBasis: "value" });

    expect(sorted.map((r) => r.id)).toEqual(["dear", "scoreless", "cheap"]);
  });

  it("puts the best bargain first on cost per point", () => {
    const sorted = sortRows(rows, { key: "ktc", direction: "asc" }, { valueBasis: "perPoint" });

    expect(sorted[0].id).toBe("cheap");
  });

  it("sorts a player with no figure last, not first", () => {
    // The mistake that would make this column actively misleading: a player
    // who has scored nothing is not the cheapest production in the league.
    const ascending = sortRows(rows, { key: "ktc", direction: "asc" }, { valueBasis: "perPoint" });
    const descending = sortRows(rows, { key: "ktc", direction: "desc" }, { valueBasis: "perPoint" });

    expect(ascending[ascending.length - 1].id).toBe("scoreless");
    expect(descending[descending.length - 1].id).toBe("scoreless");
  });

  it("sorts each schedule column on the basis that column is showing", () => {
    const teams = [
      row({ sleeper_id: "x", sos: { ...raw().sos, ros: { 2025: cell(0.9, 1), 2026: cell(0.1, 32), vspos: cell(20, 1) } } }),
      row({ sleeper_id: "y", sos: { ...raw().sos, ros: { 2025: cell(0.1, 32), 2026: cell(0.9, 1), vspos: cell(40, 32) } } }),
    ];

    const by2025 = sortRows(teams, { key: "sosRos", direction: "desc" }, { rosBasis: "2025" });
    const by2026 = sortRows(teams, { key: "sosRos", direction: "desc" }, { rosBasis: "2026" });

    expect(by2025[0].id).toBe("x");
    expect(by2026[0].id).toBe("y");
  });

  it("sorts names alphabetically", () => {
    const sorted = sortRows(
      [row({ sleeper_id: "1", last_name: "Zeta" }), row({ sleeper_id: "2", last_name: "Alpha" })],
      { key: "name", direction: "asc" },
      {}
    );

    expect(sorted.map((r) => r.id)).toEqual(["2", "1"]);
  });
});

describe("defaultDirectionFor", () => {
  it("opens raw value on the biggest and cost per point on the smallest", () => {
    expect(defaultDirectionFor("ktc", "value")).toBe("desc");
    expect(defaultDirectionFor("ktc", "perPoint")).toBe("asc");
  });

  it("opens age and the schedule columns ascending", () => {
    expect(defaultDirectionFor("age")).toBe("asc");
    expect(defaultDirectionFor("sosRos")).toBe("asc");
    expect(defaultDirectionFor("sosPost")).toBe("asc");
  });

  it("opens production on the biggest", () => {
    expect(defaultDirectionFor("points")).toBe("desc");
    expect(defaultDirectionFor("last5")).toBe("desc");
  });
});

// ── The value pill ──────────────────────────────────────────────────────────

describe("valueOf", () => {
  it("returns the reading the pill has selected", () => {
    const built = row();

    expect(valueOf(built, "ktc", "value")).toBe(5600);
    expect(valueOf(built, "ktc", "perPoint")).toBe(280);
    expect(valueOf(built, "fc", "value")).toBe(4100);
    expect(valueOf(built, "fc", "perPoint")).toBe(205);
  });
});

// ── The schedule cell ───────────────────────────────────────────────────────

describe("SosCell", () => {
  it("prints a win rate as a percentage", () => {
    table(<tr><SosCell cell={cell(0.577, 1, 11)} basis="2026" /></tr>);

    expect(screen.getByText("58%")).toBeInTheDocument();
    expect(screen.getByText("1st")).toBeInTheDocument();
  });

  it("prints points allowed as a score, not a percentage", () => {
    // The formatter follows the basis rather than guessing from the value.
    // Guessing wrong here prints 3160%.
    table(<tr><SosCell cell={cell(31.6, 12, 11)} basis="vspos" /></tr>);

    expect(screen.getByText("31.6")).toBeInTheDocument();
    expect(screen.getByText("12th")).toBeInTheDocument();
  });

  it("says how many games the average covers", () => {
    table(<tr><SosCell cell={cell(0.5, 4, 10)} basis="2026" /></tr>);

    // Ten games and eleven are different statements, and byes mean both occur.
    expect(screen.getByTitle("10 games")).toBeInTheDocument();
  });

  it("shows a dash where there is nothing to show", () => {
    table(<tr><SosCell cell={null} basis="2025" /></tr>);

    expect(screen.getByText("–")).toBeInTheDocument();
  });
});

// ── Adding to the trade ─────────────────────────────────────────────────────

describe("FinderRow", () => {
  const renderRow = (props = {}) =>
    table(
      <FinderRow
        row={row()}
        valueBasis="value"
        rosWindowBasis="2026"
        postWindowBasis="2026"
        added={false}
        onAdd={() => {}}
        {...props}
      />
    );

  it("hands the whole row to the caller, which knows the Sleeper id", () => {
    const onAdd = jest.fn();
    renderRow({ onAdd });

    click(screen.getByRole("button", { name: /add jordan love/i }));

    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd.mock.calls[0][0].id).toBe("1");
  });

  it("shows the value the pill selected", () => {
    renderRow({ valueBasis: "perPoint" });

    expect(screen.getByText("280")).toBeInTheDocument();
    expect(screen.queryByText("5600")).not.toBeInTheDocument();
  });

  it("switches the schedule basis per column independently", () => {
    renderRow({ rosWindowBasis: "vspos", postWindowBasis: "2026" });

    expect(screen.getByText("31.6")).toBeInTheDocument();  // ros, vs pos
    expect(screen.getByText("40%")).toBeInTheDocument();   // post, 2026
  });

  it("prints a dash rather than a zero for an unknown figure", () => {
    renderRow({ row: row({ "KTC Value": null }) });

    expect(screen.getAllByText("–").length).toBeGreaterThan(0);
  });
});

describe("COLUMNS", () => {
  it("covers every filter the finder offers", () => {
    expect(COLUMNS.map((c) => c.key)).toEqual([
      "age", "ktc", "fc", "points", "ppg", "last5", "games",
    ]);
  });
});

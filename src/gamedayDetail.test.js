import { detailPair, detailRows, rowsTotal } from "./gamedayDetail";

// The slots of the real league these numbers came from: 11 starters over
// QB/RB/RB/WR/WR/WR/TE/FLEX/FLEX/FLEX/SUPER_FLEX, bench already stripped.
const SLOTS = ["QB", "RB", "RB", "WR", "WR", "WR", "TE", "FLEX", "FLEX", "FLEX", "SUPER_FLEX"];

const PLAYER_MAP = {
  "1": { first_name: "Jordan", last_name: "Love", position: "QB", team: "GB" },
  "2": { first_name: "Jahmyr", last_name: "Gibbs", position: "RB", team: "DET" },
  "3": { first_name: "Puka", last_name: "Nacua", position: "WR", team: "LAR" },
};

// Scoring trimmed to what these tests price: half a point a reception, a tenth
// a yard, six a touchdown.
const SCORING = { rec: 0.5, rec_yd: 0.1, rec_td: 6, pass_yd: 0.04, pass_td: 4 };

const PROJECTIONS = {
  "1": { pts_ppr: 21, pass_yd: 275, pass_td: 2 },      // 11 + 8 = 19.0
  "2": { pts_ppr: 17.5, rec: 4, rec_yd: 30 },          // 2 + 3 = 5.0
  // "3" deliberately absent: Sleeper projects most of a week's players, not all.
};

const row = (over = {}) => ({
  roster_id: 11,
  starters: ["1", "2", "3"],
  starters_points: [18.5, 29.0, 12.1],
  players_points: { 1: 18.5, 2: 29.0, 3: 12.1 },
  ...over,
});

describe("detailRows", () => {
  it("pairs each starter with the slot its index claims", () => {
    const rows = detailRows({ restRow: row(), playerMap: PLAYER_MAP, slots: SLOTS });

    expect(rows.map((r) => r.slot)).toEqual(["QB", "RB", "RB"]);
    expect(rows.map((r) => r.name)).toEqual(["Jordan Love", "Jahmyr Gibbs", "Puka Nacua"]);
  });

  it("labels flex and superflex slots from the same list", () => {
    const eleven = row({
      starters: ["1", "2", "3", "0", "0", "0", "0", "2", "3", "1", "1"],
      starters_points: [1, 2, 3, 0, 0, 0, 0, 8, 9, 10, 11],
    });

    const rows = detailRows({ restRow: eleven, playerMap: PLAYER_MAP, slots: SLOTS });

    expect(rows[7].slot).toBe("FLEX");
    expect(rows[10].slot).toBe("SUPER_FLEX");
  });

  it("takes actual points from the index, not the id map", () => {
    // The two normally agree. When they do not, the index is what Sleeper's own
    // running total is built from, so it wins.
    const disagreeing = row({
      starters_points: [18.5, 29.0, 12.1],
      players_points: { 1: 999, 2: 999, 3: 999 },
    });

    const rows = detailRows({ restRow: disagreeing, playerMap: PLAYER_MAP, slots: SLOTS });

    expect(rows.map((r) => r.actual)).toEqual([18.5, 29.0, 12.1]);
  });

  it("falls back to the id map when there is no indexed point", () => {
    const short = row({ starters_points: [] });

    const rows = detailRows({ restRow: short, playerMap: PLAYER_MAP, slots: SLOTS });

    expect(rows.map((r) => r.actual)).toEqual([18.5, 29.0, 12.1]);
  });

  it("prices each projection with the league's own scoring", () => {
    const rows = detailRows({
      restRow: row(), playerMap: PLAYER_MAP, slots: SLOTS,
      projections: PROJECTIONS, scoring: SCORING,
    });

    expect(rows[0].projected).toBeCloseTo(275 * 0.04 + 2 * 4, 5);  // 19.0
    expect(rows[1].projected).toBeCloseTo(4 * 0.5 + 30 * 0.1, 5);  // 5.0
  });

  it("says a player has no projection rather than calling it zero", () => {
    // Zero would read as "expected to score nothing", which is a claim.
    const rows = detailRows({
      restRow: row(), playerMap: PLAYER_MAP, slots: SLOTS,
      projections: PROJECTIONS, scoring: SCORING,
    });

    expect(rows[2].hasProjection).toBe(false);
    expect(rows[2].projected).toBeNull();
  });

  it("renders an empty slot without inventing a player", () => {
    const gap = row({ starters: ["1", "0", "3"], starters_points: [18.5, 0, 12.1] });

    const rows = detailRows({ restRow: gap, playerMap: PLAYER_MAP, slots: SLOTS });

    expect(rows[1]).toMatchObject({ slot: "RB", id: null, name: null, actual: null });
  });

  it("keeps a starter the player_map has never heard of", () => {
    // Still in the lineup and still scoring. A blank row would hide that.
    const unknown = row({ starters: ["1", "4321", "3"] });

    const rows = detailRows({ restRow: unknown, playerMap: PLAYER_MAP, slots: SLOTS });

    expect(rows[1].name).toBe("4321");
    expect(rows[1].actual).toBe(29.0);
  });

  it("carries team and position through for the stat line and the pill", () => {
    const rows = detailRows({ restRow: row(), playerMap: PLAYER_MAP, slots: SLOTS });

    expect(rows[1]).toMatchObject({ team: "DET", position: "RB" });
  });

  it("copes with a roster whose slots are not known", () => {
    const rows = detailRows({ restRow: row(), playerMap: PLAYER_MAP, slots: [] });

    expect(rows.map((r) => r.slot)).toEqual([null, null, null]);
    expect(rows).toHaveLength(3);
  });

  it("is an empty list rather than a crash for nothing at all", () => {
    expect(detailRows()).toEqual([]);
    expect(detailRows({ restRow: {} })).toEqual([]);
    expect(detailRows({ restRow: { starters: null } })).toEqual([]);
  });
});

describe("detailPair", () => {
  it("builds both sides against the same slots", () => {
    const pair = detailPair({
      mine: row(), theirs: row({ roster_id: 4, starters_points: [5, 6, 7] }),
      playerMap: PLAYER_MAP, slots: SLOTS,
    });

    expect(pair.mine.map((r) => r.actual)).toEqual([18.5, 29.0, 12.1]);
    expect(pair.theirs.map((r) => r.actual)).toEqual([5, 6, 7]);
    expect(pair.slots).toEqual(["QB", "RB", "RB"]);
  });

  it("has no opposing side on a bye", () => {
    // Rather than half a table, or a column of dashes pretending to be a team.
    const pair = detailPair({ mine: row(), theirs: null, playerMap: PLAYER_MAP, slots: SLOTS });

    expect(pair.theirs).toBeNull();
    expect(pair.mine).toHaveLength(3);
  });

  it("is null when there is no side of my own", () => {
    expect(detailPair({ mine: null })).toBeNull();
    expect(detailPair()).toBeNull();
  });
});

describe("rowsTotal", () => {
  it("adds up what the rows show, so a panel can be checked against the score", () => {
    const rows = detailRows({ restRow: row(), playerMap: PLAYER_MAP, slots: SLOTS });

    expect(rowsTotal(rows)).toBeCloseTo(59.6, 5);
  });

  it("skips the slots with nothing in them", () => {
    const gap = row({ starters: ["1", "0"], starters_points: [18.5, 0] });
    const rows = detailRows({ restRow: gap, playerMap: PLAYER_MAP, slots: SLOTS });

    expect(rowsTotal(rows)).toBe(18.5);
  });

  it("totals projections too, skipping the players without one", () => {
    const rows = detailRows({
      restRow: row(), playerMap: PLAYER_MAP, slots: SLOTS,
      projections: PROJECTIONS, scoring: SCORING,
    });

    expect(rowsTotal(rows, "projected")).toBeCloseTo(24.0, 5);
  });

  it("is zero for nothing", () => {
    expect(rowsTotal(null)).toBe(0);
    expect(rowsTotal([])).toBe(0);
  });
});

import {
  summariseWeek,
  percentOfMax,
  summariseSeason,
  missingWeeks,
} from "./seasonSummary";

const positionsOf = (id) =>
  ({ qb: ["QB"], rb1: ["RB"], rb2: ["RB"], wr1: ["WR"], bench: ["WR"] }[id] || []);
const SLOTS = ["QB", "RB", "WR", "BN"];

const rows = [
  {
    roster_id: 3,
    points: 40,
    players: ["qb", "rb1", "wr1", "bench"],
    players_points: { qb: 20, rb1: 10, wr1: 10, bench: 25 },
  },
  { roster_id: 9, points: 12, players: ["qb"], players_points: { qb: 12 } },
];

describe("summariseWeek", () => {
  it("reports what was scored and what was available", () => {
    const w = summariseWeek({ rows, rosterId: 3, rosterPositions: SLOTS, positionsOf });
    // Best lineup is qb 20 + rb1 10 + bench 25 in the WR slot.
    expect(w).toEqual({ points: 40, max: 55, pct: 72.7 });
  });

  it("is null for a roster that did not play", () => {
    expect(
      summariseWeek({ rows, rosterId: 99, rosterPositions: SLOTS, positionsOf })
    ).toBeNull();
    expect(summariseWeek({})).toBeNull();
  });

  it("falls back to the points map when players is absent", () => {
    // Which is how a cached week comes back.
    const slim = [{ roster_id: 3, points: 30, players_points: { qb: 20, rb1: 10 } }];
    const w = summariseWeek({ rows: slim, rosterId: 3, rosterPositions: SLOTS, positionsOf });
    expect(w.max).toBe(30);
  });
});

describe("percentOfMax", () => {
  it("is a tenth of a percent", () => {
    expect(percentOfMax(40, 55)).toBe(72.7);
    expect(percentOfMax(100, 100)).toBe(100);
  });

  it("says nothing rather than 100 when nothing was available", () => {
    // A week nobody scored in is not a perfectly managed one.
    expect(percentOfMax(0, 0)).toBeNull();
    expect(percentOfMax(10, null)).toBeNull();
  });
});

describe("summariseSeason", () => {
  const weeks = [
    { points: 100, max: 120, pct: 83.3 },
    { points: 150, max: 200, pct: 75 },
  ];

  it("averages the weeks that are loaded", () => {
    expect(summariseSeason(weeks)).toEqual({
      weeks: 2,
      points: 125,
      max: 160,
      pct: 78.1,
    });
  });

  it("weighs the percentage by points, not by week", () => {
    // Mean of the weekly percentages would be 79.15; a big week should count
    // for more than a small one.
    expect(summariseSeason(weeks).pct).toBe(78.1);
  });

  it("ignores weeks that are not loaded", () => {
    expect(summariseSeason([weeks[0], undefined, null, weeks[1]]).weeks).toBe(2);
  });

  it("copes with a week whose maximum is unknown", () => {
    const s = summariseSeason([{ points: 100, max: 120 }, { points: 50, max: null }]);
    expect(s.weeks).toBe(2);
    expect(s.points).toBe(75);
    // Averaged and compared only over the week a ceiling is known for.
    expect(s.max).toBe(120);
    expect(s.pct).toBe(83.3);
  });

  it("is null with nothing loaded", () => {
    expect(summariseSeason([])).toBeNull();
    expect(summariseSeason([null, undefined])).toBeNull();
    expect(summariseSeason()).toBeNull();
  });
});

describe("missingWeeks", () => {
  const statuses = { 1: "done", 2: "done", 3: "done", 4: "live", 5: "upcoming" };

  it("lists the finished weeks not yet loaded", () => {
    expect(missingWeeks(statuses, { 1: {} })).toEqual([2, 3]);
  });

  it("does not offer a week still being played, or one still to come", () => {
    expect(missingWeeks(statuses, {})).toEqual([1, 2, 3]);
  });

  it("is empty when everything is loaded", () => {
    expect(missingWeeks(statuses, { 1: {}, 2: {}, 3: {} })).toEqual([]);
  });

  it("counts a week that loaded to nothing as loaded", () => {
    // A bye or a roster that did not play must not be asked for again.
    expect(missingWeeks(statuses, { 1: null, 2: null, 3: null })).toEqual([]);
  });
});

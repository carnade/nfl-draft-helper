import {
  summariseWeek,
  percentOfMax,
  summariseSeason,
  missingWeeks,
  weekResult,
  pctTone,
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
    expect(w).toEqual({ points: 40, max: 55, pct: 72.7, result: null });
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

describe("weekResult", () => {
  const paired = [
    { roster_id: 3, matchup_id: 1, points: 110.5 },
    { roster_id: 9, matchup_id: 1, points: 100.25 },
    { roster_id: 4, matchup_id: 2, points: 90 },
  ];
  const mine = (id) => paired.find((r) => r.roster_id === id);

  it("calls the week", () => {
    expect(weekResult(paired, mine(3))).toBe("W");
    expect(weekResult(paired, mine(9))).toBe("L");
  });

  it("calls a draw a draw", () => {
    const tied = [
      { roster_id: 1, matchup_id: 5, points: 100 },
      { roster_id: 2, matchup_id: 5, points: 100 },
    ];
    expect(weekResult(tied, tied[0])).toBe("T");
  });

  it("agrees with the two decimals shown", () => {
    const close = [
      { roster_id: 1, matchup_id: 5, points: 100.004 },
      { roster_id: 2, matchup_id: 5, points: 100 },
    ];
    // Both print 100.00, so the letter must not say one of them won.
    expect(weekResult(close, close[0])).toBe("T");
  });

  it("is null on a bye", () => {
    expect(weekResult(paired, mine(4))).toBeNull();
    expect(weekResult(paired, { roster_id: 7, matchup_id: null, points: 5 })).toBeNull();
    expect(weekResult([], null)).toBeNull();
  });
});

describe("pctTone", () => {
  it("leaves the middle alone", () => {
    // Within a sixth of the ceiling is par, not praiseworthy.
    expect(pctTone(84)).toBe("");
    expect(pctTone(85)).toBe("");
    expect(pctTone(86)).toBe("");
  });

  it("steps towards red, full below 73.5", () => {
    expect(pctTone(83.9)).toBe("r1");
    expect(pctTone(80.5)).toBe("r1");
    expect(pctTone(80.4)).toBe("r2");
    expect(pctTone(77)).toBe("r2");
    expect(pctTone(76.9)).toBe("r3");
    expect(pctTone(73.5)).toBe("r3");
    expect(pctTone(73.4)).toBe("r4");
    expect(pctTone(70)).toBe("r4");
    expect(pctTone(0)).toBe("r4");
  });

  it("steps towards green, full from 96.5", () => {
    expect(pctTone(86.1)).toBe("g1");
    expect(pctTone(89.5)).toBe("g1");
    expect(pctTone(89.6)).toBe("g2");
    expect(pctTone(93)).toBe("g2");
    expect(pctTone(93.1)).toBe("g3");
    expect(pctTone(96.5)).toBe("g3");
    expect(pctTone(96.6)).toBe("g4");
    expect(pctTone(99.9)).toBe("g4");
  });

  it("takes the same number of steps either way", () => {
    // The bands are not the same width, but both ends are four steps out.
    expect(pctTone(83.9)).toBe("r1");
    expect(pctTone(86.1)).toBe("g1");
    expect(pctTone(73.4)).toBe("r4");
    expect(pctTone(96.6)).toBe("g4");
  });

  it("gives a perfect week its own colour", () => {
    // Gold rather than simply the greenest: starting the best possible lineup
    // is a different thing from nearly doing so.
    expect(pctTone(100)).toBe("gold");
    expect(pctTone(120)).toBe("gold");
  });

  it("has no tone for an unknown percentage", () => {
    expect(pctTone(null)).toBe("");
    expect(pctTone(undefined)).toBe("");
  });
});

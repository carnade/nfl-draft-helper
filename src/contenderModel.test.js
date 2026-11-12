import {
  DEFAULT_PLAYOFF_WEEK_START,
  applyTrade,
  averageSos,
  byeStatusFor,
  byeWeekByTeam,
  inferPartner,
  lineupForWeek,
  rankAmong,
  representativeLineup,
  startersIn,
  tradeImpact,
  windowPoints,
  windowsFor,
} from "./contenderModel";

// ── Fixtures ────────────────────────────────────────────────────────────────
//
// Shaped on Corona Masters (league 1395106065225355264): ten startable slots
// with two FLEX and a DEF, a fifteen-man roster, and the defence rostered under
// its team code the way Sleeper does it.

const ROSTER_POSITIONS = [
  "QB", "RB", "RB", "WR", "WR", "WR", "TE", "FLEX", "FLEX", "DEF",
  "BN", "BN", "BN", "BN", "BN",
];

// id → [position, team, points per week]
const SQUAD = {
  q1: ["QB", "BUF", 20],
  r1: ["RB", "NYJ", 15],
  r2: ["RB", "DET", 14],
  r3: ["RB", "CHI", 8],
  w1: ["WR", "LAR", 16],
  w2: ["WR", "NYJ", 13],
  w3: ["WR", "KC", 12],
  w4: ["WR", "TEN", 6],
  t1: ["TE", "SF", 11],
  t2: ["TE", "DEN", 4],
  s1: ["RB", "PIT", 9],
  s2: ["WR", "MIA", 7],
  s3: ["QB", "LV", 10],
  s4: ["TE", "ARI", 5],
  BUF: ["DEF", "BUF", 7],
  // Coming the other way.
  W5: ["WR", "GB", 18],
  R4: ["RB", "PHI", 17],
};

const MY_PLAYERS = [
  "q1", "r1", "r2", "r3", "w1", "w2", "w3", "w4",
  "t1", "t2", "s1", "s2", "s3", "s4", "BUF",
];

const positionsOf = (id) => (SQUAD[id] ? [SQUAD[id][0]] : []);
const teamOf = (id) => SQUAD[id]?.[1] || null;
const pointsFor = (id) => (SQUAD[id] ? SQUAD[id][2] : null);

const model = (overrides = {}) => ({
  rosterPositions: ROSTER_POSITIONS,
  playerIds: MY_PLAYERS,
  positionsOf,
  teamOf,
  pointsFor,
  byeWeeks: {},
  ...overrides,
});

// ── The horizon ─────────────────────────────────────────────────────────────

describe("windowsFor", () => {
  it("splits the rest of the season at the league's playoff week", () => {
    expect(windowsFor(10, 15)).toMatchObject({
      regular: [10, 11, 12, 13, 14],
      playoffs: [15, 16, 17],
    });
  });

  it("follows a league that starts its playoffs early", () => {
    expect(windowsFor(10, 14)).toMatchObject({
      regular: [10, 11, 12, 13],
      playoffs: [14, 15, 16],
    });
  });

  it("falls back to week 15 for the best-ball leagues that report 0", () => {
    // Sleeper sends playoff_week_start: 0 on best-ball leagues. Taken at face
    // value it would make the regular-season window the whole season.
    expect(windowsFor(10, 0).playoffStart).toBe(DEFAULT_PLAYOFF_WEEK_START);
    expect(windowsFor(10, 0).regular).toEqual([10, 11, 12, 13, 14]);
    expect(windowsFor(10, undefined).playoffStart).toBe(DEFAULT_PLAYOFF_WEEK_START);
    expect(windowsFor(10, null).playoffStart).toBe(DEFAULT_PLAYOFF_WEEK_START);
  });

  it("never looks back at a week already played", () => {
    const inside = windowsFor(16, 15);
    expect(inside.regular).toEqual([]);
    expect(inside.playoffs).toEqual([16, 17]);
  });

  it("is empty once the season is over", () => {
    const after = windowsFor(18, 15);
    expect(after.regular).toEqual([]);
    expect(after.playoffs).toEqual([]);
  });

  it("does not run past week 18", () => {
    expect(windowsFor(10, 17).playoffs).toEqual([17, 18]);
  });
});

// ── Byes ────────────────────────────────────────────────────────────────────

describe("byeWeekByTeam", () => {
  // Four teams, two weeks: everyone plays in week 1, CHI and DEN are idle in
  // week 2. Trimmed from Sleeper's own /schedule/nfl/regular/{season}.
  const SCHEDULE = [
    { week: 1, home: "CHI", away: "DEN" },
    { week: 1, home: "KC", away: "BUF" },
    { week: 2, home: "KC", away: "BUF" },
  ];

  it("gives each team the week it sits out", () => {
    expect(byeWeekByTeam(SCHEDULE)).toEqual({ CHI: 2, DEN: 2 });
  });

  it("leaves a team with no bye out rather than giving them week 0", () => {
    expect(byeWeekByTeam(SCHEDULE).KC).toBeUndefined();
  });

  it("byes nobody when the schedule could not be loaded", () => {
    // The failure that matters: an empty payload must not read as every team
    // being idle every week, which would flag a whole league.
    expect(byeWeekByTeam([])).toEqual({});
    expect(byeWeekByTeam(null)).toEqual({});
    expect(byeWeekByTeam(undefined)).toEqual({});
  });
});

describe("byeStatusFor", () => {
  const byes = { NYJ: 13, PIT: 9 };

  it("says a bye still to come", () => {
    expect(byeStatusFor("NYJ", byes, 10)).toEqual({ week: 13, done: false });
  });

  it("says a bye already taken", () => {
    expect(byeStatusFor("PIT", byes, 10)).toEqual({ week: 9, done: true });
  });

  it("counts the current week as still to come", () => {
    expect(byeStatusFor("PIT", byes, 9)).toEqual({ week: 9, done: false });
  });

  it("is null when the team or its bye is unknown", () => {
    expect(byeStatusFor("KC", byes, 10)).toBeNull();
    expect(byeStatusFor(null, byes, 10)).toBeNull();
  });
});

// ── One week's lineup ───────────────────────────────────────────────────────

describe("lineupForWeek", () => {
  it("starts the best ten and benches the rest", () => {
    const lineup = lineupForWeek(model({ week: 10 }));

    // QB 20, RB 15 + 14, WR 16 + 13 + 12, TE 11, FLEX 9 + 8, DEF 7.
    expect(lineup.total).toBe(125);
    expect(lineup.assignments).toHaveLength(10);
    expect(lineup.assignments.map((slot) => slot.playerId)).toEqual([
      "q1", "r1", "r2", "w1", "w2", "w3", "t1", "s1", "r3", "BUF",
    ]);
    expect(lineup.benched.sort()).toEqual(["s2", "s3", "s4", "t2", "w4"]);
  });

  it("comes back in roster order, not fill order", () => {
    const slots = lineupForWeek(model({ week: 10 })).assignments;
    expect(slots.map((slot) => slot.slot)).toEqual(ROSTER_POSITIONS.slice(0, 10));
    expect(slots.map((slot) => slot.slotIndex)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("refills the slot of a player on bye instead of losing the points", () => {
    const lineup = lineupForWeek(model({ week: 11, byeWeeks: { LAR: 11 } }));

    // w1 (16) is out, so s2 (7) — the best WR left on the bench — takes the
    // third WR slot and the two FLEX slots are unchanged. Dropping w1's points
    // without refilling the slot would read 109; the lineup is worth 116.
    expect(lineup.onBye).toEqual(["w1"]);
    expect(lineup.total).toBe(116);
    expect(lineup.total).not.toBe(125 - 16);
    expect(lineup.assignments.map((slot) => slot.playerId)).toContain("s2");
    expect(lineup.assignments.map((slot) => slot.playerId)).not.toContain("w1");
  });

  it("keeps an unpriced player in the pool at zero and flags them", () => {
    // Removing them would shrink the roster and promote someone who is not
    // genuinely the better start; at zero they are only ever started when
    // nothing else is eligible.
    const thin = ["q1", "r1", "r2", "w1", "w2", "w3", "t1", "s1", "r3", "mystery"];
    const lineup = lineupForWeek(
      model({
        week: 10,
        playerIds: thin,
        positionsOf: (id) => (id === "mystery" ? ["DEF"] : positionsOf(id)),
        teamOf: (id) => (id === "mystery" ? "SEA" : teamOf(id)),
        pointsFor: (id) => (id === "mystery" ? null : pointsFor(id)),
      })
    );

    const def = lineup.assignments.find((slot) => slot.slot === "DEF");
    expect(def.playerId).toBe("mystery");
    expect(def.points).toBe(0);
    expect(def.known).toBe(false);
    expect(lineup.unpriced).toEqual(["mystery"]);
    // Every other starter is still priced, so the week is usable.
    expect(lineup.priced).toBe(true);
  });

  it("reports a slot nothing can fill rather than swallowing it", () => {
    const noDefence = MY_PLAYERS.filter((id) => id !== "BUF");
    const lineup = lineupForWeek(model({ week: 10, playerIds: noDefence }));

    expect(lineup.unfilled).toEqual([{ slot: "DEF", slotIndex: 9 }]);
    expect(lineup.total).toBe(125 - 7);
  });

  it("is unpriced when nothing in the week has a number", () => {
    const lineup = lineupForWeek(model({ week: 10, pointsFor: () => null }));
    expect(lineup.priced).toBe(false);
  });

  it("is null when the league has no startable slots", () => {
    expect(lineupForWeek(model({ week: 10, rosterPositions: ["BN", "BN"] }))).toBeNull();
  });
});

// ── A window ────────────────────────────────────────────────────────────────

describe("windowPoints", () => {
  it("totals the weeks and averages over them", () => {
    const window = windowPoints(model({ weeks: [10, 11, 12] }));
    expect(window.total).toBe(375);
    expect(window.perWeek).toBe(125);
    expect(window.pricedWeeks).toEqual([10, 11, 12]);
  });

  it("divides by the weeks it actually has, not the weeks it asked for", () => {
    // A failed fetch for week 12 must narrow the claim. Counting it as a week
    // of zeros would read as a collapse rather than as missing data.
    const window = windowPoints(
      model({
        weeks: [10, 11, 12],
        pointsFor: (id, week) => (week === 12 ? null : pointsFor(id)),
      })
    );

    expect(window.pricedWeeks).toEqual([10, 11]);
    expect(window.total).toBe(250);
    expect(window.perWeek).toBe(125);
  });

  it("is null rather than zero when no week could be priced", () => {
    const window = windowPoints(model({ weeks: [10], pointsFor: () => null }));
    expect(window.total).toBeNull();
    expect(window.perWeek).toBeNull();
  });

  it("is null for an empty window", () => {
    expect(windowPoints(model({ weeks: [] })).perWeek).toBeNull();
  });

  it("counts the unpriced starters and the empty slots across the window", () => {
    const noDefence = MY_PLAYERS.filter((id) => id !== "BUF");
    const window = windowPoints(model({ weeks: [10, 11], playerIds: noDefence }));
    expect(window.emptySlots).toBe(2);
  });
});

// ── The trade itself ────────────────────────────────────────────────────────

describe("applyTrade", () => {
  it("removes what leaves and appends what arrives", () => {
    expect(applyTrade(["a", "b", "c"], { out: ["b"], in: ["d"] })).toEqual(["a", "c", "d"]);
  });

  it("does not duplicate a player already held", () => {
    expect(applyTrade(["a", "b"], { out: [], in: ["b", "c"] })).toEqual(["a", "b", "c"]);
  });

  it("drops Sleeper's empty-slot placeholders", () => {
    expect(applyTrade(["a", "0", null, undefined], { out: [], in: [] })).toEqual(["a"]);
  });

  it("takes ids of either type", () => {
    expect(applyTrade([1, 2], { out: ["1"], in: [3] })).toEqual(["2", "3"]);
  });
});

describe("tradeImpact", () => {
  // The case the feature exists for: four out, two in, and all four of the
  // outgoing players were on the bench.
  const FOUR_FOR_TWO = {
    give: ["r3", "w4", "t2", "s4"],
    get: ["W5", "R4"],
  };

  it("prices the new lineup rather than the players traded", () => {
    const impact = tradeImpact(model({ weeks: [10], ...FOUR_FOR_TWO }));

    expect(impact.before.total).toBe(125);
    expect(impact.after.total).toBe(143);
    expect(impact.deltaTotal).toBe(18);

    // Summing the traded players gives +12 (35 in, 23 out). The lineup is
    // worth +18, because two of the four were never starting and the two
    // arriving displace starters rather than adding to them.
    const naive = 18 + 17 - (8 + 6 + 4 + 5);
    expect(naive).toBe(12);
    expect(impact.deltaTotal).not.toBe(naive);
  });

  it("names the starters that change, traded or not", () => {
    const impact = tradeImpact(model({ weeks: [10], ...FOUR_FOR_TWO }));

    expect(impact.enters.sort()).toEqual(["R4", "W5"]);
    // s1 was not in the trade at all — he is squeezed out of a FLEX slot by
    // better players arriving. That is the thing a trade calculator misses.
    expect(impact.leaves.sort()).toEqual(["r3", "s1"]);
    expect(FOUR_FOR_TWO.give).not.toContain("s1");
  });

  it("gives a per-week figure as well as a total", () => {
    const impact = tradeImpact(model({ weeks: [10, 11, 12], ...FOUR_FOR_TWO }));
    expect(impact.deltaTotal).toBe(54);
    expect(impact.deltaPerWeek).toBe(18);
  });

  it("changes answer when a bye lands inside the window", () => {
    // W5 is on GB, idle in week 11. Over two weeks he is worth less than his
    // rate suggests, and the slot he would have filled goes back to w3.
    const impact = tradeImpact(
      model({ weeks: [10, 11], byeWeeks: { GB: 11 }, ...FOUR_FOR_TWO })
    );
    const flat = tradeImpact(model({ weeks: [10, 11], ...FOUR_FOR_TWO }));

    expect(impact.deltaTotal).toBeLessThan(flat.deltaTotal);
    const week11 = impact.after.byWeek.find((lineup) => lineup.week === 11);
    expect(week11.onBye).toEqual(["W5"]);
  });

  it("prices a pure giveaway and a pure acquisition", () => {
    expect(tradeImpact(model({ weeks: [10], give: ["r1"], get: [] })).deltaTotal)
      .toBeLessThan(0);
    expect(tradeImpact(model({ weeks: [10], give: [], get: ["W5"] })).deltaTotal)
      .toBeGreaterThan(0);
  });

  it("refuses to price a week it has no number for the traded players in", () => {
    // The case this exists for: Sleeper publishes no projection at all for a
    // player listed Out — not even for the weeks he is expected back. Priced at
    // zero he dragged the lineup down, so trading *for* a returning star read
    // as a loss. A week that cannot price the trade is dropped and named.
    const noNumber = (id, week) => (id === "W5" ? null : pointsFor(id, week));
    const impact = tradeImpact(
      model({ weeks: [10, 11], pointsFor: noNumber, give: ["r3"], get: ["W5"] })
    );

    expect(impact.skippedWeeks).toEqual([10, 11]);
    expect(impact.unpriceable).toEqual(["W5"]);
    expect(impact.deltaPerWeek).toBeNull();
    expect(impact.after.total).toBeNull();
  });

  it("keeps the weeks it can price and drops only the others", () => {
    const outUntil12 = (id, week) =>
      id === "W5" && week < 12 ? null : pointsFor(id, week);
    const impact = tradeImpact(
      model({ weeks: [10, 11, 12, 13], pointsFor: outUntil12, give: ["r3"], get: ["W5"] })
    );

    expect(impact.skippedWeeks).toEqual([10, 11]);
    expect(impact.after.pricedWeeks).toEqual([12, 13]);
    expect(impact.deltaPerWeek).toBeGreaterThan(0);
  });

  it("will not let a bye week be the only sample for an unknown player", () => {
    // The real shape of the bug: Nacua had no projection for any week, and his
    // team's bye was inside the window. With only the per-week rule, the bye
    // survived as "known" and the trade was judged on the one week a zero was
    // right — which still read as a heavy loss.
    const unknown = (id, week) => (id === "W5" ? null : pointsFor(id, week));
    const impact = tradeImpact(
      model({
        weeks: [10, 11, 12],
        byeWeeks: { GB: 11 },
        pointsFor: unknown,
        give: ["r3"],
        get: ["W5"],
      })
    );

    expect(impact.skippedWeeks).toEqual([10, 11, 12]);
    expect(impact.after.pricedWeeks).toEqual([]);
    expect(impact.deltaPerWeek).toBeNull();
  });

  it("counts a bye as a known week rather than a missing one", () => {
    // A player with no game is worth nothing that week, which is an answer.
    // Only "we have no figure" is a reason to drop the week.
    const impact = tradeImpact(
      model({ weeks: [10, 11], byeWeeks: { GB: 11 }, give: ["r3"], get: ["W5"] })
    );
    expect(impact.skippedWeeks).toEqual([]);
    expect(impact.unpriceable).toEqual([]);
  });

  it("is zero for a trade of players nobody would start", () => {
    const impact = tradeImpact(model({ weeks: [10], give: ["t2"], get: [] }));
    expect(impact.deltaTotal).toBe(0);
  });
});

describe("startersIn", () => {
  it("is everyone who starts at least once", () => {
    const window = windowPoints(model({ weeks: [10, 11], byeWeeks: { LAR: 11 } }));
    const ids = startersIn(window);
    expect(ids.has("w1")).toBe(true);   // starts in 10
    expect(ids.has("s2")).toBe(true);   // only in 11, covering the bye
  });
});

// ── Strength of schedule ────────────────────────────────────────────────────

describe("averageSos", () => {
  const cells = {
    a: { value: 0.6, games: 10 },
    b: { value: 0.5, games: 11 },
  };

  it("weights by games rather than averaging the averages", () => {
    // (0.6 x 10 + 0.5 x 11) / 21 = 0.54761..., not 0.55. The gap is a team
    // whose bye is still ahead having one fewer opponent in the figure.
    const average = averageSos(["a", "b"], (id) => cells[id]);
    expect(average.value).toBeCloseTo(0.547619, 6);
    expect(average.value).not.toBeCloseTo(0.55, 4);
    expect(average.games).toBe(21);
    expect(average.counted).toBe(2);
  });

  it("excludes a player with no cell and says so", () => {
    // Our schedule data is QB/RB/WR/TE only, so a defence has no cell. Read as
    // zero it would be the easiest schedule ever recorded.
    const average = averageSos(["a", "b", "BUF"], (id) => cells[id] || null);
    expect(average.value).toBeCloseTo(0.547619, 6);
    expect(average.counted).toBe(2);
    expect(average.total).toBe(3);
    expect(average.missing).toEqual(["BUF"]);
  });

  it("ignores a cell with no games behind it", () => {
    const average = averageSos(["a", "c"], (id) => cells[id] || { value: 0.9, games: 0 });
    expect(average.value).toBeCloseTo(0.6, 6);
    expect(average.missing).toEqual(["c"]);
  });

  it("is null when nothing is priced", () => {
    const average = averageSos(["x", "y"], () => null);
    expect(average.value).toBeNull();
    expect(average.counted).toBe(0);
  });
});

describe("rankAmong", () => {
  const league = [0.45, 0.5, 0.52, 0.55];

  it("ranks the easiest schedule first on opponent win rate", () => {
    expect(rankAmong(league, 0.45)).toBe(1);
    expect(rankAmong(league, 0.5)).toBe(2);
    expect(rankAmong(league, 0.55)).toBe(4);
  });

  it("inverts for points allowed, where a bigger number is the softer draw", () => {
    expect(rankAmong([20, 25, 30], 30, { easierIsHigher: true })).toBe(1);
    expect(rankAmong([20, 25, 30], 20, { easierIsHigher: true })).toBe(3);
  });

  it("gives tied schedules the same rank", () => {
    expect(rankAmong([0.5, 0.5, 0.6], 0.5)).toBe(1);
  });

  it("is null without a figure or without a league to compare against", () => {
    expect(rankAmong(league, null)).toBeNull();
    expect(rankAmong([0.5], 0.5)).toBeNull();
    expect(rankAmong([0.5, null, undefined], 0.5)).toBeNull();
  });
});

describe("representativeLineup", () => {
  it("prices a player over the window, so a bye demotes them", () => {
    // w1 at 16 a week is the best receiver on the roster — until he misses one
    // of the two weeks, which over the window makes him worth 8 and drops him
    // behind w2 (13) and w3 (12).
    const without = representativeLineup(model({ weeks: [10, 11] }));
    const withBye = representativeLineup(
      model({ weeks: [10, 11], byeWeeks: { LAR: 11 } })
    );

    const slotOf = (lineup, id) => lineup.assignments.find((s) => s.playerId === id);

    expect(slotOf(without, "w1")).toMatchObject({ slotIndex: 3, points: 16 });
    expect(slotOf(withBye, "w1")).toMatchObject({ slotIndex: 5, points: 8 });
    expect(slotOf(withBye, "w2").slotIndex).toBe(3);
    expect(withBye.total).toBeLessThan(without.total);
  });

  it("is one lineup for the whole window, not one per week", () => {
    const lineup = representativeLineup(model({ weeks: [15, 16, 17] }));
    expect(lineup.assignments).toHaveLength(10);
  });
});

// ── Who the other side is ───────────────────────────────────────────────────

describe("inferPartner", () => {
  const owners = { p1: 4, p2: 4, p3: 7 };
  const rosterIdOf = (id) => (owners[id] == null ? null : owners[id]);

  it("is the roster the players come from", () => {
    expect(inferPartner(["p1", "p2"], rosterIdOf)).toMatchObject({
      rosterId: "4",
      teamCount: 1,
      foreign: [],
    });
  });

  it("names the odd one out instead of folding it in", () => {
    const partner = inferPartner(["p1", "p2", "p3"], rosterIdOf);
    expect(partner.rosterId).toBe("4");
    expect(partner.teamCount).toBe(2);
    expect(partner.foreign).toEqual(["p3"]);
  });

  it("counts a player on nobody's roster as foreign", () => {
    const partner = inferPartner(["p1", "free"], rosterIdOf);
    expect(partner.rosterId).toBe("4");
    expect(partner.foreign).toEqual(["free"]);
  });

  it("is null with nothing to go on", () => {
    expect(inferPartner([], rosterIdOf)).toBeNull();
    expect(inferPartner(["free"], rosterIdOf)).toBeNull();
  });

  it("breaks a tie the same way every time", () => {
    // Two from each: the answer must not depend on which roster loaded first.
    const even = { a: 2, b: 2, c: 9, d: 9 };
    const by = (id) => even[id] ?? null;
    expect(inferPartner(["a", "b", "c", "d"], by).rosterId).toBe(
      inferPartner(["d", "c", "b", "a"], by).rosterId
    );
  });
});

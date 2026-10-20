import {
  exactPoints,
  standingsCompare,
  projectedPlayoffIds,
  draftOrder,
  bandFor,
  pickLabel,
  pickValueId,
  describePick,
} from "./draftOrder";

// A twelve-team league built so the two orderings disagree, which is the whole
// reason the rule is what it is. Roster 1 has the second-highest ceiling in the
// league and a losing record — it misses the projected playoffs and so drafts
// early despite being strong. Roster 12 is the reverse.
const roster = (id, wins, fpts, ppts) => ({
  roster_id: id,
  settings: { wins, fpts, fpts_decimal: 0, ppts, ppts_decimal: 0 },
});

const LEAGUE = [
  roster(1, 2, 1100, 1600), // high ceiling, bad record
  roster(2, 1, 900, 1200),
  roster(3, 3, 1000, 1300),
  roster(4, 2, 950, 1250),
  roster(5, 4, 1050, 1350),
  roster(6, 3, 1020, 1400),
  roster(7, 7, 1400, 1700),
  roster(8, 8, 1450, 1750),
  roster(9, 6, 1300, 1500),
  roster(10, 9, 1500, 1800),
  roster(11, 7, 1350, 1650),
  roster(12, 6, 1250, 1450),
];

describe("exactPoints", () => {
  it("keeps the hundredths Sleeper splits into a second field", () => {
    expect(exactPoints({ fpts: 1234, fpts_decimal: 56 }, "fpts")).toBe(1234.56);
  });

  it("copes with the decimal half or the whole thing being absent", () => {
    expect(exactPoints({ fpts: 1234 }, "fpts")).toBe(1234);
    expect(exactPoints({}, "fpts")).toBe(0);
    expect(exactPoints(undefined, "fpts")).toBe(0);
  });
});

describe("standingsCompare", () => {
  it("sorts on wins before points", () => {
    const sorted = [...LEAGUE].sort(standingsCompare).map((r) => r.roster_id);
    expect(sorted[0]).toBe(10); // 9 wins
    expect(sorted[sorted.length - 1]).toBe(2); // 1 win
  });
});

describe("projectedPlayoffIds", () => {
  it("takes the top six by the standings, not by ceiling", () => {
    const seeds = projectedPlayoffIds(LEAGUE, 6);
    expect([...seeds].sort((a, b) => a - b)).toEqual([7, 8, 9, 10, 11, 12]);
    // Roster 1 has the second-best ceiling in the league and still misses.
    expect(seeds.has(1)).toBe(false);
  });

  it("asks for no more seeds than there are teams", () => {
    expect(projectedPlayoffIds(LEAGUE, 40).size).toBe(12);
    expect(projectedPlayoffIds(LEAGUE, undefined).size).toBe(0);
  });
});

describe("draftOrder", () => {
  it("drafts the lowest ceiling first and puts the playoff teams behind", () => {
    const { slots, total, confidence } = draftOrder(LEAGUE, { playoffTeams: 6 });
    expect(total).toBe(12);
    expect(confidence).toBe("ok");

    const bySlot = [...slots.entries()]
      .sort((a, b) => a[1] - b[1])
      .map(([rosterId]) => rosterId);

    // Non-playoff teams first, ascending on ppts: 2(1200) 4(1250) 3(1300)
    // 5(1350) 6(1400) 1(1600). Then the six seeds, same rule within them:
    // 12(1450) 9(1500) 11(1650) 7(1700) 8(1750) 10(1800).
    expect(bySlot).toEqual([2, 4, 3, 5, 6, 1, 12, 9, 11, 7, 8, 10]);
  });

  it("is the same order whatever order the rosters arrive in", () => {
    const shuffled = [...LEAGUE].reverse();
    const a = draftOrder(LEAGUE, { playoffTeams: 6 }).slots;
    const b = draftOrder(shuffled, { playoffTeams: 6 }).slots;
    expect([...b.entries()].sort()).toEqual([...a.entries()].sort());
  });

  it("reports no order at all when nobody has scored", () => {
    const preseason = LEAGUE.map((r) => ({
      ...r,
      settings: { ...r.settings, ppts: 0, ppts_decimal: 0 },
    }));
    const order = draftOrder(preseason, { playoffTeams: 6 });
    expect(order.confidence).toBe("none");
    expect(order.slots.size).toBe(0);
  });

  it("falls back to ceiling alone, and says so, when the playoff count is unknown", () => {
    const order = draftOrder(LEAGUE, {});
    expect(order.confidence).toBe("low");
    const first = [...order.slots.entries()].find(([, slot]) => slot === 1);
    expect(first[0]).toBe(2); // lowest ppts in the league
  });

  it("collapses back to plain ceiling order when everyone makes the playoffs", () => {
    const all = draftOrder(LEAGUE, { playoffTeams: 12 });
    const none = draftOrder(LEAGUE, { playoffTeams: 0 });
    expect([...all.slots.entries()]).toEqual([...none.slots.entries()]);
  });

  it("handles an empty league", () => {
    expect(draftOrder([], { playoffTeams: 6 })).toEqual({
      slots: new Map(),
      total: 0,
      confidence: "none",
    });
  });
});

describe("bandFor", () => {
  it("splits a twelve into the thirds KeepTradeCut prices against", () => {
    expect([1, 2, 3, 4].map((s) => bandFor(s, 12))).toEqual(
      ["Early", "Early", "Early", "Early"]
    );
    expect(bandFor(5, 12)).toBe("Mid");
    expect(bandFor(8, 12)).toBe("Mid");
    expect(bandFor(9, 12)).toBe("Late");
    expect(bandFor(12, 12)).toBe("Late");
  });

  it("gives the remainder to Early when the league does not divide by three", () => {
    const sizes = (total) => {
      const out = { Early: 0, Mid: 0, Late: 0 };
      for (let s = 1; s <= total; s += 1) out[bandFor(s, total)] += 1;
      return out;
    };
    expect(sizes(12)).toEqual({ Early: 4, Mid: 4, Late: 4 });
    expect(sizes(10)).toEqual({ Early: 4, Mid: 3, Late: 3 });
    expect(sizes(14)).toEqual({ Early: 5, Mid: 5, Late: 4 });
    expect(sizes(8)).toEqual({ Early: 3, Mid: 3, Late: 2 });
  });

  it("refuses a slot it cannot place", () => {
    expect(bandFor(0, 12)).toBeNull();
    expect(bandFor(13, 12)).toBeNull();
    expect(bandFor(4, 0)).toBeNull();
  });
});

describe("pickLabel", () => {
  it("writes a pick the way a draft board does", () => {
    expect(pickLabel({ slot: 4, round: 1 })).toBe("1.04");
    expect(pickLabel({ slot: 11, round: 3 })).toBe("3.11");
  });

  it("does not clamp a round the value table happens not to cover", () => {
    expect(pickLabel({ slot: 4, round: 18 })).toBe("18.04");
  });

  it("reverses even rounds only when asked", () => {
    expect(pickLabel({ slot: 4, round: 2, total: 12 })).toBe("2.04");
    expect(pickLabel({ slot: 4, round: 2, total: 12, snake: true })).toBe("2.09");
    expect(pickLabel({ slot: 4, round: 3, total: 12, snake: true })).toBe("3.04");
  });

  it("returns nothing without a slot", () => {
    expect(pickLabel({ round: 1 })).toBeNull();
  });
});

describe("pickValueId", () => {
  it("builds the key the backend's pick table is keyed by", () => {
    expect(pickValueId({ season: 2027, band: "Early", round: 1 })).toBe("2027_early_1");
    expect(pickValueId({ season: 2029, band: "Mid", round: 3 })).toBe("2029_mid_3");
  });

  it("returns nothing when the band is unknown", () => {
    expect(pickValueId({ season: 2027, band: null, round: 1 })).toBeNull();
  });
});

describe("describePick", () => {
  const order = draftOrder(LEAGUE, { playoffTeams: 6 });

  it("bands a pick off whoever it originally belonged to", () => {
    // Roster 1 holds slot 6 of 12 — Mid — despite the pick being traded twice.
    const described = describePick(
      { originalOwner: 1, season: 2027, round: 2, newOwner: 8, previousOwner: 5 },
      { order, currentSeason: 2026 }
    );
    expect(described).toMatchObject({
      slot: 6,
      band: "Mid",
      label: "2.06",
      valueId: "2027_mid_2",
      reason: null,
    });
  });

  it("says nothing about a pick whose draft has already happened", () => {
    const described = describePick(
      { originalOwner: 1, season: 2026, round: 3 },
      { order, currentSeason: 2026 }
    );
    expect(described.band).toBeNull();
    expect(described.reason).toBe("past-season");
  });

  it("keeps the band for a season the value table does not reach", () => {
    const described = describePick(
      { originalOwner: 2, season: 2031, round: 1 },
      { order, currentSeason: 2026 }
    );
    expect(described.band).toBe("Early");
    expect(described.valueId).toBe("2031_early_1");
  });

  it("names the reason when the roster is gone", () => {
    const described = describePick(
      { originalOwner: 99, season: 2027, round: 1 },
      { order, currentSeason: 2026 }
    );
    expect(described.reason).toBe("unknown-roster");
    expect(described.slot).toBeNull();
  });

  it("refuses to band anything when there is no order", () => {
    const described = describePick(
      { originalOwner: 1, season: 2027, round: 1 },
      { order: { slots: new Map(), total: 12, confidence: "none" }, currentSeason: 2026 }
    );
    expect(described.reason).toBe("no-order");
    expect(described.band).toBeNull();
  });

  it("survives an unparseable pick", () => {
    expect(describePick(null, { order, currentSeason: 2026 }).reason).toBe("unparsed");
  });
});

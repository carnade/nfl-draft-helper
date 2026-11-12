import { bestLineupPoints, bestLineupSlots, pointsLeftOnBench } from "./bestLineup";

const POS = {
  qb1: ["QB"], qb2: ["QB"],
  rb1: ["RB"], rb2: ["RB"], rb3: ["RB"],
  wr1: ["WR"], wr2: ["WR"], wr3: ["WR"], wr4: ["WR"],
  te1: ["TE"], te2: ["TE"],
  k1: ["K"], def1: ["DEF"],
};
const positionsOf = (id) => POS[id] || [];

const STD = ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "BN", "BN"];

describe("bestLineupPoints", () => {
  it("takes the best of each position", () => {
    const pts = { qb1: 20, qb2: 30, rb1: 10, rb2: 12, rb3: 5, wr1: 8, wr2: 9, te1: 7 };
    // QB 30, RB 12 + 10, WR 9 + 8, TE 7, FLEX best left is rb3 at 5.
    expect(
      bestLineupPoints({
        rosterPositions: STD,
        players: Object.keys(pts),
        playerPoints: pts,
        positionsOf,
      })
    ).toBe(81);
  });

  it("ignores bench slots", () => {
    // Two BN in STD must not pull two more players in.
    const pts = { qb1: 10, rb1: 10, rb2: 10, wr1: 10, wr2: 10, te1: 10, rb3: 10, wr3: 99 };
    const total = bestLineupPoints({
      rosterPositions: STD,
      players: Object.keys(pts),
      playerPoints: pts,
      positionsOf,
    });
    // Seven starting slots: six at 10 plus wr3 at 99 in the flex.
    expect(total).toBe(159);
  });

  it("fills the specific slot before the flex", () => {
    // Why the order matters. Filling the flex first takes wr1 for it, leaving
    // the WR slot with wr2 and a total of 35. Taking the restrictive slot
    // first gives WR wr1 and the flex rb1, for 55.
    const pts = { wr1: 30, rb1: 25, wr2: 5 };
    expect(
      bestLineupPoints({
        rosterPositions: ["WR", "FLEX"],
        players: Object.keys(pts),
        playerPoints: pts,
        positionsOf,
      })
    ).toBe(55);
  });

  it("lets a superflex take a quarterback", () => {
    const pts = { qb1: 25, qb2: 22, rb1: 5 };
    expect(
      bestLineupPoints({
        rosterPositions: ["QB", "SUPER_FLEX"],
        players: Object.keys(pts),
        playerPoints: pts,
        positionsOf,
      })
    ).toBe(47);
  });

  it("does not start the same player twice", () => {
    const pts = { rb1: 40 };
    expect(
      bestLineupPoints({
        rosterPositions: ["RB", "FLEX"],
        players: ["rb1"],
        playerPoints: pts,
        positionsOf,
      })
    ).toBe(40);
  });

  it("counts an unfillable slot as nothing rather than giving up", () => {
    // A roster genuinely short a kicker still has a best lineup.
    const pts = { qb1: 20 };
    expect(
      bestLineupPoints({
        rosterPositions: ["QB", "K"],
        players: ["qb1"],
        playerPoints: pts,
        positionsOf,
      })
    ).toBe(20);
  });

  it("treats a missing score as zero", () => {
    expect(
      bestLineupPoints({
        rosterPositions: ["QB"],
        players: ["qb1"],
        playerPoints: {},
        positionsOf,
      })
    ).toBe(0);
  });

  it("rounds to the two decimals everything else is quoted in", () => {
    const pts = { qb1: 0.1, rb1: 0.2 };
    expect(
      bestLineupPoints({
        rosterPositions: ["QB", "RB"],
        players: ["qb1", "rb1"],
        playerPoints: pts,
        positionsOf,
      })
    ).toBe(0.3);
  });

  it("skips Sleeper's empty-slot placeholder", () => {
    expect(
      bestLineupPoints({
        rosterPositions: ["QB"],
        players: ["0", "qb1"],
        playerPoints: { qb1: 11 },
        positionsOf,
      })
    ).toBe(11);
  });

  it("is null when there is no lineup to fill", () => {
    expect(bestLineupPoints({ rosterPositions: ["BN", "BN"] })).toBeNull();
    expect(bestLineupPoints({})).toBeNull();
    expect(bestLineupPoints()).toBeNull();
  });
});

describe("pointsLeftOnBench", () => {
  it("is the gap between best and actual", () => {
    expect(pointsLeftOnBench(120.5, 100.25)).toBe(20.25);
  });

  it("is zero for a perfect lineup", () => {
    expect(pointsLeftOnBench(120.5, 120.5)).toBe(0);
  });

  it("never goes negative on a rounding hundredth", () => {
    expect(pointsLeftOnBench(120.5, 120.51)).toBe(0);
  });

  it("is null when the best lineup is unknown", () => {
    expect(pointsLeftOnBench(null, 100)).toBeNull();
  });
});

describe("bestLineupSlots", () => {
  const pts = { qb1: 20, qb2: 30, rb1: 10, rb2: 12, rb3: 5, wr1: 8, wr2: 9, te1: 7 };
  const picked = () =>
    bestLineupSlots({
      rosterPositions: STD,
      players: Object.keys(pts),
      playerPoints: pts,
      positionsOf,
    });

  it("says who is in which slot", () => {
    expect(picked().assignments).toEqual([
      { slot: "QB", slotIndex: 0, playerId: "qb2", points: 30 },
      { slot: "RB", slotIndex: 1, playerId: "rb2", points: 12 },
      { slot: "RB", slotIndex: 2, playerId: "rb1", points: 10 },
      { slot: "WR", slotIndex: 3, playerId: "wr2", points: 9 },
      { slot: "WR", slotIndex: 4, playerId: "wr1", points: 8 },
      { slot: "TE", slotIndex: 5, playerId: "te1", points: 7 },
      { slot: "FLEX", slotIndex: 6, playerId: "rb3", points: 5 },
    ]);
  });

  it("comes back in roster order, not in the order the slots were filled", () => {
    // The flex is filled last but sits last anyway; the point is that the
    // indices ascend, because a lineup is read down the slots.
    const indices = picked().assignments.map((slot) => slot.slotIndex);
    expect(indices).toEqual([...indices].sort((a, b) => a - b));
  });

  it("names everyone left over", () => {
    expect(picked().benched).toEqual(["qb1"]);
  });

  it("reports a slot nothing could fill", () => {
    // A roster genuinely short a kicker: the lineup is still valid and the
    // empty slot is said out loud rather than silently skipped.
    const withKicker = [...STD, "K"];
    const result = bestLineupSlots({
      rosterPositions: withKicker,
      players: Object.keys(pts),
      playerPoints: pts,
      positionsOf,
    });
    expect(result.unfilled).toEqual([{ slot: "K", slotIndex: 7 }]);
    expect(result.total).toBe(81);
  });

  it("is null when the league has no startable slots", () => {
    expect(
      bestLineupSlots({ rosterPositions: ["BN", "IR"], players: ["qb1"], playerPoints: pts, positionsOf })
    ).toBeNull();
  });

  it("agrees with bestLineupPoints, which is now built on it", () => {
    // The guard on the refactor: one optimiser, two readings of it.
    const cases = [
      { rosterPositions: STD, players: Object.keys(pts), playerPoints: pts },
      { rosterPositions: ["QB", "SUPER_FLEX"], players: ["qb1", "qb2", "rb1"], playerPoints: pts },
      { rosterPositions: ["WR", "FLEX"], players: ["wr1", "rb1", "wr2"], playerPoints: pts },
      { rosterPositions: ["BN"], players: ["qb1"], playerPoints: pts },
      { rosterPositions: STD, players: [], playerPoints: {} },
    ];
    for (const args of cases) {
      const full = bestLineupSlots({ ...args, positionsOf });
      expect(bestLineupPoints({ ...args, positionsOf })).toBe(full ? full.total : null);
    }
  });
});

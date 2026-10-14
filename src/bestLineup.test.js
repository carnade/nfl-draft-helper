import { bestLineupPoints, pointsLeftOnBench } from "./bestLineup";

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

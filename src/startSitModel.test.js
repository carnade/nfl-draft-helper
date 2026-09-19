import {
  buildSlots,
  isEligible,
  hardFlag,
  evaluateLineup,
  countActionable,
  SWAP_THRESHOLD,
} from "./startSitModel";

function player(id, overrides = {}) {
  return {
    id,
    name: id,
    position: "RB",
    fantasyPositions: ["RB"],
    team: "MIN",
    opponent: "GB",
    proj: 10,
    hasProjection: true,
    status: null,
    onBye: false,
    locked: false,
    ...overrides,
  };
}

function index(...players) {
  return Object.fromEntries(players.map((p) => [p.id, p]));
}

describe("buildSlots", () => {
  it("drops bench, IR and taxi positions", () => {
    expect(buildSlots(["QB", "RB", "FLEX", "BN", "BN", "IR", "TAXI"])).toEqual([
      "QB", "RB", "FLEX",
    ]);
  });
});

describe("isEligible", () => {
  it("lets a QB fill SUPER_FLEX but not FLEX", () => {
    const qb = player("qb", { position: "QB", fantasyPositions: ["QB"] });
    expect(isEligible("SUPER_FLEX", qb)).toBe(true);
    expect(isEligible("FLEX", qb)).toBe(false);
  });

  it("uses fantasy_positions, so a WR/TE fills REC_FLEX", () => {
    const hybrid = player("h", { position: "WR", fantasyPositions: ["WR", "TE"] });
    expect(isEligible("REC_FLEX", hybrid)).toBe(true);
    expect(isEligible("TE", hybrid)).toBe(true);
  });

  it("treats an unknown flex variant as RB/WR/TE", () => {
    expect(isEligible("WEIRD_FLEX", player("rb"))).toBe(true);
    expect(isEligible("WEIRD_FLEX", player("qb", { position: "QB", fantasyPositions: ["QB"] }))).toBe(false);
  });
});

describe("hardFlag", () => {
  it("flags bye, out and empty, but not questionable", () => {
    expect(hardFlag(null)).toBe("empty");
    expect(hardFlag(player("a", { onBye: true }))).toBe("bye");
    expect(hardFlag(player("b", { status: "Out" }))).toBe("out");
    expect(hardFlag(player("c", { status: "Questionable" }))).toBe(null);
  });
});

describe("evaluateLineup", () => {
  it("keeps the starter when nobody is better", () => {
    const rows = evaluateLineup({
      rosterPositions: ["RB", "BN"],
      starters: ["s"],
      bench: ["b"],
      playerById: index(player("s", { proj: 14 }), player("b", { proj: 9 })),
    });
    expect(rows[0].verdict).toBe("start");
    expect(rows[0].suggestion).toBeNull();
  });

  it("suggests a swap once the gap reaches the threshold", () => {
    const rows = evaluateLineup({
      rosterPositions: ["RB"],
      starters: ["s"],
      bench: ["b"],
      playerById: index(player("s", { proj: 10 }), player("b", { proj: 10 + SWAP_THRESHOLD })),
    });
    expect(rows[0].verdict).toBe("sit");
    expect(rows[0].suggestion.id).toBe("b");
    expect(rows[0].delta).toBeCloseTo(SWAP_THRESHOLD);
  });

  it("calls it a toss-up just below the threshold", () => {
    const rows = evaluateLineup({
      rosterPositions: ["RB"],
      starters: ["s"],
      bench: ["b"],
      playerById: index(player("s", { proj: 10 }), player("b", { proj: 10.99 })),
    });
    expect(rows[0].verdict).toBe("tossup");
  });

  it("gives ties to the player already starting", () => {
    const rows = evaluateLineup({
      rosterPositions: ["RB"],
      starters: ["s"],
      bench: ["b"],
      playerById: index(player("s", { proj: 12 }), player("b", { proj: 12 })),
    });
    expect(rows[0].verdict).toBe("start");
  });

  it("flags an Out starter even when the bench is worse", () => {
    const rows = evaluateLineup({
      rosterPositions: ["RB"],
      starters: ["s"],
      bench: ["b"],
      playerById: index(player("s", { proj: 20, status: "Out" }), player("b", { proj: 3 })),
    });
    expect(rows[0].verdict).toBe("sit");
    expect(rows[0].reason).toBe("out");
    expect(rows[0].suggestion.id).toBe("b");
  });

  it("says so when a flagged starter has no replacement", () => {
    const rows = evaluateLineup({
      rosterPositions: ["RB"],
      starters: ["s"],
      bench: [],
      playerById: index(player("s", { onBye: true })),
    });
    expect(rows[0].verdict).toBe("sit");
    expect(rows[0].noReplacement).toBe(true);
  });

  it("never suggests an injured or bye bench player", () => {
    const rows = evaluateLineup({
      rosterPositions: ["RB"],
      starters: ["s"],
      bench: ["hurt", "bye"],
      playerById: index(
        player("s", { proj: 5 }),
        player("hurt", { proj: 30, status: "Out" }),
        player("bye", { proj: 40, onBye: true })
      ),
    });
    expect(rows[0].verdict).toBe("start");
    expect(rows[0].suggestion).toBeNull();
  });

  it("separates 'not projected' from 'projected to score nothing'", () => {
    const rows = evaluateLineup({
      rosterPositions: ["RB"],
      starters: ["s"],
      bench: ["b"],
      playerById: index(
        player("s", { proj: 0, hasProjection: false }),
        player("b", { proj: 8 })
      ),
    });
    expect(rows[0].verdict).toBe("sit");
    expect(rows[0].reason).toBe("no projection");
  });

  it("says nothing about a slot whose game has started", () => {
    const rows = evaluateLineup({
      rosterPositions: ["RB"],
      starters: ["s"],
      bench: ["b"],
      playerById: index(player("s", { proj: 2, locked: true }), player("b", { proj: 20 })),
    });
    expect(rows[0].verdict).toBe("locked");
  });

  it("will not swap in a bench player whose own game has started", () => {
    const rows = evaluateLineup({
      rosterPositions: ["RB"],
      starters: ["s"],
      bench: ["b"],
      playerById: index(player("s", { proj: 2 }), player("b", { proj: 20, locked: true })),
    });
    expect(rows[0].verdict).toBe("start");
  });

  it("gives a contested bench player to the slot that gains most", () => {
    const rows = evaluateLineup({
      rosterPositions: ["RB", "FLEX"],
      starters: ["weak", "ok"],
      bench: ["star", "spare"],
      playerById: index(
        player("weak", { proj: 2 }),
        player("ok", { proj: 9 }),
        player("star", { proj: 15 }),
        player("spare", { proj: 10 })
      ),
    });
    expect(rows[0].suggestion.id).toBe("star");
    expect(rows[1].suggestion.id).toBe("spare");
  });

  it("handles an empty slot and more slots than starters", () => {
    const rows = evaluateLineup({
      rosterPositions: ["RB", "FLEX"],
      starters: ["0"],
      bench: ["b"],
      playerById: index(player("b", { proj: 7 })),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].verdict).toBe("sit");
    expect(rows[0].reason).toBe("empty");
    expect(rows[0].suggestion.id).toBe("b");
  });

  it("counts only the actionable rows", () => {
    const rows = evaluateLineup({
      rosterPositions: ["RB", "WR"],
      starters: ["s1", "s2"],
      bench: ["b1"],
      playerById: index(
        player("s1", { proj: 2 }),
        player("s2", { position: "WR", fantasyPositions: ["WR"], proj: 20 }),
        player("b1", { proj: 12 })
      ),
    });
    expect(countActionable(rows)).toBe(1);
  });
});

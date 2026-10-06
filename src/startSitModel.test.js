import {
  buildSlots,
  benchFrom,
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

const wr = (id, overrides = {}) =>
  player(id, { position: "WR", fantasyPositions: ["WR"], ...overrides });

// Sleeper publishes no projection at all for a backup, so projectedPoints sees no
// stat line and returns 0 — which is why proj and hasProjection disagree here.
const unprojected = (id, overrides = {}) =>
  player(id, { proj: 0, hasProjection: false, ...overrides });

describe("buildSlots", () => {
  it("drops bench, IR and taxi positions", () => {
    expect(buildSlots(["QB", "RB", "FLEX", "BN", "BN", "IR", "TAXI"])).toEqual([
      "QB", "RB", "FLEX",
    ]);
  });
});

describe("benchFrom", () => {
  // Shaped like a Sleeper roster: players is everyone, and the other three are
  // subsets of it rather than separate lists.
  const roster = {
    players: ["start1", "start2", "bench1", "bench2", "ir1", "taxi1", "taxi2"],
    starters: ["start1", "start2"],
    reserve: ["ir1"],
    taxi: ["taxi1", "taxi2"],
  };

  it("leaves out starters, IR and the taxi squad", () => {
    expect(benchFrom(roster)).toEqual(["bench1", "bench2"]);
  });

  it("never offers a taxi player, whatever else is going on", () => {
    // Starting one costs the taxi spot, so it is not a swap the page may suggest
    // — and after a lineup change it used to do exactly that, because Sleeper's
    // mutation returns the whole roster and no taxi list.
    expect(benchFrom({ ...roster, starters: [] })).not.toContain("taxi1");
    expect(benchFrom({ ...roster, starters: [] })).not.toContain("taxi2");
  });

  it("copes with a roster that has no taxi or IR at all", () => {
    expect(benchFrom({ players: ["a", "b"], starters: ["a"] })).toEqual(["b"]);
  });

  it("drops Sleeper's empty-slot placeholders", () => {
    expect(benchFrom({ players: ["a", "0", ""], starters: [] })).toEqual(["a"]);
  });

  it("compares as strings, so a numeric id still matches", () => {
    expect(benchFrom({ players: [1, 2, 3], starters: ["1"], taxi: [3] })).toEqual(["2"]);
  });

  it("returns nothing rather than throwing on an empty roster", () => {
    expect(benchFrom({})).toEqual([]);
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

  // Taken from the real week-5 lineups that exposed these bugs — Dårarnas Kamp
  // (9) and Fantasy Fools — with the actual projections, priced in each league's
  // own scoring.
  describe("regressions from week 5, 2026", () => {
    it("does not let a slot that keeps its starter hold a bench player hostage", () => {
      // Dårarnas Kamp: the RB slot holding a bye-week Kenneth Walker reported
      // "no eligible replacement" because the *other* RB slot had claimed J.K.
      // Dobbins on its way to deciding it would keep Cam Skattebo anyway.
      const rows = evaluateLineup({
        rosterPositions: ["RB", "RB"],
        starters: ["walker", "skattebo"],
        bench: ["dobbins"],
        playerById: index(
          unprojected("walker", { onBye: true }),
          player("skattebo", { proj: 12.7 }),
          player("dobbins", { proj: 9.0 })
        ),
      });
      expect(rows[0].suggestion?.id).toBe("dobbins");
      expect(rows[0].noReplacement).toBe(false);
      expect(rows[1].verdict).toBe("start");
      expect(rows[1].suggestion).toBeNull();
    });

    it("gives the bench to the slot that cannot play, not one merely behind", () => {
      // Rashee Rice (bye) was offered Kalif Raymond at 7.4 while Rome Odunze
      // (9.3) and Tre Tucker (8.1) sat reserved by slots that kept their own.
      const rows = evaluateLineup({
        rosterPositions: ["WR", "WR", "WR"],
        starters: ["rice", "collins", "swift"],
        bench: ["odunze", "tucker", "raymond"],
        playerById: index(
          wr("rice", { proj: 0, hasProjection: false, onBye: true }),
          wr("collins", { proj: 16.7 }),
          wr("swift", { proj: 14.7 }),
          wr("odunze", { proj: 9.3 }),
          wr("tucker", { proj: 8.1 }),
          wr("raymond", { proj: 7.4 })
        ),
      });
      expect(rows[0].suggestion?.id).toBe("odunze");
      expect(rows[1].suggestion).toBeNull();
      expect(rows[2].suggestion).toBeNull();
    });

    it("shares the bench out when two slots both need it", () => {
      // Both Rice and Tetairoa McMillan were on bye; the two best free WRs
      // should go to them, best first, rather than one of them going without.
      const rows = evaluateLineup({
        rosterPositions: ["WR", "WR"],
        starters: ["rice", "mcmillan"],
        bench: ["odunze", "tucker", "raymond"],
        playerById: index(
          wr("rice", { proj: 0, hasProjection: false, onBye: true }),
          wr("mcmillan", { proj: 0, hasProjection: false, onBye: true }),
          wr("odunze", { proj: 9.3 }),
          wr("tucker", { proj: 8.1 }),
          wr("raymond", { proj: 7.4 })
        ),
      });
      expect([rows[0].suggestion?.id, rows[1].suggestion?.id].sort()).toEqual([
        "odunze",
        "tucker",
      ]);
    });

    it("offers an unprojected backup to a bye-week starter", () => {
      // Fantasy Fools: Bryce Young on bye behind Shedeur Sanders and Anthony
      // Richardson, both active and both unprojected because Sleeper does not
      // project backups. A certain zero is worse than an unknown.
      const qb = (id, extra) =>
        player(id, { position: "QB", fantasyPositions: ["QB"], ...extra });
      const rows = evaluateLineup({
        rosterPositions: ["QB"],
        starters: ["young"],
        bench: ["sanders", "richardson"],
        playerById: index(
          qb("young", { proj: 0, hasProjection: false, onBye: true }),
          qb("sanders", { proj: 0, hasProjection: false }),
          qb("richardson", { proj: 0, hasProjection: false })
        ),
      });
      expect(rows[0].verdict).toBe("sit");
      expect(rows[0].noReplacement).toBe(false);
      expect(rows[0].suggestion).not.toBeNull();
      // Both remain selectable by hand, which is what the swap modal reads.
      expect(rows[0].candidates).toHaveLength(2);
    });

    it("never recommends an unprojected backup over a starter who is playing", () => {
      const qb = (id, extra) =>
        player(id, { position: "QB", fantasyPositions: ["QB"], ...extra });
      const rows = evaluateLineup({
        rosterPositions: ["QB"],
        starters: ["allen"],
        bench: ["rudolph"],
        playerById: index(
          qb("allen", { proj: 21.6 }),
          qb("rudolph", { proj: 0, hasProjection: false })
        ),
      });
      expect(rows[0].verdict).toBe("start");
      expect(rows[0].suggestion).toBeNull();
      // Allowed, just not advised.
      expect(rows[0].candidates).toHaveLength(1);
    });

    it("sorts projected candidates ahead of unprojected ones", () => {
      const rows = evaluateLineup({
        rosterPositions: ["RB"],
        starters: ["s"],
        bench: ["backup", "real"],
        playerById: index(
          player("s", { proj: 5 }),
          unprojected("backup"),
          player("real", { proj: 8 })
        ),
      });
      expect(rows[0].candidates.map((p) => p.id)).toEqual(["real", "backup"]);
      expect(rows[0].suggestion?.id).toBe("real");
    });

    it("tells an empty bench apart from one another slot is using", () => {
      const rows = evaluateLineup({
        rosterPositions: ["RB", "RB"],
        starters: ["bye1", "bye2"],
        bench: ["only"],
        playerById: index(
          unprojected("bye1", { onBye: true }),
          unprojected("bye2", { onBye: true }),
          player("only", { proj: 9 })
        ),
      });
      const served = rows.find((r) => r.suggestion);
      const unserved = rows.find((r) => !r.suggestion);
      expect(served.suggestion.id).toBe("only");
      // Nothing was left for the other slot, but the bench was not empty.
      expect(unserved.noReplacement).toBe(false);
      expect(unserved.benchSpokenFor).toBe(true);
    });

    it("does not recommend a taxi player to a slot with nothing else", () => {
      // Dårarnas Kamp (9) carries six taxi players; three of them are projected,
      // so a bye-week row would happily have suggested one.
      const bench = benchFrom({
        players: ["bye", "taxiRb"],
        starters: ["bye"],
        taxi: ["taxiRb"],
      });
      const rows = evaluateLineup({
        rosterPositions: ["RB"],
        starters: ["bye"],
        bench,
        playerById: index(
          unprojected("bye", { onBye: true }),
          player("taxiRb", { proj: 1.4 })
        ),
      });
      expect(rows[0].suggestion).toBeNull();
      expect(rows[0].candidates).toHaveLength(0);
      expect(rows[0].noReplacement).toBe(true);
    });

    it("still reports the gap when it keeps the starter ahead", () => {
      // The suggestion is withheld, but the row should not forget there was a
      // comparison — "ahead" and "no alternative" are different facts.
      const rows = evaluateLineup({
        rosterPositions: ["RB"],
        starters: ["s"],
        bench: ["b"],
        playerById: index(player("s", { proj: 12 }), player("b", { proj: 9 })),
      });
      expect(rows[0].verdict).toBe("start");
      expect(rows[0].reason).toBe("ahead");
      expect(rows[0].delta).toBeCloseTo(-3);
      expect(rows[0].suggestion).toBeNull();
    });

    it("says 'no alternative' only when the bench truly offers nothing", () => {
      const rows = evaluateLineup({
        rosterPositions: ["RB"],
        starters: ["s"],
        bench: [],
        playerById: index(player("s", { proj: 12 })),
      });
      expect(rows[0].reason).toBe("no alternative");
      expect(rows[0].delta).toBeNull();
    });
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

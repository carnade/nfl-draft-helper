import {
  reserveEligibleStatuses,
  freeReserveSlots,
  irIssueFor,
  findIrIssues,
  preselectIds,
  selectionIsFull,
  irReturnIssueFor,
  findIrReturnIssues,
} from "./irIssues";

// Shaped like the league objects LeagueList builds.
function league({
  id = "L1",
  name = "A League",
  slots = 5,
  flags = {},
  reserve = [],
  bench = [],
  starters = [],
  taxi = [],
  rosterId = 7,
  // Active capacity. Only the length matters.
  rosterPositions = Array.from({ length: 25 }, (_, i) => `slot${i}`),
} = {}) {
  return {
    league_id: id,
    name,
    settings: { reserve_slots: slots, ...flags },
    roster_positions: rosterPositions,
    userRoster: { reserve, uniquePlayers: bench, starters, taxi, rosterId },
  };
}

const PLAYERS = {
  healthy: { first_name: "Fully", last_name: "Fit", position: "WR", injury_status: null },
  ir1: { first_name: "Xavier", last_name: "Legette", position: "WR", injury_status: "IR" },
  ir2: { first_name: "Michael", last_name: "Pittman", position: "WR", injury_status: "IR" },
  pup: { first_name: "Pup", last_name: "Player", position: "RB", injury_status: "PUP" },
  out: { first_name: "Adonai", last_name: "Mitchell", position: "WR", injury_status: "Out" },
  qn: { first_name: "CeeDee", last_name: "Lamb", position: "WR", injury_status: "Questionable" },
  sus: { first_name: "Sus", last_name: "Player", position: "RB", injury_status: "Sus" },
  fit: { first_name: "Fit", last_name: "Player", position: "RB", injury_status: null },
};
const getPlayer = (_leagueId, id) => PLAYERS[id];

describe("reserveEligibleStatuses", () => {
  it("accepts IR and PUP with every flag off", () => {
    // Established from the live rosters: across nine leagues the only statuses
    // on reserve are IR and PUP, and several of those have no flags set.
    const allowed = reserveEligibleStatuses({});
    expect([...allowed].sort()).toEqual(["IR", "PUP"]);
  });

  it("does not accept Out unless the league says so", () => {
    expect(reserveEligibleStatuses({}).has("Out")).toBe(false);
    expect(reserveEligibleStatuses({ reserve_allow_out: 1 }).has("Out")).toBe(true);
  });

  it("adds each flagged status", () => {
    const allowed = reserveEligibleStatuses({ reserve_allow_sus: 1, reserve_allow_cov: 1 });
    expect(allowed.has("Sus")).toBe(true);
    expect(allowed.has("COV")).toBe(true);
    expect(allowed.has("Doubtful")).toBe(false);
  });

  it("ignores a flag set to zero", () => {
    expect(reserveEligibleStatuses({ reserve_allow_cov: 0 }).has("COV")).toBe(false);
  });

  it("copes with no settings at all", () => {
    expect(reserveEligibleStatuses(undefined).has("IR")).toBe(true);
  });
});

describe("freeReserveSlots", () => {
  it("counts the slots nobody is in", () => {
    expect(freeReserveSlots(league({ slots: 5, reserve: ["a", "b", "c"] }))).toBe(2);
  });

  it("is zero for a league with no reserve at all", () => {
    expect(freeReserveSlots(league({ slots: 0 }))).toBe(0);
  });

  it("never goes negative", () => {
    expect(freeReserveSlots(league({ slots: 2, reserve: ["a", "b", "c"] }))).toBe(0);
  });
});

describe("irIssueFor", () => {
  it("finds an IR player on the bench with room for him", () => {
    const issue = irIssueFor(
      league({ name: "Fantasy Fools", slots: 5, reserve: ["x", "y", "z"], bench: ["ir1", "qn"] }),
      getPlayer
    );
    expect(issue.freeSlots).toBe(2);
    expect(issue.candidates).toHaveLength(1);
    expect(issue.candidates[0]).toMatchObject({ id: "ir1", name: "Xavier Legette", status: "IR" });
    expect(issue.oversubscribed).toBe(false);
  });

  it("says nothing when there is no room", () => {
    expect(
      irIssueFor(league({ slots: 2, reserve: ["a", "b"], bench: ["ir1"] }), getPlayer)
    ).toBeNull();
  });

  it("says nothing when nobody on the bench qualifies", () => {
    expect(irIssueFor(league({ slots: 5, bench: ["qn", "fit"] }), getPlayer)).toBeNull();
  });

  it("will not offer an Out player in a league that does not allow it", () => {
    // reserve_allow_out is 0 in every one of these leagues, so offering him
    // would produce a move Sleeper refuses.
    expect(irIssueFor(league({ slots: 5, bench: ["out"] }), getPlayer)).toBeNull();
  });

  it("offers him when the league does allow it", () => {
    const issue = irIssueFor(
      league({ slots: 5, bench: ["out"], flags: { reserve_allow_out: 1 } }),
      getPlayer
    );
    expect(issue.candidates[0].id).toBe("out");
  });

  it("ignores players already on reserve, and starters", () => {
    const l = league({ slots: 5, reserve: ["ir1"], bench: ["qn"] });
    l.userRoster.starters = ["ir2"];
    expect(irIssueFor(l, getPlayer)).toBeNull();
  });

  it("orders the most clearly unavailable first", () => {
    const issue = irIssueFor(
      league({ slots: 5, bench: ["sus", "ir1", "pup"], flags: { reserve_allow_sus: 1 } }),
      getPlayer
    );
    expect(issue.candidates.map((c) => c.status)).toEqual(["IR", "PUP", "Sus"]);
  });

  it("flags a roster with more to move than room for them", () => {
    const issue = irIssueFor(
      league({ slots: 5, reserve: ["a", "b", "c", "d"], bench: ["ir1", "ir2", "pup"] }),
      getPlayer
    );
    expect(issue.freeSlots).toBe(1);
    expect(issue.candidates).toHaveLength(3);
    expect(issue.oversubscribed).toBe(true);
  });

  it("never offers a taxi-squad player, however the bench list was built", () => {
    // uniquePlayers already subtracts taxi, so a correct page never puts one
    // here. The rule says so itself now: Sleeper will not take a taxi player
    // into a reserve slot, and the taxi spot is what makes them cheap to hold.
    const l = league({ slots: 5, bench: ["ir1", "ir2"], taxi: ["ir1"] });
    const issue = irIssueFor(l, getPlayer);
    expect(issue.candidates.map((c) => c.id)).toEqual(["ir2"]);
  });

  it("never offers somebody already on reserve, or a starter", () => {
    const l = league({
      slots: 5,
      bench: ["ir1", "ir2", "pup"],
      reserve: ["ir1"],
      starters: ["pup"],
    });
    expect(irIssueFor(l, getPlayer).candidates.map((c) => c.id)).toEqual(["ir2"]);
  });

  it("says nothing at all when the only candidate is on taxi", () => {
    // Dårarnas Kamp (9) in October 2026: three reserve slots free and the only
    // IR player on the roster sitting on the taxi squad.
    expect(
      irIssueFor(league({ slots: 5, bench: ["ir1"], taxi: ["ir1"] }), getPlayer)
    ).toBeNull();
  });

  it("survives a player the page has no metadata for", () => {
    expect(irIssueFor(league({ slots: 5, bench: ["nobody"] }), () => undefined)).toBeNull();
  });
});

describe("findIrIssues", () => {
  it("returns only the leagues with something to do", () => {
    const issues = findIrIssues(
      [
        league({ id: "A", name: "Has one", slots: 5, reserve: ["x"], bench: ["ir1"] }),
        league({ id: "B", name: "Full", slots: 1, reserve: ["x"], bench: ["ir2"] }),
        league({ id: "C", name: "Nobody hurt", slots: 5, bench: ["qn"] }),
        league({ id: "D", name: "No IR slots", slots: 0, bench: ["ir1"] }),
      ],
      getPlayer
    );
    expect(issues.map((i) => i.leagueName)).toEqual(["Has one"]);
  });

  it("is empty rather than undefined with no leagues", () => {
    expect(findIrIssues(null, getPlayer)).toEqual([]);
  });
});

describe("preselectIds and selectionIsFull", () => {
  const candidates = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("ticks as many as will fit", () => {
    expect(preselectIds(candidates, 2)).toEqual(["a", "b"]);
  });

  it("ticks everyone when there is room for everyone", () => {
    expect(preselectIds(candidates, 5)).toEqual(["a", "b", "c"]);
  });

  it("ticks nobody with no room", () => {
    expect(preselectIds(candidates, 0)).toEqual([]);
    expect(preselectIds(candidates, -1)).toEqual([]);
  });

  it("closes the rest off once the slots are spoken for", () => {
    expect(selectionIsFull(["a", "b"], 2)).toBe(true);
    expect(selectionIsFull(["a"], 2)).toBe(false);
  });
});

describe("irReturnIssueFor", () => {
  it("flags somebody on reserve who has recovered", () => {
    const issue = irReturnIssueFor(
      league({ reserve: ["healthy", "ir1"], bench: [] }),
      getPlayer
    );
    expect(issue.candidates).toHaveLength(1);
    expect(issue.candidates[0]).toMatchObject({ id: "healthy", status: null });
  });

  it("flags one who is merely questionable, which a reserve slot does not accept", () => {
    const issue = irReturnIssueFor(league({ reserve: ["qn"] }), getPlayer);
    expect(issue.candidates[0].id).toBe("qn");
  });

  it("leaves alone anybody still entitled to the slot", () => {
    expect(irReturnIssueFor(league({ reserve: ["ir1", "pup"] }), getPlayer)).toBeNull();
  });

  it("respects a league that does allow Out on reserve", () => {
    expect(
      irReturnIssueFor(
        league({ reserve: ["out"], flags: { reserve_allow_out: 1 } }),
        getPlayer
      )
    ).toBeNull();
    // ...and flags the same player where the league does not.
    expect(irReturnIssueFor(league({ reserve: ["out"] }), getPlayer).candidates[0].id).toBe(
      "out"
    );
  });

  it("does not mistake a player it has no record of for a recovered one", () => {
    // This is the failure that matters. The other direction fails safe when
    // metadata is missing; this one would report every reserve slot as a
    // problem while the page was still loading.
    expect(irReturnIssueFor(league({ reserve: ["nobody"] }), () => undefined)).toBeNull();
  });

  it("reports it even with nowhere to put them", () => {
    // Unlike the move to reserve, this is worth saying when it cannot be
    // acted on: the roster is wrong either way.
    const full = Array.from({ length: 25 }, (_, i) => `p${i}`);
    const issue = irReturnIssueFor(
      league({ reserve: ["healthy"], starters: full }),
      getPlayer
    );
    expect(issue).not.toBeNull();
    expect(issue.freeBench).toBe(0);
    expect(issue.blocked).toBe(true);
  });

  it("is not blocked when the bench has room", () => {
    const issue = irReturnIssueFor(
      league({ reserve: ["healthy"], bench: ["fit"] }),
      getPlayer
    );
    expect(issue.freeBench).toBeGreaterThan(0);
    expect(issue.blocked).toBe(false);
  });

  it("does not count the reserve players themselves against the bench", () => {
    // They are on `players` but outside roster_positions, so they must not
    // make the roster look fuller than it is.
    const issue = irReturnIssueFor(
      league({
        rosterPositions: Array.from({ length: 10 }, (_, i) => `s${i}`),
        starters: ["a", "b", "c"],
        bench: ["d", "e"],
        reserve: ["healthy"],
        taxi: ["t1", "t2"],
      }),
      getPlayer
    );
    expect(issue.freeBench).toBe(5);
  });
});

describe("findIrReturnIssues", () => {
  it("returns only the leagues holding somebody who should not be there", () => {
    const issues = findIrReturnIssues(
      [
        league({ id: "A", name: "Recovered", reserve: ["healthy"] }),
        league({ id: "B", name: "All proper", reserve: ["ir1", "pup"] }),
        league({ id: "C", name: "Empty reserve", reserve: [] }),
      ],
      getPlayer
    );
    expect(issues.map((i) => i.leagueName)).toEqual(["Recovered"]);
  });

  it("is empty rather than undefined with no leagues", () => {
    expect(findIrReturnIssues(null, getPlayer)).toEqual([]);
  });
});

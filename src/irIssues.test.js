import {
  reserveEligibleStatuses,
  freeReserveSlots,
  irIssueFor,
  findIrIssues,
  preselectIds,
  selectionIsFull,
} from "./irIssues";

// Shaped like the league objects LeagueList builds.
function league({
  id = "L1",
  name = "A League",
  slots = 5,
  flags = {},
  reserve = [],
  bench = [],
  rosterId = 7,
} = {}) {
  return {
    league_id: id,
    name,
    settings: { reserve_slots: slots, ...flags },
    userRoster: { reserve, uniquePlayers: bench, starters: [], taxi: [], rosterId },
  };
}

const PLAYERS = {
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

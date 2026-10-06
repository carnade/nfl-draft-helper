import { lockedTeamsFor, byeTeamsFor } from "./nflSchedule";

// Shaped like Sleeper's /schedule/nfl/regular/{season}: the whole season in one
// array, every game carrying its week.
const schedule = [
  { week: 4, home: "KC", away: "CAR", status: "complete" },
  { week: 4, home: "SEA", away: "NYJ", status: "complete" },
  { week: 5, home: "CLE", away: "NYJ", status: "pre_game" },
  { week: 5, home: "IND", away: "PIT", status: "in_game" },
  { week: 5, home: "SEA", away: "DEN", status: "pre_game" },
];

describe("lockedTeamsFor", () => {
  it("locks both teams in a game that has started, and nobody else", () => {
    const locked = lockedTeamsFor(schedule, 5);
    expect([...locked].sort()).toEqual(["IND", "PIT"]);
  });

  it("ignores other weeks, however finished they are", () => {
    expect(lockedTeamsFor(schedule, 5).has("KC")).toBe(false);
  });

  it("survives a schedule that did not load", () => {
    expect(lockedTeamsFor([], 5).size).toBe(0);
    expect(lockedTeamsFor(null, 5).size).toBe(0);
  });
});

describe("byeTeamsFor", () => {
  it("finds the teams with no game that week", () => {
    // KC and CAR play in week 4 but not week 5 — which is exactly the real
    // week-5 bye pairing that started this.
    expect([...byeTeamsFor(schedule, 5)].sort()).toEqual(["CAR", "KC"]);
  });

  it("does not care what a game's status is", () => {
    expect(byeTeamsFor(schedule, 4).has("CLE")).toBe(true);
  });

  it("puts nobody on bye when the schedule failed to load", () => {
    // The important half: an empty fetch must not read as "every team is idle",
    // which would flag an entire lineup.
    expect(byeTeamsFor([], 5).size).toBe(0);
    expect(byeTeamsFor(null, 5).size).toBe(0);
  });

  it("puts nobody on bye for a week that is not in the schedule", () => {
    expect(byeTeamsFor(schedule, 99).size).toBe(0);
  });
});

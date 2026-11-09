import {
  lockedTeamsFor,
  byeTeamsFor,
  kickoffsByTeam,
  teamsPlayingIn,
} from "./nflSchedule";
import { parseGameStartToUtc } from "./dfsKickoff";

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

// ── Our own backend's one-week schedule ────────────────────────────────────

describe("kickoffsByTeam", () => {
  const rows = [
    { home_team: "BAL", away_team: "JAX", gameday: "2026-11-05", gametime: "20:15" },
    { home_team: "ATL", away_team: "CIN", gameday: "2026-11-08", gametime: "09:30" },
    { home_team: "CAR", away_team: "DEN", gameday: "2026-11-08", gametime: "13:00" },
  ];
  const parse = (day, time) => parseGameStartToUtc(day, time);

  it("maps both sides of every game to its kickoff", () => {
    const byTeam = kickoffsByTeam(rows, parse);

    expect(Object.keys(byTeam).sort())
      .toEqual(["ATL", "BAL", "CAR", "CIN", "DEN", "JAX"]);
    expect(byTeam.BAL.toISOString()).toBe("2026-11-06T01:15:00.000Z");
    expect(byTeam.CIN.toISOString()).toBe("2026-11-08T14:30:00.000Z");
  });

  it("gives both teams in a game the same instant", () => {
    const byTeam = kickoffsByTeam(rows, parse);

    expect(byTeam.CAR.getTime()).toBe(byTeam.DEN.getTime());
  });

  it("leaves a team out rather than mapping it to nothing", () => {
    // So a caller taking the earliest of several cannot mistake an absence for
    // a time.
    const byTeam = kickoffsByTeam(
      [{ home_team: "KC", away_team: "LV", gameday: null, gametime: null }],
      parse
    );

    expect(byTeam).toEqual({});
  });

  it("is empty for nothing at all", () => {
    expect(kickoffsByTeam([], parse)).toEqual({});
    expect(kickoffsByTeam(null, parse)).toEqual({});
  });
});

describe("teamsPlayingIn", () => {
  it("collects both sides of every game", () => {
    const playing = teamsPlayingIn([
      { home_team: "CAR", away_team: "DEN" },
      { home_team: "ATL", away_team: "CIN" },
    ]);

    expect([...playing].sort()).toEqual(["ATL", "CAR", "CIN", "DEN"]);
  });

  it("is empty when the schedule did not load, which is not a league-wide bye", () => {
    expect(teamsPlayingIn([]).size).toBe(0);
    expect(teamsPlayingIn(undefined).size).toBe(0);
  });
});

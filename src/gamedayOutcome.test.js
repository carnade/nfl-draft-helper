import {
  finalOutcome,
  gameState,
  gameStatesByTeam,
  recordLabel,
  remainingForStarter,
  starterState,
} from "./gamedayOutcome";

const done = (over = {}) => ({
  hasOpponent: true,
  myStarters: 9,
  myPlayed: 9,
  oppStarters: 9,
  oppPlayed: 9,
  myLive: 120.5,
  oppLive: 110.25,
  ...over,
});

describe("finalOutcome", () => {
  it("calls a finished matchup", () => {
    expect(finalOutcome(done())).toBe("win");
    expect(finalOutcome(done({ myLive: 100, oppLive: 120 }))).toBe("loss");
  });

  it("waits for the opponent, however far ahead you are", () => {
    // A Monday night game on their side is still a game.
    expect(finalOutcome(done({ oppPlayed: 8, myLive: 200, oppLive: 50 }))).toBeNull();
  });

  it("waits for your own side too", () => {
    expect(finalOutcome(done({ myPlayed: 8 }))).toBeNull();
  });

  it("says nothing on a bye", () => {
    expect(finalOutcome(done({ hasOpponent: false }))).toBeNull();
  });

  it("does not treat an empty lineup as finished", () => {
    // Nobody started is not everybody done.
    expect(finalOutcome(done({ myStarters: 0, myPlayed: 0 }))).toBeNull();
    expect(finalOutcome(done({ oppStarters: 0, oppPlayed: 0 }))).toBeNull();
  });

  it("calls a draw a draw", () => {
    expect(finalOutcome(done({ myLive: 118.46, oppLive: 118.46 }))).toBe("tie");
  });

  it("agrees with the two decimals on screen", () => {
    // Both totals are sums of floats. Compared raw, this is a win by a
    // ten-thousandth while the page shows 118.46 against 118.46.
    expect(finalOutcome(done({ myLive: 118.46001, oppLive: 118.46 }))).toBe("tie");
    // A real hundredth still counts.
    expect(finalOutcome(done({ myLive: 118.47, oppLive: 118.46 }))).toBe("win");
  });

  it("survives missing scores rather than throwing", () => {
    expect(finalOutcome(done({ myLive: undefined, oppLive: undefined }))).toBe("tie");
    expect(finalOutcome()).toBeNull();
  });
});

describe("remainingForStarter", () => {
  const teamsPlaying = new Set(["KC", "BUF", "DAL"]);

  it("is whatever the clock says for a team that is playing", () => {
    expect(
      remainingForStarter({ team: "BUF", teamsPlaying, gameClocks: { BUF: 0.4 } })
    ).toBe(0.4);
    expect(
      remainingForStarter({ team: "BUF", teamsPlaying, gameClocks: { BUF: 0 } })
    ).toBe(0);
  });

  it("counts a starter on a bye as finished, not pending", () => {
    // Left in the lineup through their bye. They can never score, so a matchup
    // containing one must still be able to resolve.
    expect(remainingForStarter({ team: "SEA", teamsPlaying, gameClocks: {} })).toBe(0);
  });

  it("counts a starter with no team as finished", () => {
    expect(remainingForStarter({ team: undefined, teamsPlaying })).toBe(0);
  });

  it("is pending for a playing team the clock says nothing about", () => {
    expect(remainingForStarter({ team: "DAL", teamsPlaying, gameClocks: {} })).toBe(1);
  });

  it("claims nothing when the schedule did not load", () => {
    // Declaring everyone finished would announce results that have not
    // happened.
    expect(remainingForStarter({ team: "SEA", teamsPlaying: new Set() })).toBe(1);
    expect(remainingForStarter({ team: "SEA" })).toBe(1);
    expect(remainingForStarter()).toBe(1);
  });
});

// ── Where a starter is in their game ────────────────────────────────────────

describe("gameState", () => {
  it("reads the three states a slate is watched for", () => {
    expect(gameState("pre_game", {})).toBe("pre");
    expect(gameState("in_game", { quarter_num: 2, time_remaining: "07:12" })).toBe("live");
    expect(gameState("complete", {})).toBe("done");
  });

  it("trusts is_over over whatever the status says", () => {
    expect(gameState("in_game", { is_over: true })).toBe("done");
  });

  it("tells a game at its first snap from one not kicked off", () => {
    // The clock cannot: both read as a full hour remaining, which is why this
    // goes by status instead.
    const firstSnap = { quarter_num: 1, time_remaining: "15:00" };
    expect(gameState("in_game", firstSnap)).toBe("live");
    expect(gameState("pre_game", firstSnap)).toBe("pre");
  });

  it("keeps a called-off game out of all three", () => {
    for (const status of ["canceled", "postponed", "suspended"]) {
      expect(gameState(status, {})).toBe("off");
    }
  });

  it("errs towards live for a status it has not met", () => {
    // Going quiet during a game is worse than a pulse on a finished one.
    expect(gameState("second_half", {})).toBe("live");
  });

  it("does not call an absent status live", () => {
    expect(gameState(undefined, {})).toBe("pre");
    expect(gameState(null, null)).toBe("pre");
  });
});

describe("gameStatesByTeam", () => {
  const games = [
    { status: "complete", metadata: { home_team: "DET", away_team: "CHI" } },
    { status: "in_game", metadata: { home_team: "DAL", away_team: "PHI" } },
    { status: "pre_game", metadata: { home_team: "BAL", away_team: "CIN" } },
  ];

  it("gives both sides of a game the same state", () => {
    const states = gameStatesByTeam(games);
    expect(states.DET).toBe("done");
    expect(states.CHI).toBe("done");
    expect(states.DAL).toBe("live");
    expect(states.PHI).toBe("live");
    expect(states.BAL).toBe("pre");
  });

  it("is empty rather than wrong when nothing loaded", () => {
    expect(gameStatesByTeam([])).toEqual({});
    expect(gameStatesByTeam()).toEqual({});
  });

  it("skips a game with no teams on it", () => {
    expect(gameStatesByTeam([{ status: "in_game", metadata: {} }])).toEqual({});
  });
});

describe("starterState", () => {
  const playing = new Set(["DET", "CHI", "DAL"]);
  const states = { DET: "done", DAL: "live" };

  it("reports the state of the game the starter is in", () => {
    expect(starterState({ team: "DET", teamsPlaying: playing, gameStates: states })).toBe("done");
    expect(starterState({ team: "DAL", teamsPlaying: playing, gameStates: states })).toBe("live");
  });

  it("calls a team with a game but no status yet pending", () => {
    expect(starterState({ team: "CHI", teamsPlaying: playing, gameStates: states })).toBe("pre");
  });

  it("names a starter left in through their bye", () => {
    // Neither played nor waiting. remainingForStarter calls this finished,
    // because for scoring it is; for reading a lineup it deserves its own word.
    expect(starterState({ team: "NYJ", teamsPlaying: playing, gameStates: states })).toBe("bye");
  });

  it("is null rather than a guess when the schedule did not load", () => {
    // Colouring every row the same wrong colour is worse than colouring none.
    expect(starterState({ team: "DET", teamsPlaying: new Set(), gameStates: {} })).toBeNull();
    expect(starterState({ team: "DET" })).toBeNull();
  });

  it("is null for an empty slot", () => {
    expect(starterState({ team: null, teamsPlaying: playing, gameStates: states })).toBeNull();
  });
});

describe("recordLabel", () => {
  it("reads as a record does", () => {
    expect(recordLabel({ wins: 6, losses: 5, ties: 0 })).toBe("6-5");
  });

  it("shows ties only when there are some", () => {
    expect(recordLabel({ wins: 6, losses: 4, ties: 1 })).toBe("6-4-1");
    expect(recordLabel({ wins: 6, losses: 5 })).toBe("6-5");
  });

  it("keeps a nought, which is a record rather than an absence", () => {
    expect(recordLabel({ wins: 0, losses: 11, ties: 0 })).toBe("0-11");
  });

  it("is null when the record is not known", () => {
    expect(recordLabel(null)).toBeNull();
    expect(recordLabel({})).toBeNull();
    expect(recordLabel({ wins: 6 })).toBeNull();
  });
});

import { finalOutcome, remainingForStarter } from "./gamedayOutcome";

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

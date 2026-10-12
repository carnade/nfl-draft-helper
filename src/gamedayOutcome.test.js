import { finalOutcome } from "./gamedayOutcome";

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

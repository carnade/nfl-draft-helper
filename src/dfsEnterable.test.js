import { canStillBeEntered } from "./DFS";

// /available is read by two pages and they want different things from it: the
// DFS page offers "add team to league" buttons and must leave a finished
// tournament out, while the results page offers "load from your leagues" and
// must keep it, since reaching the final standings is what the grace week is
// for. This predicate is the DFS page's half of that.

describe("canStillBeEntered", () => {
  it("lets a running tournament through", () => {
    expect(canStillBeEntered({ name: "Giljotin_2", finished: false })).toBe(true);
  });

  it("keeps a finished tournament out", () => {
    // Giljotin_1 after its seventh week: still listed so its standings can be
    // read, but not something to file a lineup against.
    expect(canStillBeEntered({ name: "Giljotin_1", finished: true })).toBe(false);
  });

  it("lets a single-week entry through, which carries no such flag", () => {
    expect(canStillBeEntered({ name: "BYTESTEST", week: 9 })).toBe(true);
  });

  it("lets a bare name string through", () => {
    // An older backend sends these with no flags at all. The flag's absence is
    // not a claim that the tournament is over.
    expect(canStillBeEntered("BYTESTEST")).toBe(true);
  });

  it("does not throw on a missing entry", () => {
    expect(canStillBeEntered(null)).toBe(true);
    expect(canStillBeEntered(undefined)).toBe(true);
  });
});

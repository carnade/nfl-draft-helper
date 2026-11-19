import { describeRun, runWhen } from "./DFSManage";

// The scrape history's two pure pieces. The component around them needs an
// organiser login and half a dozen fetches, which is why these were pulled out
// — the reading of a run is the part with judgement in it.

describe("describeRun", () => {
  it("leads with players, and says how many rows that took", () => {
    // A run walks several slates and most players are on more than one, so
    // the rows outnumber the players about two to one. Leading with rows made
    // a 925-player slate read as 1914 of something.
    expect(
      describeRun({
        outcome: "ok",
        players: 925,
        scraped: 1914,
        added: 0,
        updated: 925,
        kickoffs_filled: 222,
        held: 925,
      })
    ).toBe(
      "925 players (1914 rows across the slates) · 0 new · 925 updated · " +
        "222 kickoffs filled · 925 held"
    );
  });

  it("does not belabour the rows when they are the players", () => {
    expect(describeRun({ outcome: "ok", players: 360, scraped: 360, held: 360 }))
      .toBe("360 players · 360 held");
  });

  it("still reads an older run that only counted rows", () => {
    // The history outlives the shape it was written in.
    expect(describeRun({ outcome: "ok", scraped: 200, added: 2, held: 581 }))
      .toBe("200 scraped · 2 new · 581 held");
  });

  it("counts what a good run actually did", () => {
    // A run that added two players and one that added six hundred are the same
    // sentence on /statistics, and that is the difference between a quiet
    // midweek run and a slate arriving.
    expect(
      describeRun({
        outcome: "ok",
        scraped: 1889,
        added: 587,
        updated: 1302,
        held: 710,
      })
    ).toBe("1889 scraped · 587 new · 1302 updated · 710 held");
  });

  it("mentions filled kickoffs only when there were some", () => {
    const run = { outcome: "ok", scraped: 10, held: 10 };
    expect(describeRun({ ...run, kickoffs_filled: 10 })).toContain("10 kickoffs filled");
    expect(describeRun({ ...run, kickoffs_filled: 0 })).not.toContain("kickoffs");
    expect(describeRun(run)).not.toContain("kickoffs");
  });

  it("gives the reason instead for a run that did not succeed", () => {
    expect(describeRun({ outcome: "gated", error: "set DFF_COOKIE" })).toBe(
      "set DFF_COOKIE"
    );
    expect(describeRun({ outcome: "failed", error: "connection reset" })).toBe(
      "connection reset"
    );
  });

  it("says something rather than nothing when a failure carries no reason", () => {
    expect(describeRun({ outcome: "failed" })).toBe("no reason recorded");
  });

  it("keeps a zero, which is a figure rather than an absence", () => {
    // 0 new is a real answer — the slate was already complete.
    expect(describeRun({ outcome: "ok", scraped: 300, added: 0, held: 300 }))
      .toBe("300 scraped · 0 new · 300 held");
  });

  it("counts a fallback run like any other good one", () => {
    // It worked; what it lacks is columns, and the outcome label carries that.
    expect(describeRun({ outcome: "fallback", scraped: 360, added: 12, held: 372 }))
      .toBe("360 scraped · 12 new · 372 held");
  });

  it("is empty for nothing at all", () => {
    expect(describeRun(null)).toBe("");
    expect(describeRun(undefined)).toBe("");
  });
});

describe("runWhen", () => {
  it("carries the date as well as the time", () => {
    // How long ago the last good run was is the question, so a bare clock
    // time would be the wrong half of the answer.
    const text = runWhen("2026-11-19T08:23:06");
    expect(text).toMatch(/19/);
    expect(text).toMatch(/08:23/);
  });

  it("hands back anything it cannot read, rather than NaN", () => {
    expect(runWhen("not a date")).toBe("not a date");
  });

  it("is empty for nothing at all", () => {
    expect(runWhen(null)).toBe("");
    expect(runWhen("")).toBe("");
  });
});

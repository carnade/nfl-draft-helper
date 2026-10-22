import {
  readSeasonWeek,
  writeSeasonWeek,
  readSeasonWeeks,
  clearSeasonCache,
} from "./seasonCache";

const SUMMARY = { points: 123.45, max: 145.67, pct: 84.7, result: "W" };

beforeEach(() => {
  localStorage.clear();
});

describe("keeping a finished week", () => {
  it("survives in localStorage, not just the session", () => {
    // The whole point: sessionStorage died with the tab, so coming back two
    // days later meant loading every league again.
    expect(writeSeasonWeek("L1", 5, SUMMARY, { isFinal: true })).toBe(true);
    expect(readSeasonWeek("L1", 5)).toEqual(SUMMARY);
    expect(Object.keys(localStorage).some((k) => k.startsWith("gameday_season"))).toBe(true);
  });

  it("refuses a week that is not finished", () => {
    // A live week's figures would be frozen half-played.
    expect(writeSeasonWeek("L1", 7, SUMMARY, { isFinal: false })).toBe(false);
    expect(writeSeasonWeek("L1", 7, SUMMARY)).toBe(false);
    expect(readSeasonWeek("L1", 7)).toBeUndefined();
  });

  it("keeps leagues and weeks apart", () => {
    writeSeasonWeek("L1", 5, SUMMARY, { isFinal: true });
    expect(readSeasonWeek("L2", 5)).toBeUndefined();
    expect(readSeasonWeek("L1", 6)).toBeUndefined();
  });
});

describe("the three states the table needs", () => {
  it("tells a bye apart from a week never stored", () => {
    // summariseWeek returns null when that roster did not play. Stored as null
    // it has to read back as null, not as a miss, or the table offers to load
    // a week there is nothing to load for.
    writeSeasonWeek("L1", 5, null, { isFinal: true });
    expect(readSeasonWeek("L1", 5)).toBeNull();
    expect(readSeasonWeek("L1", 9)).toBeUndefined();
  });

  it("treats a corrupt entry as a miss rather than throwing", () => {
    localStorage.setItem("gameday_season_v1_L1_5", "{not json");
    expect(readSeasonWeek("L1", 5)).toBeUndefined();
  });

  it("ignores an entry that is not the shape it wrote", () => {
    localStorage.setItem("gameday_season_v1_L1_5", JSON.stringify({ other: 1 }));
    expect(readSeasonWeek("L1", 5)).toBeUndefined();
  });

  it("will not store something that is not a summary", () => {
    expect(writeSeasonWeek("L1", 5, 42, { isFinal: true })).toBe(false);
    expect(writeSeasonWeek("L1", 5, "nope", { isFinal: true })).toBe(false);
  });
});

describe("reading a whole season at once", () => {
  it("returns only what is actually stored", () => {
    writeSeasonWeek("L1", 1, SUMMARY, { isFinal: true });
    writeSeasonWeek("L1", 3, null, { isFinal: true });
    writeSeasonWeek("L2", 1, SUMMARY, { isFinal: true });

    const out = readSeasonWeeks(["L1", "L2", "L3"], [1, 2, 3]);
    expect(Object.keys(out).sort()).toEqual(["L1", "L2"]);
    expect(Object.keys(out.L1).sort()).toEqual(["1", "3"]);
    expect(out.L1[3]).toBeNull();
    expect(out.L2[1]).toEqual(SUMMARY);
  });

  it("is empty when nothing is stored", () => {
    expect(readSeasonWeeks(["L1"], [1, 2])).toEqual({});
    expect(readSeasonWeeks()).toEqual({});
  });
});

describe("storage that will not cooperate", () => {
  it("costs nothing but the saving when a write is refused", () => {
    const setItem = jest.spyOn(window.localStorage.__proto__, "setItem")
      .mockImplementation(() => { throw new Error("QuotaExceededError"); });
    expect(writeSeasonWeek("L1", 5, SUMMARY, { isFinal: true })).toBe(false);
    setItem.mockRestore();
  });

  it("reads as a miss when storage throws", () => {
    const getItem = jest.spyOn(window.localStorage.__proto__, "getItem")
      .mockImplementation(() => { throw new Error("SecurityError"); });
    expect(readSeasonWeek("L1", 5)).toBeUndefined();
    getItem.mockRestore();
  });
});

describe("clearing", () => {
  it("removes only this cache's keys", () => {
    writeSeasonWeek("L1", 5, SUMMARY, { isFinal: true });
    localStorage.setItem("sleeper_auth", "{}");
    expect(clearSeasonCache()).toBe(1);
    expect(readSeasonWeek("L1", 5)).toBeUndefined();
    expect(localStorage.getItem("sleeper_auth")).toBe("{}");
  });
});

describe("what it costs to keep", () => {
  it("a whole season of forty leagues stays tiny", () => {
    // The raw week scores are ~5 KB per league-week, near 4 MB for a season,
    // which is why those stay in sessionStorage and only the summary is kept.
    const one = JSON.stringify({ s: SUMMARY }).length;
    const season = one * 41 * 18;
    expect(one).toBeLessThan(80);
    expect(season).toBeLessThan(80 * 1024);
  });
});

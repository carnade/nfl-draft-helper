import { fetchMatchups, startersFor, startersFromMatchups } from "./sleeperLineup";

// Modelled on the real disagreement that prompted this: league 1316015518380994560,
// week 8, roster 11. Three slots differed with nothing locked yet, and the Sleeper
// app agreed with the matchup rather than the roster.
const ROSTER = {
  roster_id: 11,
  starters: ["rodgers", "walker", "jeanty", "lamb", "nabers", "pickens",
             "loveland", "jones", "miller", "kittle", "prescott"],
  players: ["rodgers", "walker", "jeanty", "lamb", "nabers", "pickens",
            "loveland", "jones", "miller", "kittle", "prescott",
            "rice", "dulcich", "bourne"],
  reserve: [],
  taxi: [],
};

const MATCHUPS = [
  { roster_id: 10, starters: ["someone"] },
  {
    roster_id: 11,
    starters: ["rodgers", "walker", "jeanty", "lamb", "rice", "pickens",
               "loveland", "jones", "dulcich", "bourne", "prescott"],
  },
  { roster_id: 12, starters: ["another"] },
];

describe("startersFromMatchups", () => {
  it("finds the row for this roster", () => {
    expect(startersFromMatchups(MATCHUPS, 11)).toEqual(MATCHUPS[1].starters);
  });

  it("matches a roster id across types", () => {
    // /rosters gives a number, some callers carry it as a string.
    expect(startersFromMatchups(MATCHUPS, "11")).toEqual(MATCHUPS[1].starters);
  });

  it("is null when this roster has no row", () => {
    // Not an empty list: "no matchup this week" and "started nobody" are
    // different, and only the first is worth falling back for.
    expect(startersFromMatchups(MATCHUPS, 99)).toBeNull();
  });

  it("is null for a failed or empty fetch", () => {
    expect(startersFromMatchups([], 11)).toBeNull();
    expect(startersFromMatchups(null, 11)).toBeNull();
    expect(startersFromMatchups(undefined, 11)).toBeNull();
  });

  it("is null when there is no roster to look up", () => {
    expect(startersFromMatchups(MATCHUPS, null)).toBeNull();
  });

  it("is null when the row carries no starters", () => {
    expect(startersFromMatchups([{ roster_id: 11 }], 11)).toBeNull();
  });
});

describe("startersFor", () => {
  it("prefers the matchup over the roster's own copy", () => {
    // The whole point. These two disagreed on three slots in the live data,
    // and the matchup is the one Sleeper scores and the app displays.
    const starters = startersFor(MATCHUPS, ROSTER);

    expect(starters).toEqual(MATCHUPS[1].starters);
    expect(starters).not.toEqual(ROSTER.starters);
    expect(starters).toContain("rice");
    expect(starters).not.toContain("nabers");
  });

  it("falls back to the roster when the matchups could not be had", () => {
    // Stale beats empty: the bench is derived from this, so an empty lineup
    // would empty the page rather than merely being out of date.
    expect(startersFor([], ROSTER)).toEqual(ROSTER.starters);
    expect(startersFor(null, ROSTER)).toEqual(ROSTER.starters);
  });

  it("falls back when this roster is absent from the week", () => {
    expect(startersFor([{ roster_id: 1, starters: ["x"] }], ROSTER)).toEqual(ROSTER.starters);
  });

  it("is an empty list rather than undefined when there is nothing at all", () => {
    expect(startersFor(null, null)).toEqual([]);
    expect(startersFor(null, { roster_id: 3 })).toEqual([]);
  });

  it("keeps slot order, since the bench is whatever is left over", () => {
    const starters = startersFor(MATCHUPS, ROSTER);

    expect(starters[0]).toBe("rodgers");
    expect(starters[starters.length - 1]).toBe("prescott");
    expect(starters).toHaveLength(ROSTER.starters.length);
  });
});

describe("fetchMatchups", () => {
  afterEach(() => {
    delete global.fetch;
  });

  it("returns the rows", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(MATCHUPS) })
    );

    await expect(fetchMatchups("123", 8)).resolves.toEqual(MATCHUPS);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.sleeper.app/v1/league/123/matchups/8",
      { signal: undefined }
    );
  });

  it("is an empty list on a bad status, so one league cannot break the page", async () => {
    global.fetch = jest.fn(() => Promise.resolve({ ok: false, status: 404 }));

    await expect(fetchMatchups("123", 8)).resolves.toEqual([]);
  });

  it("is an empty list when the request throws", async () => {
    global.fetch = jest.fn(() => Promise.reject(new Error("offline")));

    await expect(fetchMatchups("123", 8)).resolves.toEqual([]);
  });

  it("is an empty list when the body is not a list", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ error: "nope" }) })
    );

    await expect(fetchMatchups("123", 8)).resolves.toEqual([]);
  });
});

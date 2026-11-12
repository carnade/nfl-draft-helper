import {
  decodeTrade,
  encodeTrade,
  staleTradePlayers,
  tradeLinkFor,
} from "./tradeLink";

const TRADE = {
  leagueId: "1395106065225355264",
  rosterId: 3,
  give: ["6790", "9480"],
  get: ["9493"],
};

describe("encodeTrade", () => {
  it("names the roster, not the person", () => {
    // The recipient is a different Sleeper user. A link built around "me"
    // would show them a trade their own roster has nothing to do with.
    const query = encodeTrade(TRADE);
    expect(query).toContain("from=3");
    expect(query).toContain("league=1395106065225355264");
    expect(query).not.toMatch(/user|name/i);
  });

  it("opens on the tab the trade belongs to", () => {
    expect(encodeTrade(TRADE)).toContain("tab=contender");
  });

  it("carries both sides", () => {
    const query = encodeTrade(TRADE);
    expect(query).toContain("give=6790%2C9480");
    expect(query).toContain("get=9493");
  });

  it("keeps a one-way trade", () => {
    expect(encodeTrade({ ...TRADE, give: [] })).toContain("get=9493");
    expect(encodeTrade({ ...TRADE, give: [] })).not.toContain("give=");
  });

  it("is null when there is nothing to describe", () => {
    expect(encodeTrade({ ...TRADE, give: [], get: [] })).toBeNull();
    expect(encodeTrade({ ...TRADE, leagueId: "" })).toBeNull();
    expect(encodeTrade({ ...TRADE, rosterId: null })).toBeNull();
    expect(encodeTrade()).toBeNull();
  });

  it("drops anything that is not an id", () => {
    const query = encodeTrade({ ...TRADE, give: ["6790", "../../etc", "", null] });
    expect(query).toContain("give=6790");
    expect(query).not.toContain("etc");
  });
});

describe("tradeLinkFor", () => {
  it("is a whole link", () => {
    expect(tradeLinkFor("https://nfl-draft-helper.netlify.app", "/trade-analyzer", TRADE))
      .toMatch(/^https:\/\/nfl-draft-helper\.netlify\.app\/trade-analyzer\?tab=contender&/);
  });

  it("is null when there is no trade", () => {
    expect(tradeLinkFor("https://x", "/y", { ...TRADE, give: [], get: [] })).toBeNull();
  });
});

describe("decodeTrade", () => {
  it("reads back what was written", () => {
    expect(decodeTrade(`?${encodeTrade(TRADE)}`)).toEqual({
      leagueId: "1395106065225355264",
      rosterId: "3",
      give: ["6790", "9480"],
      get: ["9493"],
    });
  });

  it("takes the query string with or without its question mark", () => {
    const query = encodeTrade(TRADE);
    expect(decodeTrade(query)).toEqual(decodeTrade(`?${query}`));
  });

  it("is null for a page opened without one", () => {
    expect(decodeTrade("")).toBeNull();
    expect(decodeTrade(null)).toBeNull();
    expect(decodeTrade("?tab=contender")).toBeNull();
  });

  it("is null when a side is named but the league is not", () => {
    expect(decodeTrade("?give=6790&get=9493")).toBeNull();
    expect(decodeTrade("?league=123&give=6790")).toBeNull();
  });

  it("refuses an id that is not one", () => {
    // A link is the one input here that arrives from outside, and these ids go
    // straight into Sleeper URLs and roster lookups.
    expect(decodeTrade("?league=123&from=3&give=../../secret")).toBeNull();
    expect(decodeTrade("?league=<script>&from=3&give=6790")).toBeNull();
    expect(decodeTrade("?league=123&from=3&give=6790,bad/id")).toEqual({
      leagueId: "123",
      rosterId: "3",
      give: ["6790"],
      get: [],
    });
  });

  it("keeps a defence, which is rostered under its team code", () => {
    expect(decodeTrade("?league=123&from=3&give=BUF").give).toEqual(["BUF"]);
  });

  it("keeps the URL-safe punctuation an id might carry", () => {
    expect(decodeTrade("?league=123&from=3&give=a_b,c-d").give).toEqual(["a_b", "c-d"]);
  });

  it("still refuses anything that could mean something to a path", () => {
    expect(decodeTrade("?league=123&from=3&give=a%2Fb")).toBeNull();
    expect(decodeTrade("?league=123&from=3&give=a.b")).toBeNull();
    expect(decodeTrade("?league=123&from=3&give=%3Cb%3E")).toBeNull();
  });
});

describe("staleTradePlayers", () => {
  // Roster 3 holds Swift and Strange, roster 7 holds Nacua.
  const holders = { 6790: 3, 9480: 3, 9493: 7 };
  const holder = (id) => (holders[id] == null ? null : holders[id]);

  it("is empty while the link still describes the rosters", () => {
    expect(
      staleTradePlayers({ ...TRADE, partnerId: 7, holder })
    ).toEqual([]);
  });

  it("names a player who has since moved on", () => {
    // Priced as though nothing had moved, the roster would be charged for a
    // player it no longer holds.
    const moved = staleTradePlayers({
      ...TRADE,
      partnerId: 7,
      holder: (id) => (id === "9480" ? 11 : holder(id)),
    });
    expect(moved).toEqual([{ id: "9480", side: "give", now: "11" }]);
  });

  it("names one who has been dropped entirely", () => {
    const moved = staleTradePlayers({
      ...TRADE,
      partnerId: 7,
      holder: (id) => (id === "9493" ? null : holder(id)),
    });
    expect(moved).toEqual([{ id: "9493", side: "get", now: null }]);
  });

  it("counts everything on the other side as moved when there is no other side", () => {
    const moved = staleTradePlayers({ ...TRADE, partnerId: null, holder });
    expect(moved.map((row) => row.id)).toEqual(["9493"]);
  });

  it("matches a roster id across types", () => {
    expect(
      staleTradePlayers({ ...TRADE, rosterId: "3", partnerId: "7", holder })
    ).toEqual([]);
  });
});

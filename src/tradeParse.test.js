import {
  parseDraftPickCsv,
  parseFaab,
  tradeDirection,
  tradeExpiry,
  parseTrade,
  mySides,
  compareTrades,
} from "./tradeParse";

// Trimmed from a real response. Roster 2 (rewbster) offers Braelon Allen and
// their own 2028 4th for roster 7's (carnade's) 2027 and 2028 3rds.
const PROPOSED = {
  adds: { 11576: 7 },
  consenter_ids: [2],
  created: 1790699687169,
  creator: "951202085121511424",
  draft_picks: ["2,2028,4,7,2", "7,2027,3,2,7", "7,2028,3,2,7"],
  drops: { 11576: 2 },
  league_id: "1314355549055229952",
  player_map: { 11576: { position: "RB", first_name: "Braelon", last_name: "Allen" } },
  roster_ids: [2, 7],
  settings: null,
  status: "proposed",
  transaction_id: "1410700370476351488",
  type: "trade",
  waiver_budget: null,
};

// A picks-only trade: adds and drops are both null.
const PICKS_ONLY = {
  adds: null,
  consenter_ids: [2],
  created: 1781098376904,
  creator: "951202085121511424",
  draft_picks: ["1,2026,12,7,2", "7,2027,2,2,7"],
  drops: null,
  league_id: "1314355549055229952",
  player_map: {},
  roster_ids: [2, 7],
  settings: null,
  status: "proposed",
  transaction_id: "1370429556426563584",
  type: "trade",
  waiver_budget: null,
};

describe("parseDraftPickCsv", () => {
  it("reads the five fields in Sleeper's order", () => {
    expect(parseDraftPickCsv("7,2027,1,4,7")).toEqual({
      originalOwner: 7,
      season: 2027,
      round: 1,
      newOwner: 4,
      previousOwner: 7,
      raw: "7,2027,1,4,7",
    });
  });

  it("treats the first field as the pick's identity, not a participant", () => {
    // This string appeared in a trade whose roster_ids were [2, 7]. Roster 1
    // was not a party to it, so field one has to be whose pick it is — which
    // is the evidence the whole decode rests on.
    const pick = parseDraftPickCsv("1,2026,12,7,2");
    expect(pick.originalOwner).toBe(1);
    expect(pick.newOwner).toBe(7);
    expect(pick.previousOwner).toBe(2);
  });

  it("returns nothing rather than throwing on anything malformed", () => {
    expect(parseDraftPickCsv("")).toBeNull();
    expect(parseDraftPickCsv("1,2026")).toBeNull();
    expect(parseDraftPickCsv("a,b,c,d,e")).toBeNull();
    expect(parseDraftPickCsv("1,0,0,2,1")).toBeNull();
    expect(parseDraftPickCsv(null)).toBeNull();
    expect(parseDraftPickCsv(undefined)).toBeNull();
  });
});

describe("parseFaab", () => {
  it("reads nothing out of the null every sample carries", () => {
    expect(parseFaab(null)).toEqual({ faab: [], unreadable: false });
  });

  it("reads the documented shape", () => {
    expect(parseFaab([{ sender: 2, receiver: 7, amount: 15 }])).toEqual({
      faab: [{ sender: 2, receiver: 7, amount: 15 }],
      unreadable: false,
    });
  });

  it("flags a shape it does not recognise instead of dropping it", () => {
    expect(parseFaab([{ foo: 1 }]).unreadable).toBe(true);
    expect(parseFaab({}).unreadable).toBe(true);
  });
});

describe("tradeDirection", () => {
  it("is outgoing for the roster that proposed it", () => {
    expect(tradeDirection({ consenterIds: [2], myRosterId: 2 })).toBe("outgoing");
  });

  it("is incoming for the roster that has not consented", () => {
    expect(tradeDirection({ consenterIds: [2], myRosterId: 7 })).toBe("incoming");
  });

  it("is outgoing once I have consented too", () => {
    // consenter_ids includes the proposer, so a list of both does not mean
    // "nobody has acted" — it means I am one of the ones waiting.
    expect(tradeDirection({ consenterIds: [2, 7], myRosterId: 7 })).toBe("outgoing");
  });

  it("refuses to guess when my roster is unknown", () => {
    expect(tradeDirection({ consenterIds: [2], myRosterId: null })).toBeNull();
  });
});

describe("tradeExpiry", () => {
  it("converts Sleeper's seconds to milliseconds", () => {
    expect(tradeExpiry({ settings: { expires_at: 1791551096 } })).toBe(1791551096000);
  });

  it("is null when the trade does not expire", () => {
    expect(tradeExpiry({ settings: null })).toBeNull();
    expect(tradeExpiry({})).toBeNull();
  });
});

describe("parseTrade", () => {
  it("assigns a player from adds, never from drops", () => {
    const trade = parseTrade(PROPOSED, { myRosterId: 7 });
    const seven = trade.sides.find((s) => s.rosterId === 7);
    const two = trade.sides.find((s) => s.rosterId === 2);
    expect(seven.players).toEqual(["11576"]);
    expect(two.players).toEqual([]);
  });

  it("puts each pick with whoever is receiving it", () => {
    const trade = parseTrade(PROPOSED, { myRosterId: 7 });
    const seven = trade.sides.find((s) => s.rosterId === 7);
    const two = trade.sides.find((s) => s.rosterId === 2);
    // Roster 7 receives rewbster's own 2028 4th.
    expect(seven.picks).toEqual([
      expect.objectContaining({ originalOwner: 2, season: 2028, round: 4 }),
    ]);
    // Roster 2 receives carnade's 2027 and 2028 3rds.
    expect(two.picks.map((p) => `${p.season}.${p.round}`)).toEqual(["2027.3", "2028.3"]);
    expect(two.picks.every((p) => p.originalOwner === 7)).toBe(true);
  });

  it("reads a picks-only trade where adds and drops are null", () => {
    const trade = parseTrade(PICKS_ONLY, { myRosterId: 7 });
    expect(trade.sides.every((s) => s.players.length === 0)).toBe(true);
    const seven = trade.sides.find((s) => s.rosterId === 7);
    expect(seven.picks).toEqual([
      expect.objectContaining({ originalOwner: 1, season: 2026, round: 12 }),
    ]);
  });

  it("badges the sample as incoming for carnade and outgoing for rewbster", () => {
    expect(parseTrade(PROPOSED, { myRosterId: 7 }).direction).toBe("incoming");
    expect(parseTrade(PROPOSED, { myRosterId: 2 }).direction).toBe("outgoing");
  });

  it("keeps every side of a three-way", () => {
    const trade = parseTrade(
      { ...PROPOSED, roster_ids: [1, 4, 9], adds: { 100: 1, 200: 4, 300: 9 }, draft_picks: [] },
      { myRosterId: 4 }
    );
    expect(trade.multiTeam).toBe(true);
    expect(trade.sides.map((s) => s.rosterId)).toEqual([1, 4, 9]);
    expect(trade.sides.map((s) => s.players)).toEqual([["100"], ["200"], ["300"]]);
  });

  it("carries the expiry and the counter flag", () => {
    const counter = parseTrade(
      { ...PROPOSED, settings: { expires_at: 1791551096, is_counter: 1 } },
      { myRosterId: 7 }
    );
    expect(counter.expiresAt).toBe(1791551096000);
    expect(counter.isCounter).toBe(true);
    expect(parseTrade(PROPOSED, { myRosterId: 7 }).isCounter).toBe(false);
  });

  it("collects anything it could not read rather than discarding it", () => {
    const trade = parseTrade(
      { ...PROPOSED, draft_picks: ["7,2027,1,4,7", "nonsense"], waiver_budget: [{ foo: 1 }] },
      { myRosterId: 7 }
    );
    expect(trade.unreadable.draftPicks).toEqual(["nonsense"]);
    expect(trade.unreadable.faab).toBe(true);
  });

  it("moves FAAB to whoever receives it", () => {
    const trade = parseTrade(
      { ...PROPOSED, waiver_budget: [{ sender: 2, receiver: 7, amount: 15 }] },
      { myRosterId: 7 }
    );
    expect(trade.sides.find((s) => s.rosterId === 7).faab).toEqual([
      { sender: 2, receiver: 7, amount: 15 },
    ]);
  });

  it("does not fall over on an empty transaction", () => {
    const trade = parseTrade({}, { myRosterId: 7 });
    expect(trade.sides).toEqual([]);
    expect(trade.direction).toBe("incoming");
  });
});

describe("mySides", () => {
  it("splits the trade into what I get and what they get", () => {
    const trade = parseTrade(PROPOSED, { myRosterId: 7 });
    const { receive, give } = mySides(trade, 7);
    expect(receive.players).toEqual(["11576"]);
    expect(give).toHaveLength(1);
    expect(give[0].rosterId).toBe(2);
  });

  it("is null when I am not in the trade", () => {
    expect(mySides(parseTrade(PROPOSED, { myRosterId: 7 }), 5)).toBeNull();
  });
});

describe("compareTrades", () => {
  it("puts the offer about to lapse first, and one with no expiry last", () => {
    const trades = [
      { expiresAt: null, created: 3 },
      { expiresAt: 2000, created: 1 },
      { expiresAt: 1000, created: 2 },
    ];
    expect([...trades].sort(compareTrades).map((t) => t.expiresAt)).toEqual([
      1000, 2000, null,
    ]);
  });
});

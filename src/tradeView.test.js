import { buildTradeView, buildLeagueView, comparisons } from "./tradeView";
import { draftOrder } from "./draftOrder";

const roster = (id, wins, fpts, ppts, ownerId) => ({
  roster_id: id,
  owner_id: ownerId || `u${id}`,
  settings: { wins, fpts, ppts },
});

// Four teams keeps the arithmetic checkable by hand. Roster 1 has the lowest
// ceiling and misses the single playoff spot, so it drafts 1.01.
const ROSTERS = [roster(1, 0, 400, 500), roster(2, 1, 600, 700), roster(3, 2, 800, 900), roster(4, 3, 900, 1000)];
const ORDER = draftOrder(ROSTERS, { playoffTeams: 1 });

const VALUES = {
  11576: { first_name: "Braelon", last_name: "Allen", position: "RB", team: "NYJ", age: 22, "KTC Value": 4000, "FC Value": 3000 },
  9997: { first_name: "Zay", last_name: "Flowers", position: "WR", team: "BAL", age: 25, "KTC Value": 5000, "FC Value": 3500 },
  "2027_early_1": { SFValue: 6919, Value: 7108, "FantasyCalc SF Value": 5049 },
};

const TXN = {
  transaction_id: "t1",
  status: "proposed",
  league_id: "L1",
  roster_ids: [1, 2],
  consenter_ids: [1],
  creator: "u1",
  created: 1790699687169,
  adds: { 11576: 2, 9997: 1 },
  drops: { 11576: 1, 9997: 2 },
  draft_picks: ["1,2027,1,2,1"],
  player_map: {},
  settings: { expires_at: 1791551096 },
  waiver_budget: null,
};

const context = (myRosterId) => ({
  myRosterId,
  order: ORDER,
  values: VALUES,
  projections: { 11576: { pts_ppr: 160, gp: 16 }, 9997: { pts_ppr: 180, gp: 15 } },
  stats: { 11576: { pts_ppr: 60, gp: 6 }, 9997: { pts_ppr: 84, gp: 7 } },
  currentSeason: 2026,
  nameFor: (id) => `Team ${id}`,
});

describe("buildTradeView", () => {
  it("puts the right assets on each side from roster 2's point of view", () => {
    const view = buildTradeView(TXN, context(2));
    expect(view.direction).toBe("incoming");
    // Roster 2 receives Allen and roster 1's own 2027 1st; roster 1 gets Flowers.
    expect(view.receive.assets.map((a) => a.name)).toEqual(["Braelon Allen", "2027 Early 1st"]);
    expect(view.give.assets.map((a) => a.name)).toEqual(["Zay Flowers"]);
  });

  it("prices a pick from the original owner's projected slot", () => {
    const view = buildTradeView(TXN, context(2));
    const pick = view.receive.assets.find((a) => a.kind === "pick");
    // Roster 1 has the lowest ceiling and misses the playoffs, so slot 1 of 4
    // — Early, and 1.01.
    expect(pick).toMatchObject({ slot: 1, band: "Early", label: "1.01", ktc: 6919, fc: 5049 });
  });

  it("totals the sides, counting the pick in the values but not the points", () => {
    const view = buildTradeView(TXN, context(2));
    // The pick adds 6919/5049 to the receiving side and nothing to its points.
    expect(view.receive.totals).toMatchObject({ ktc: 10919, fc: 8049, projPg: 10, actualPg: 10, avgAge: 22 });
    expect(view.give.totals).toMatchObject({ ktc: 5000, fc: 3500, projPg: 12, actualPg: 12, avgAge: 25 });
  });

  it("names the side each measure favours", () => {
    const view = buildTradeView(TXN, context(2));
    const byKey = Object.fromEntries(view.comparisons.map((c) => [c.key, c]));
    expect(byKey.ktc).toMatchObject({ delta: 5919, favours: "receive" });
    // Younger is better, so the side averaging 22 wins on age.
    expect(byKey.avgAge).toMatchObject({ favours: "receive" });
  });

  it("flips sides and direction for the other manager", () => {
    const view = buildTradeView(TXN, context(1));
    expect(view.direction).toBe("outgoing");
    expect(view.receive.assets.map((a) => a.name)).toEqual(["Zay Flowers"]);
    expect(view.give.assets.map((a) => a.name)).toEqual(["Braelon Allen", "2027 Early 1st"]);
  });

  it("is null for a trade I am not in", () => {
    expect(buildTradeView(TXN, context(4))).toBeNull();
    expect(buildTradeView(TXN, context(null))).toBeNull();
  });

  it("folds every other side of a three-way into one column", () => {
    const threeWay = {
      ...TXN,
      roster_ids: [1, 2, 3],
      adds: { 11576: 2, 9997: 1 },
      draft_picks: ["1,2027,1,3,1"],
    };
    const view = buildTradeView(threeWay, context(2));
    expect(view.multiTeam).toBe(true);
    expect(view.counterparties.map((c) => c.name)).toEqual(["Team 1", "Team 3"]);
    expect(view.give.assets.map((a) => a.name)).toEqual(["Zay Flowers", "2027 Early 1st"]);
  });

  it("carries the expiry through", () => {
    expect(buildTradeView(TXN, context(2)).expiresAt).toBe(1791551096000);
  });
});

describe("buildLeagueView", () => {
  const league = { league_id: "L1", name: "Fantasy Fools" };

  it("counts the two directions and drops trades I am not in", () => {
    const other = { ...TXN, transaction_id: "t2", roster_ids: [3, 4], adds: {}, draft_picks: [] };
    const view = buildLeagueView(league, [TXN, other], context(2));
    expect(view.trades).toHaveLength(1);
    expect(view.incoming).toBe(1);
    expect(view.outgoing).toBe(0);
    expect(view.name).toBe("Fantasy Fools");
  });

  it("sorts the soonest to lapse first", () => {
    const later = { ...TXN, transaction_id: "t3", settings: { expires_at: 1891551096 } };
    const view = buildLeagueView(league, [later, TXN], context(2));
    expect(view.trades.map((t) => t.id)).toEqual(["t1", "t3"]);
  });

  it("passes the order's confidence through so the card can qualify itself", () => {
    const blank = buildLeagueView(league, [TXN], {
      ...context(2),
      order: draftOrder(ROSTERS.map((r) => ({ ...r, settings: { ...r.settings, ppts: 0 } })), { playoffTeams: 1 }),
    });
    expect(blank.confidence).toBe("none");
    const pick = blank.trades[0].receive.assets.find((a) => a.kind === "pick");
    expect(pick.band).toBeNull();
    expect(pick.reason).toBe("no-order");
    expect(pick.ktc).toBeNull();
  });
});

describe("comparisons", () => {
  it("has nothing to say when a side has no value at all", () => {
    const rows = comparisons({ ktc: null, fc: null, projPg: null, actualPg: null, avgAge: null }, {});
    expect(rows.every((r) => r.delta === null)).toBe(true);
  });
});

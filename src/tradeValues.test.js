import {
  pointsPerGame,
  pickValueOf,
  playerValueOf,
  playerAsset,
  pickName,
  pickAsset,
  faabAsset,
  sideTotals,
  difference,
} from "./tradeValues";

describe("pointsPerGame", () => {
  it("divides the season by the games played", () => {
    expect(pointsPerGame({ pts_ppr: 100, gp: 8 })).toBe(12.5);
  });

  it("is null rather than zero when nobody has played", () => {
    // Defaulting the games count to one, as the Trade Helper does, prints a
    // season total in a column headed per-game.
    expect(pointsPerGame({ pts_ppr: 120, gp: 0 })).toBeNull();
    expect(pointsPerGame({ pts_ppr: 120 })).toBeNull();
    expect(pointsPerGame(undefined)).toBeNull();
  });
});

describe("pickValueOf", () => {
  it("prefers the superflex column", () => {
    expect(pickValueOf({ SFValue: 6919, Value: 7108, "FantasyCalc SF Value": 5049 })).toEqual({
      ktc: 6919,
      fc: 5049,
    });
  });

  it("falls back to the 1QB value when the superflex match failed", () => {
    // A failed name match in the scraper leaves SFValue at 0, which would
    // otherwise read as "this pick is worthless".
    expect(pickValueOf({ SFValue: 0, Value: 540 }).ktc).toBe(540);
  });

  it("is null, not zero, when there is no row", () => {
    expect(pickValueOf(null)).toEqual({ ktc: null, fc: null });
  });
});

describe("playerValueOf", () => {
  it("reads the keys the backend resolves for players", () => {
    expect(playerValueOf({ "KTC Value": 4200, "FC Value": 3100 })).toEqual({
      ktc: 4200,
      fc: 3100,
    });
  });

  it("keeps a genuine zero for a player", () => {
    // Unlike a pick, a zero here is the backend's answer rather than a failed
    // lookup, so it is not second-guessed.
    expect(playerValueOf({ "KTC Value": 0, "FC Value": 0 })).toEqual({ ktc: 0, fc: 0 });
  });
});

describe("playerAsset", () => {
  const values = {
    11576: {
      first_name: "Braelon",
      last_name: "Allen",
      position: "RB",
      team: "NYJ",
      age: 22,
      "KTC Value": 4200,
      "FC Value": 3100,
    },
  };
  const projections = { 11576: { pts_ppr: 160, gp: 16 } };
  const stats = { 11576: { pts_ppr: 60, gp: 6 } };

  it("builds a row from the backend", () => {
    expect(playerAsset("11576", { values, projections, stats })).toMatchObject({
      kind: "player",
      name: "Braelon Allen",
      position: "RB",
      team: "NYJ",
      age: 22,
      ktc: 4200,
      fc: 3100,
      projPg: 10,
      actualPg: 10,
      unknown: false,
    });
  });

  it("falls back to the transaction's own player_map when the backend has no row", () => {
    const asset = playerAsset("99999", {
      values: {},
      playerMap: { 99999: { first_name: "Ghost", last_name: "Player", position: "WR", team: "SF" } },
    });
    expect(asset).toMatchObject({
      name: "Ghost Player",
      position: "WR",
      team: "SF",
      ktc: null,
      age: null,
      unknown: true,
    });
  });

  it("falls back to the id when nothing knows the player", () => {
    expect(playerAsset("4242", {}).name).toBe("4242");
  });
});

describe("pickName", () => {
  it("writes the name the value table prints", () => {
    expect(pickName({ season: 2027, band: "Early", round: 1 })).toBe("2027 Early 1st");
    expect(pickName({ season: 2028, band: "Mid", round: 2 })).toBe("2028 Mid 2nd");
    expect(pickName({ season: 2029, band: "Late", round: 3 })).toBe("2029 Late 3rd");
    expect(pickName({ season: 2029, band: "Late", round: 4 })).toBe("2029 Late 4th");
  });

  it("leaves the band out when it is not known", () => {
    expect(pickName({ season: 2026, band: null, round: 12 })).toBe("2026 12th");
  });
});

describe("pickAsset", () => {
  const values = { "2027_early_1": { SFValue: 6919, Value: 7108, "FantasyCalc SF Value": 5049 } };
  const pick = { originalOwner: 7, season: 2027, round: 1, raw: "7,2027,1,4,7" };

  it("prices a pick off its computed band", () => {
    const asset = pickAsset(pick, { band: "Early", slot: 4, label: "1.04", valueId: "2027_early_1" }, { values });
    expect(asset).toMatchObject({
      kind: "pick",
      name: "2027 Early 1st",
      label: "1.04",
      band: "Early",
      ktc: 6919,
      fc: 5049,
      unknown: false,
    });
  });

  it("shows the pick without a value when no band could be worked out", () => {
    const asset = pickAsset(pick, { band: null, valueId: null, reason: "no-order" }, { values });
    expect(asset).toMatchObject({
      name: "2027 1st",
      band: null,
      ktc: null,
      fc: null,
      reason: "no-order",
      unknown: true,
    });
  });

  it("has no value for a round the table does not publish", () => {
    const deep = { originalOwner: 7, season: 2027, round: 9, raw: "7,2027,9,4,7" };
    const asset = pickAsset(deep, { band: "Mid", slot: 5, label: "9.05", valueId: "2027_mid_9" }, { values });
    expect(asset.ktc).toBeNull();
    expect(asset.unknown).toBe(true);
  });
});

describe("sideTotals", () => {
  const player = (over) => ({ kind: "player", ktc: 100, fc: 50, projPg: 10, actualPg: 8, age: 24, unknown: false, ...over });
  const pick = (over) => ({ kind: "pick", ktc: 500, fc: 300, projPg: null, actualPg: null, age: null, unknown: false, ...over });

  it("counts picks in the values and leaves them out of points and age", () => {
    const totals = sideTotals([player(), player({ age: 26, projPg: 12, actualPg: 14 }), pick()]);
    expect(totals.ktc).toBe(700);
    expect(totals.fc).toBe(400);
    expect(totals.projPg).toBe(22);
    expect(totals.actualPg).toBe(22);
    expect(totals.avgAge).toBe(25);
  });

  it("skips an unknown asset rather than adding zero, and says how many", () => {
    const totals = sideTotals([player(), player({ ktc: null, fc: null, unknown: true })]);
    expect(totals.ktc).toBe(100);
    expect(totals.count).toBe(2);
    expect(totals.unknown).toBe(1);
  });

  it("is null rather than zero for a side with nothing to total", () => {
    expect(sideTotals([])).toMatchObject({ ktc: null, projPg: null, avgAge: null, count: 0 });
    expect(sideTotals([pick()]).avgAge).toBeNull();
  });
});

describe("difference", () => {
  it("names the side a gap favours rather than returning a sign", () => {
    expect(difference(700, 500)).toEqual({ delta: 200, favours: "receive" });
    expect(difference(500, 700)).toEqual({ delta: -200, favours: "give" });
    expect(difference(500, 500)).toEqual({ delta: 0, favours: "even" });
  });

  it("inverts for a measure where less is better", () => {
    // A younger side is the better side, so the smaller average age wins.
    expect(difference(24, 27, { lowerIsBetter: true }).favours).toBe("receive");
    expect(difference(29, 27, { lowerIsBetter: true }).favours).toBe("give");
  });

  it("has nothing to say when either side is unknown", () => {
    expect(difference(null, 500)).toEqual({ delta: null, favours: null });
  });
});

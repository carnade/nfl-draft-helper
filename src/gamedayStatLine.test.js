import { hasPlayed, statLine } from "./gamedayStatLine";

// Figures taken from a real week 9, so the formats below are the shapes the
// endpoint actually produces rather than invented ones.

describe("statLine", () => {
  it("leads a quarterback with passing and adds carries only when there are some", () => {
    const lawrence = { gp: 1, pass_yd: 242, pass_td: 1, rush_att: 1, rush_yd: -1 };

    expect(statLine(lawrence, "QB")).toBe("242 pass yd, 1 TD · 1 car, -1 yd");
  });

  it("keeps a negative rushing total negative", () => {
    // Sacks and scrambles behind the line are real, and rounding them to 0
    // would quietly flatter the player.
    expect(statLine({ gp: 1, rush_att: 2, rush_yd: -4 }, "RB")).toBe("2 car, -4 yd");
  });

  it("leads a running back with carries and follows with receiving", () => {
    const hill = { gp: 1, rush_att: 9, rush_yd: 85, rush_td: 1, rec: 3, rec_tgt: 3, rec_yd: 7 };

    expect(statLine(hill, "RB")).toBe("9 car, 85 yd, 1 TD · 3/3, 7 yd");
  });

  it("gives a receiver catches over targets", () => {
    const meyers = { gp: 1, rec: 4, rec_tgt: 6, rec_yd: 65 };

    expect(statLine(meyers, "WR")).toBe("4/6, 65 yd");
  });

  it("treats a tight end like a receiver", () => {
    expect(statLine({ gp: 1, rec: 2, rec_tgt: 3, rec_yd: 61 }, "TE")).toBe("2/3, 61 yd");
  });

  it("includes a receiving touchdown", () => {
    expect(statLine({ gp: 1, rec: 5, rec_tgt: 7, rec_yd: 88, rec_td: 2 }, "WR"))
      .toBe("5/7, 88 yd, 2 TD");
  });

  it("covers a two-way game in both segments", () => {
    const deebo = { gp: 1, rush_att: 4, rush_yd: 31, rec: 6, rec_tgt: 8, rec_yd: 72 };

    expect(statLine(deebo, "WR")).toBe("6/8, 72 yd · 4 car, 31 yd");
  });

  it("drops the integer tail the endpoint sends", () => {
    // Sleeper returns these as floats — 242.0, not 242.
    expect(statLine({ gp: 1.0, pass_yd: 242.0, pass_td: 1.0 }, "QB")).toBe("242 pass yd, 1 TD");
  });

  it("mentions interceptions when there were any", () => {
    expect(statLine({ gp: 1, pass_yd: 180, pass_td: 1, pass_int: 2 }, "QB"))
      .toBe("180 pass yd, 1 TD, 2 INT");
  });

  it("is null for a player whose game has not started", () => {
    // Nothing to report is not the same as a bad game. The caller shows a dash.
    expect(statLine({}, "WR")).toBeNull();
    expect(statLine(null, "WR")).toBeNull();
    expect(statLine(undefined, "RB")).toBeNull();
  });

  it("is null for a player who played and did nothing", () => {
    // Rather than "0/0, 0 yd", which reads as a stat line and is only noise.
    expect(statLine({ gp: 1, rec: 0, rec_tgt: 0, rec_yd: 0 }, "WR")).toBeNull();
  });

  it("is null for a kicker, who has none of these stats", () => {
    expect(statLine({ gp: 1, fgm: 3, xpm: 2 }, "K")).toBeNull();
  });

  it("falls back to whatever is there for an unknown position", () => {
    // A defence, or a position Sleeper adds later. Degrades to something.
    expect(statLine({ gp: 1, rush_att: 1, rush_yd: 12 }, "D/ST")).toBe("1 car, 12 yd");
    expect(statLine({ gp: 1, rec: 1, rec_tgt: 1, rec_yd: 9 }, undefined)).toBe("1/1, 9 yd");
  });

  it("reads a lower-case position", () => {
    expect(statLine({ gp: 1, rec: 4, rec_tgt: 6, rec_yd: 65 }, "wr")).toBe("4/6, 65 yd");
  });
});

describe("hasPlayed", () => {
  it("is true once a game is behind the player", () => {
    expect(hasPlayed({ gp: 1 })).toBe(true);
  });

  it("is false before kickoff, and for nothing at all", () => {
    expect(hasPlayed({ gp: 0 })).toBe(false);
    expect(hasPlayed({})).toBe(false);
    expect(hasPlayed(null)).toBe(false);
  });

  it("is independent of having a line to show", () => {
    // A player can have played and produced nothing worth printing.
    const blank = { gp: 1, rec: 0, rec_tgt: 0 };

    expect(hasPlayed(blank)).toBe(true);
    expect(statLine(blank, "WR")).toBeNull();
  });
});

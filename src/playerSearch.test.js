import {
  normalise,
  playerKey,
  matchPlayers,
  resolvePlayerSearch,
  leaguesWithPlayer,
} from "./playerSearch";

const p = (first, last) => ({ first_name: first, last_name: last });

// Taken from carnade's real rosters, which is where the bug was reproduced:
// 28 of 202 surnames lit leagues that did not hold the player being named.
const DATA = {
  fools: { players: { 1: p("Trevor", "Etienne"), 2: p("Cyrus", "Allen"), 3: p("Chris", "Bell") } },
  fools2: { players: { 4: p("Trevor", "Etienne"), 5: p("Chase", "Brown"), 6: p("Keon", "Coleman") } },
  dararnas: { players: { 7: p("Trevor", "Etienne"), 8: p("Davis", "Mills") } },
  mills: { players: { 9: p("Travis", "Etienne Jr."), 10: p("Josh", "Allen"), 11: p("Carson", "Beck") } },
  dfs: { players: { 12: p("Odell", "Beckham Jr."), 13: p("Tank", "Dell"), 14: p("Ja'Marr", "Chase") } },
  empty: { players: {} },
};

describe("normalise", () => {
  it("strips the punctuation that makes a name unsearchable", () => {
    expect(normalise("Ja'Marr Chase")).toBe("jamarr chase");
    expect(normalise("Odell Beckham Jr.")).toBe("odell beckham jr");
    expect(normalise("  Josh   Allen  ")).toBe("josh allen");
  });

  it("copes with nothing", () => {
    expect(normalise(null)).toBe("");
    expect(normalise(undefined)).toBe("");
  });
});

describe("the bug: lit leagues must be the lit player's leagues", () => {
  // The old search added every matching player's leagues to one set and then
  // named whichever match the loops reached last.
  it("lights only Trevor Etienne's leagues, not Travis's as well", () => {
    const hit = resolvePlayerSearch("etienne", DATA);
    expect(`${hit.firstName} ${hit.lastName}`).toBe("Trevor Etienne");
    expect(hit.leagueIds.sort()).toEqual(["dararnas", "fools", "fools2"]);
    expect(hit.leagueIds).not.toContain("mills");
  });

  it("agrees with what clicking that player would light", () => {
    const hit = resolvePlayerSearch("etienne", DATA);
    expect(hit.leagueIds.sort()).toEqual(
      leaguesWithPlayer(hit.firstName, hit.lastName, DATA).sort()
    );
  });

  it("holds for every single-surname query in the fixture", () => {
    const surnames = new Set();
    for (const entry of Object.values(DATA)) {
      for (const pl of Object.values(entry.players)) surnames.add(pl.last_name.split(" ")[0]);
    }
    for (const q of surnames) {
      const hit = resolvePlayerSearch(q, DATA);
      expect(hit).not.toBeNull();
      expect(hit.leagueIds.sort()).toEqual(
        leaguesWithPlayer(hit.firstName, hit.lastName, DATA).sort()
      );
    }
  });
});

describe("which player a query picks", () => {
  it("does not match the middle of a word", () => {
    // "dell" is inside "Odell", which used to light Odell Beckham's league.
    const hit = resolvePlayerSearch("dell", DATA);
    expect(`${hit.firstName} ${hit.lastName}`).toBe("Tank Dell");
    expect(hit.leagueIds).toEqual(["dfs"]);
  });

  it("prefers a surname to a first name", () => {
    // One word is nearly always a surname: Chase means Ja'Marr, not Chase Brown.
    expect(resolvePlayerSearch("chase", DATA).firstName).toBe("Ja'Marr");
    expect(resolvePlayerSearch("davis", DATA).lastName).toBe("Mills");
  });

  it("prefers an exact surname to a longer one that starts with it", () => {
    expect(resolvePlayerSearch("beck", DATA).lastName).toBe("Beck");
  });

  it("takes an exact full name over anything else", () => {
    const hit = resolvePlayerSearch("josh allen", DATA);
    expect(hit.key).toBe(playerKey("Josh", "Allen"));
    expect(hit.otherMatches).toBe(0);
  });

  it("matches a part of each word", () => {
    expect(resolvePlayerSearch("jos al", DATA).firstName).toBe("Josh");
  });

  it("finds a punctuated name typed plainly", () => {
    expect(resolvePlayerSearch("jamarr", DATA).lastName).toBe("Chase");
  });

  it("breaks a tie on how many of your rosters hold the player", () => {
    // Both are an exact surname match; Trevor is on three rosters, Travis one.
    const matches = matchPlayers("etienne", DATA);
    expect(matches.map((m) => m.firstName)).toEqual(["Trevor", "Travis"]);
  });

  it("gives the same answer whatever order the leagues arrive in", () => {
    const reversed = Object.fromEntries(Object.entries(DATA).reverse());
    expect(resolvePlayerSearch("allen", DATA).key).toBe(
      resolvePlayerSearch("allen", reversed).key
    );
  });

  it("says how many others the query also described", () => {
    expect(resolvePlayerSearch("etienne", DATA).otherMatches).toBe(1);
    expect(resolvePlayerSearch("allen", DATA).otherMatches).toBe(1);
  });
});

describe("edges", () => {
  it("is null when nothing matches", () => {
    expect(resolvePlayerSearch("zzzz", DATA)).toBeNull();
    expect(resolvePlayerSearch("", DATA)).toBeNull();
  });

  it("survives empty or missing data", () => {
    expect(resolvePlayerSearch("allen", {})).toBeNull();
    expect(resolvePlayerSearch("allen", undefined)).toBeNull();
    expect(resolvePlayerSearch("allen", { x: {} })).toBeNull();
    expect(resolvePlayerSearch("allen", { x: { players: { 1: {} } } })).toBeNull();
  });

  it("counts a player on several rosters once", () => {
    const matches = matchPlayers("trevor etienne", DATA);
    expect(matches).toHaveLength(1);
    expect(matches[0].leagueIds.sort()).toEqual(["dararnas", "fools", "fools2"]);
  });

  it("leaguesWithPlayer needs both names to agree", () => {
    expect(leaguesWithPlayer("Josh", "Allen", DATA)).toEqual(["mills"]);
    expect(leaguesWithPlayer("Josh", "Alleno", DATA)).toEqual([]);
  });
});

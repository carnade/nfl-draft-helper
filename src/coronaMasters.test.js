import {
  CORONA_MASTERS_LEAGUE_ID,
  leagueOverview,
  managerFor,
  problemLabel,
  summaryMessage,
  teamProblems,
  whenLabel,
} from "./coronaMasters";

// Shaped on the real week 9, where 5 of the 12 teams had 7 problems between
// them: teamsuomi an empty RB slot and Garrett Wilson Out, joelsylven98 Waddle
// Out and Wan'Dale Robinson on a bye, maxhelgesson Lamar Jackson on IR,
// carnade Rhamondre Stevenson Out, joakimragnarsson91 Kyle Monangai Out.
const SLOTS = ["QB", "RB", "RB", "WR", "WR", "WR", "TE", "FLEX", "FLEX", "DEF"];

const PLAYING = new Set(["GB", "DET", "LAR", "KC", "BUF", "NE", "MIA", "CHI", "BAL", "PHI"]);
// PIT and TEN were idle in the real week; NYG stands in for a bye team here.

const KICKOFFS = {
  GB: new Date("2026-11-08T18:00:00Z"),   // Sun 13:00 Eastern
  NE: new Date("2026-11-08T18:00:00Z"),
  MIA: new Date("2026-11-08T21:25:00Z"),  // Sun 16:25
  BAL: new Date("2026-11-06T01:15:00Z"),  // Thu night
  DET: new Date("2026-11-09T01:20:00Z"),  // Sun night
};

const PLAYERS = {
  love: { first_name: "Jordan", last_name: "Love", position: "QB", team: "GB" },
  stevenson: { first_name: "Rhamondre", last_name: "Stevenson", position: "RB",
               team: "NE", injury_status: "Out" },
  waddle: { first_name: "Jaylen", last_name: "Waddle", position: "WR",
            team: "MIA", injury_status: "Out" },
  robinson: { first_name: "Wan'Dale", last_name: "Robinson", position: "WR",
              team: "NYG" },
  lamar: { first_name: "Lamar", last_name: "Jackson", position: "QB",
           team: "BAL", injury_status: "IR" },
  gibbs: { first_name: "Jahmyr", last_name: "Gibbs", position: "RB", team: "DET" },
  questionable: { first_name: "Rashee", last_name: "Rice", position: "WR",
                  team: "KC", injury_status: "Questionable" },
};

const USERS = [
  { user_id: "u1", display_name: "carnade" },
  { user_id: "u2", display_name: "Redhelge" },
  { user_id: "u3", display_name: "teamsuomi" },
];

const roster = (over = {}) => ({
  roster_id: 1,
  owner_id: "u1",
  starters: ["love", "gibbs", "gibbs", "love", "love", "love", "gibbs", "gibbs", "gibbs", "PHI"],
  ...over,
});

const team = (over = {}) =>
  teamProblems({
    roster: roster(over.roster),
    slots: SLOTS,
    playerById: PLAYERS,
    nameByUserId: { u1: "carnade", u2: "Redhelge", u3: "teamsuomi" },
    playingTeams: PLAYING,
    kickoffs: KICKOFFS,
    ...over,
  });

describe("the league id", () => {
  it("is Corona Masters, as one named constant", () => {
    // Sleeper issues a new id each season, so this is the line to change.
    expect(CORONA_MASTERS_LEAGUE_ID).toBe("1395106065225355264");
  });
});

describe("teamProblems", () => {
  it("finds nothing wrong with a clean lineup", () => {
    const result = team();

    expect(result.problems).toEqual([]);
    expect(result.fixBy).toBeNull();
  });

  it("flags an empty starting slot", () => {
    const result = team({ roster: { starters: ["love", "0", "gibbs", "love", "love",
                                               "love", "gibbs", "gibbs", "gibbs", "PHI"] } });

    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toMatchObject({ slot: "RB", kind: "empty", id: null });
  });

  it("flags a starter who is Out, and names the status", () => {
    const result = team({ roster: { starters: ["love", "stevenson", "gibbs", "love", "love",
                                               "love", "gibbs", "gibbs", "gibbs", "PHI"] } });

    expect(result.problems[0]).toMatchObject({
      name: "Rhamondre Stevenson", slot: "RB", kind: "out", reason: "Out",
    });
  });

  it("flags a starter on IR", () => {
    const result = team({ roster: { starters: ["lamar", "gibbs", "gibbs", "love", "love",
                                               "love", "gibbs", "gibbs", "gibbs", "PHI"] } });

    expect(result.problems[0]).toMatchObject({ name: "Lamar Jackson", kind: "out", reason: "IR" });
  });

  it("flags a starter whose team is not playing", () => {
    const result = team({ roster: { starters: ["love", "gibbs", "gibbs", "robinson", "love",
                                               "love", "gibbs", "gibbs", "gibbs", "PHI"] } });

    expect(result.problems[0]).toMatchObject({
      name: "Wan'Dale Robinson", kind: "bye", reason: "on bye",
    });
  });

  it("leaves a Questionable starter alone", () => {
    // Most of them play. Calling it a problem would cry wolf twelve times a week.
    const result = team({ roster: { starters: ["love", "gibbs", "gibbs", "questionable", "love",
                                               "love", "gibbs", "gibbs", "gibbs", "PHI"] } });

    expect(result.problems).toEqual([]);
  });

  it("does not put a whole league on bye when the schedule failed to load", () => {
    const result = team({ playingTeams: new Set() });

    expect(result.problems).toEqual([]);
  });

  it("orders problems by how bad they are", () => {
    const result = team({ roster: { starters: ["lamar", "0", "gibbs", "robinson", "love",
                                               "love", "gibbs", "gibbs", "gibbs", "PHI"] } });

    expect(result.problems.map((p) => p.kind)).toEqual(["empty", "out", "bye"]);
  });

  it("names a starter the metadata has not reached rather than dropping them", () => {
    const result = team({ roster: { starters: ["love", "9999", "gibbs", "love", "love",
                                               "love", "gibbs", "gibbs", "gibbs", "PHI"] } });

    // No metadata means no status, so nothing is claimed about them.
    expect(result.problems).toEqual([]);
  });
});

describe("fixBy", () => {
  it("is the earliest kickoff among the problems", () => {
    // Lamar plays Thursday night, Waddle on Sunday afternoon.
    const result = team({ roster: { starters: ["lamar", "gibbs", "gibbs", "waddle", "love",
                                               "love", "gibbs", "gibbs", "gibbs", "PHI"] } });

    expect(result.fixBy.toISOString()).toBe("2026-11-06T01:15:00.000Z");
  });

  it("ignores the kickoffs of players who are fine", () => {
    // Gibbs plays Sunday night and is not a problem, so he sets no deadline.
    const result = team({ roster: { starters: ["love", "stevenson", "gibbs", "love", "love",
                                               "love", "gibbs", "gibbs", "gibbs", "PHI"] } });

    expect(result.fixBy.toISOString()).toBe("2026-11-08T18:00:00.000Z");
  });

  it("is null when the only problem is an empty slot", () => {
    // Nothing is running out: an empty slot never locks.
    const result = team({ roster: { starters: ["love", "0", "gibbs", "love", "love",
                                               "love", "gibbs", "gibbs", "gibbs", "PHI"] } });

    expect(result.fixBy).toBeNull();
  });

  it("is null when the only problem is a player on bye", () => {
    const result = team({ roster: { starters: ["love", "gibbs", "gibbs", "robinson", "love",
                                               "love", "gibbs", "gibbs", "gibbs", "PHI"] } });

    expect(result.fixBy).toBeNull();
  });

  it("is null when the problem player's kickoff is unknown", () => {
    const result = team({ kickoffs: {},
      roster: { starters: ["lamar", "gibbs", "gibbs", "love", "love",
                           "love", "gibbs", "gibbs", "gibbs", "PHI"] } });

    expect(result.fixBy).toBeNull();
  });
});

describe("managerFor", () => {
  it("names the owner", () => {
    expect(managerFor({ owner_id: "u1" }, { u1: "carnade" })).toBe("carnade");
  });

  it("names co-owners together, once each", () => {
    // Fifteen managers hold twelve rosters in this league.
    expect(managerFor({ owner_id: "u1", co_owners: ["u2"] }, { u1: "carnade", u2: "Redhelge" }))
      .toBe("carnade & Redhelge");
    expect(managerFor({ owner_id: "u1", co_owners: ["u1"] }, { u1: "carnade" })).toBe("carnade");
  });

  it("falls back to the roster number for an unclaimed team", () => {
    expect(managerFor({ roster_id: 7, owner_id: null }, {})).toBe("Roster 7");
  });
});

describe("leagueOverview", () => {
  const rosters = [
    { roster_id: 1, owner_id: "u1",
      starters: ["love", "stevenson", "gibbs", "love", "love", "love", "gibbs", "gibbs", "gibbs", "PHI"] },
    { roster_id: 2, owner_id: "u2",
      starters: ["love", "gibbs", "gibbs", "love", "love", "love", "gibbs", "gibbs", "gibbs", "PHI"] },
    { roster_id: 3, owner_id: "u3",
      starters: ["lamar", "0", "gibbs", "waddle", "love", "love", "gibbs", "gibbs", "gibbs", "PHI"] },
  ];
  const overview = () =>
    leagueOverview({ rosters, users: USERS, slots: SLOTS, playerById: PLAYERS,
                     playingTeams: PLAYING, kickoffs: KICKOFFS, week: 9 });

  it("puts the team with the most to do first", () => {
    const { teams } = overview();

    expect(teams.map((t) => t.manager)).toEqual(["teamsuomi", "carnade", "Redhelge"]);
  });

  it("splits the broken from the clean", () => {
    const { broken, clean } = overview();

    expect(broken.map((t) => t.manager)).toEqual(["teamsuomi", "carnade"]);
    expect(clean.map((t) => t.manager)).toEqual(["Redhelge"]);
  });

  it("keeps every team, so none can be quietly skipped", () => {
    expect(overview().teams).toHaveLength(3);
  });

  it("carries the week through", () => {
    expect(overview().week).toBe(9);
  });

  it("copes with nothing loaded yet", () => {
    const empty = leagueOverview({});

    expect(empty.teams).toEqual([]);
    expect(empty.broken).toEqual([]);
  });
});

describe("summaryMessage", () => {
  const overview = leagueOverview({
    rosters: [
      { roster_id: 3, owner_id: "u3",
        starters: ["lamar", "0", "gibbs", "waddle", "love", "love", "gibbs", "gibbs", "gibbs", "PHI"] },
      { roster_id: 1, owner_id: "u1",
        starters: ["love", "gibbs", "gibbs", "love", "love", "love", "gibbs", "gibbs", "gibbs", "PHI"] },
      { roster_id: 2, owner_id: "u2",
        starters: ["love", "gibbs", "gibbs", "love", "love", "love", "gibbs", "gibbs", "gibbs", "PHI"] },
    ],
    users: USERS, slots: SLOTS, playerById: PLAYERS,
    playingTeams: PLAYING, kickoffs: KICKOFFS, week: 9,
  });

  it("names the week and the league", () => {
    expect(summaryMessage(overview)).toContain("Week 9 lineup check — Corona Masters");
  });

  it("lists only the managers with something to do", () => {
    const text = summaryMessage(overview);

    expect(text).toContain("teamsuomi");
    expect(text).not.toContain("carnade");
    expect(text).not.toContain("Redhelge");
  });

  it("gives each team its own deadline", () => {
    // Lamar's Thursday night game is the first thing to lock.
    expect(summaryMessage(overview)).toMatch(/teamsuomi — fix by \w{3} \d{2}:\d{2}/);
  });

  it("spells out each problem", () => {
    const text = summaryMessage(overview);

    expect(text).toContain("Lamar Jackson (QB) IR");
    expect(text).toContain("Jaylen Waddle (WR) Out");
    expect(text).toContain("RB: empty");
  });

  it("counts the teams that are fine rather than listing them", () => {
    expect(summaryMessage(overview)).toContain("The other 2 teams look fine.");
  });

  it("says so when there is nothing to chase", () => {
    const allFine = leagueOverview({
      rosters: [{ roster_id: 1, owner_id: "u1", starters: ["love"] }],
      users: USERS, slots: SLOTS, playerById: PLAYERS,
      playingTeams: PLAYING, kickoffs: KICKOFFS, week: 9,
    });

    expect(summaryMessage(allFine)).toContain("All 12 lineups look fine");
  });

  it("uses the singular for one clean team", () => {
    const one = leagueOverview({
      rosters: [
        { roster_id: 3, owner_id: "u3", starters: ["lamar"] },
        { roster_id: 1, owner_id: "u1", starters: ["love"] },
      ],
      users: USERS, slots: SLOTS, playerById: PLAYERS,
      playingTeams: PLAYING, kickoffs: KICKOFFS, week: 9,
    });

    expect(summaryMessage(one)).toContain("The other team looks fine.");
  });
});

describe("labels", () => {
  it("writes a kickoff as a weekday and a 24-hour clock", () => {
    expect(whenLabel(new Date("2026-11-08T18:00:00Z"))).toMatch(/^\w{3} \d{2}:\d{2}$/);
  });

  it("has nothing to say about no kickoff", () => {
    expect(whenLabel(null)).toBeNull();
  });

  it("names an empty slot by the slot", () => {
    expect(problemLabel({ slot: "RB", kind: "empty" })).toBe("RB: empty");
  });

  it("names a player by what is wrong with them", () => {
    expect(problemLabel({ slot: "QB", kind: "out", name: "Lamar Jackson", reason: "IR" }))
      .toBe("Lamar Jackson (QB) IR");
  });
});

// ── The metadata's own "Bye" answers a different week ──────────────────────

describe("a stale Bye in the player metadata", () => {
  // Observed live: the backend marked CHI, DEN, PHI and TB on bye — the week 10
  // byes — while the week on screen was 9, whose byes are PIT and TEN. Taking
  // its word for it put 11 of the 12 teams in trouble over players who were
  // about to play.
  const bySchedule = new Set(["CHI", "GB"]);
  const players = {
    williams: { first_name: "Caleb", last_name: "Williams", position: "QB",
                team: "CHI", injury_status: "Bye" },
    love: { first_name: "Jordan", last_name: "Love", position: "QB", team: "GB" },
  };

  const check = (starters) =>
    teamProblems({
      roster: { roster_id: 1, owner_id: "u1", starters },
      slots: ["QB"],
      playerById: players,
      playingTeams: bySchedule,
      kickoffs: {},
    }).problems;

  it("is ignored when the schedule says that team is playing", () => {
    expect(check(["williams"])).toEqual([]);
  });

  it("still flags a bye the schedule actually shows", () => {
    const problems = teamProblems({
      roster: { roster_id: 1, owner_id: "u1", starters: ["love"] },
      slots: ["QB"],
      playerById: players,
      playingTeams: new Set(["CHI"]),   // Green Bay idle this week
      kickoffs: {},
    }).problems;

    expect(problems[0]).toMatchObject({ kind: "bye", reason: "on bye" });
  });

  it("never reports Bye as the reason for a problem", () => {
    const problems = teamProblems({
      roster: { roster_id: 1, owner_id: "u1", starters: ["williams"] },
      slots: ["QB"],
      playerById: players,
      playingTeams: new Set(["GB"]),    // Chicago idle, so this is a real bye
      kickoffs: {},
    }).problems;

    expect(problems[0].reason).toBe("on bye");
  });
});

// ── Sleeper and the schedule spell three teams differently ─────────────────

describe("team codes", () => {
  // Observed live: every Rams player read as on bye with no deadline, because
  // Sleeper calls them LAR and the schedule our backend serves calls them LA.
  const nacua = {
    nacua: { first_name: "Puka", last_name: "Nacua", position: "WR", team: "LAR" },
    hurt: { first_name: "Kyren", last_name: "Williams", position: "RB",
            team: "LAR", injury_status: "Out" },
  };
  const playing = new Set(["LA", "GB"]);   // the schedule's spelling

  it("does not put a Rams player on bye in a week the Rams play", () => {
    const { problems } = teamProblems({
      roster: { roster_id: 1, starters: ["nacua"] },
      slots: ["WR"], playerById: nacua, playingTeams: playing, kickoffs: {},
    });

    expect(problems).toEqual([]);
  });

  it("finds a Rams player's kickoff under the schedule's spelling", () => {
    const kickoff = new Date("2026-11-08T18:00:00Z");
    const { fixBy } = teamProblems({
      roster: { roster_id: 1, starters: ["hurt"] },
      slots: ["RB"], playerById: nacua, playingTeams: playing,
      kickoffs: { LA: kickoff },
    });

    expect(fixBy.toISOString()).toBe(kickoff.toISOString());
  });
});

import { readFinalWeek, writeFinalWeek } from "./finalWeekCache";

const rows = [
  {
    roster_id: 3,
    matchup_id: 1,
    points: 137.16,
    players: ["a", "b"],
    players_points: { a: 20.5, b: 10 },
    starters: ["a"],
    starters_points: [20.5],
    custom_points: null,
  },
  {
    roster_id: 7,
    matchup_id: 1,
    points: 120.0,
    players: ["c"],
    players_points: { c: 9 },
  },
];

beforeEach(() => sessionStorage.clear());

describe("writeFinalWeek", () => {
  it("keeps a finished week", () => {
    expect(writeFinalWeek("L1", 5, rows, { isFinal: true })).toBe(true);
    expect(readFinalWeek("L1", 5)).not.toBeNull();
  });

  it("refuses a week still being played", () => {
    // Caching a live week would freeze the score mid-game.
    expect(writeFinalWeek("L1", 6, rows, { isFinal: false })).toBe(false);
    expect(readFinalWeek("L1", 6)).toBeNull();
  });

  it("refuses an empty or broken payload", () => {
    expect(writeFinalWeek("L1", 5, [], { isFinal: true })).toBe(false);
    expect(writeFinalWeek("L1", 5, null, { isFinal: true })).toBe(false);
  });
});

describe("readFinalWeek", () => {
  it("returns the week in the shape the API gives it", () => {
    writeFinalWeek("L1", 5, rows, { isFinal: true });
    const back = readFinalWeek("L1", 5);
    expect(back).toHaveLength(2);
    expect(back[0]).toMatchObject({
      roster_id: 3,
      matchup_id: 1,
      points: 137.16,
      players_points: { a: 20.5, b: 10 },
    });
  });

  it("rebuilds players from the points it kept", () => {
    // Not stored: it is exactly the keys of players_points, and storing both
    // doubles what a season costs.
    writeFinalWeek("L1", 5, rows, { isFinal: true });
    expect(readFinalWeek("L1", 5)[0].players.sort()).toEqual(["a", "b"]);
  });

  it("keeps leagues and weeks apart", () => {
    writeFinalWeek("L1", 5, rows, { isFinal: true });
    expect(readFinalWeek("L2", 5)).toBeNull();
    expect(readFinalWeek("L1", 4)).toBeNull();
  });

  it("is null when nothing was kept", () => {
    expect(readFinalWeek("L1", 5)).toBeNull();
  });

  it("is null rather than throwing on nonsense in storage", () => {
    sessionStorage.setItem("gameday_week_L1_5", "{not json");
    expect(readFinalWeek("L1", 5)).toBeNull();
    sessionStorage.setItem("gameday_week_L1_5", '{"a":1}');
    expect(readFinalWeek("L1", 5)).toBeNull();
  });

  it("survives storage being unavailable", () => {
    // Safari's private mode throws rather than returning null.
    const real = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error("denied");
    };
    try {
      expect(readFinalWeek("L1", 5)).toBeNull();
    } finally {
      Storage.prototype.getItem = real;
    }
  });

  it("survives a full quota on write", () => {
    const real = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    try {
      expect(writeFinalWeek("L1", 5, rows, { isFinal: true })).toBe(false);
    } finally {
      Storage.prototype.setItem = real;
    }
  });
});

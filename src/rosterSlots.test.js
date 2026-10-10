import { emptyBenchSlots } from "./rosterSlots";

const ids = (n, prefix = "p") => Array.from({ length: n }, (_, i) => `${prefix}${i}`);

describe("emptyBenchSlots", () => {
  it("counts the slots nobody is in", () => {
    expect(
      emptyBenchSlots({ rosterPositions: ids(25, "slot"), players: ids(20) })
    ).toBe(5);
  });

  it("does not count players on IR or the taxi squad", () => {
    // Sleeper includes both in `players`, but keeps neither in
    // `roster_positions` — they have their own settings. Counting them would
    // make a roster look full when it is not.
    const players = ids(32);
    expect(
      emptyBenchSlots({
        rosterPositions: ids(25, "slot"),
        players,
        reserve: players.slice(0, 3),
        taxi: players.slice(3, 8),
      })
    ).toBe(1);
  });

  it("reads zero on a full roster", () => {
    expect(
      emptyBenchSlots({ rosterPositions: ids(20, "slot"), players: ids(20) })
    ).toBe(0);
  });

  it("reads the whole roster before a draft", () => {
    expect(
      emptyBenchSlots({ rosterPositions: ids(20, "slot"), players: [] })
    ).toBe(20);
  });

  it("never goes negative", () => {
    expect(
      emptyBenchSlots({ rosterPositions: ids(10, "slot"), players: ids(14) })
    ).toBe(0);
  });

  it("says it does not know, rather than zero, with no roster positions", () => {
    // A league whose settings have not arrived has an unknown number of free
    // slots. Reporting 0 would claim the roster is full.
    expect(emptyBenchSlots({ rosterPositions: [], players: ids(5) })).toBeNull();
    expect(emptyBenchSlots({})).toBeNull();
    expect(emptyBenchSlots()).toBeNull();
  });

  it("survives missing arrays", () => {
    expect(
      emptyBenchSlots({
        rosterPositions: ids(20, "slot"),
        players: ids(18),
        reserve: null,
        taxi: undefined,
      })
    ).toBe(2);
  });

  // The real numbers, taken from the live rosters this was checked against.
  it.each([
    ["Fantasy Fools", 25, 32, 3, 5, 1],
    ["Dårarnas Kamp (9)", 28, 35, 2, 6, 1],
    ["Dårarnas Kamp (12)", 28, 37, 5, 6, 2],
    ["Swedish Dynasty Super League", 30, 32, 3, 0, 1],
    ["Trötta Farsor Dynasty", 25, 35, 5, 5, 0],
  ])("matches %s", (_name, capacity, players, reserve, taxi, expected) => {
    expect(
      emptyBenchSlots({
        rosterPositions: ids(capacity, "slot"),
        players: ids(players),
        reserve: ids(reserve, "r"),
        taxi: ids(taxi, "t"),
      })
    ).toBe(expected);
  });
});

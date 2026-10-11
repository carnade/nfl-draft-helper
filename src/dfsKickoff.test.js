import { kickoffAt, kickoffLabel, earliestKickoff, parseGameStartToUtc } from "./dfsKickoff";

// Shaped like a row from the salary scrape. Times in it are US Eastern.
const row = (over = {}) => ({
  name: "A Player",
  game_day: "Sunday",
  game_date: "2026-10-11",
  game_start_time: "1:00PM",
  ...over,
});

const iso = (d) => (d ? d.toISOString() : null);

describe("parseGameStartToUtc", () => {
  it("reads an Eastern kickoff during daylight saving as UTC-4", () => {
    // 11 October is inside US DST, so 1:00PM Eastern is 17:00 UTC.
    expect(iso(parseGameStartToUtc("2026-10-11", "1:00PM"))).toBe("2026-10-11T17:00:00.000Z");
  });

  it("reads one outside daylight saving as UTC-5", () => {
    // 6 December is after the first Sunday in November.
    expect(iso(parseGameStartToUtc("2026-12-06", "1:00PM"))).toBe("2026-12-06T18:00:00.000Z");
  });

  it("gets both ends of daylight saving right", () => {
    // DST 2026 runs 8 March to 1 November.
    expect(iso(parseGameStartToUtc("2026-03-08", "6:00PM"))).toBe("2026-03-08T22:00:00.000Z");
    expect(iso(parseGameStartToUtc("2026-03-07", "6:00PM"))).toBe("2026-03-07T23:00:00.000Z");
    expect(iso(parseGameStartToUtc("2026-11-01", "6:00PM"))).toBe("2026-11-01T23:00:00.000Z");
    expect(iso(parseGameStartToUtc("2026-10-31", "6:00PM"))).toBe("2026-10-31T22:00:00.000Z");
  });

  it("handles both noons", () => {
    expect(iso(parseGameStartToUtc("2026-10-11", "12:00PM"))).toBe("2026-10-11T16:00:00.000Z");
    expect(iso(parseGameStartToUtc("2026-10-11", "12:15AM"))).toBe("2026-10-11T04:15:00.000Z");
  });

  it("guesses 6pm Eastern when the time is missing", () => {
    // Deliberate for the game-has-started check: a late guess locks a player
    // too late rather than too early.
    expect(iso(parseGameStartToUtc("2026-10-11", null))).toBe("2026-10-11T22:00:00.000Z");
    expect(iso(parseGameStartToUtc("2026-10-11", "nonsense"))).toBe("2026-10-11T22:00:00.000Z");
  });

  it("is null without a date", () => {
    expect(parseGameStartToUtc(null, "1:00PM")).toBeNull();
  });
});

describe("kickoffAt", () => {
  it("is the real instant of the game", () => {
    expect(iso(kickoffAt(row()))).toBe("2026-10-11T17:00:00.000Z");
  });

  it("refuses to guess, unlike parseGameStartToUtc", () => {
    // An unknown kickoff must never be reported as the moment the lineup locks.
    expect(kickoffAt(row({ game_start_time: null }))).toBeNull();
    expect(kickoffAt(row({ game_start_time: "TBD" }))).toBeNull();
    expect(kickoffAt(row({ game_date: null }))).toBeNull();
    expect(kickoffAt(null)).toBeNull();
  });
});

describe("kickoffLabel", () => {
  // The app is read from Sweden; these assertions pin the conversion.
  const inStockholm = (over) => {
    const real = Date.prototype.toLocaleDateString;
    const realT = Date.prototype.toLocaleTimeString;
    Date.prototype.toLocaleDateString = function (_l, o) {
      return real.call(this, "en-GB", { ...o, timeZone: "Europe/Stockholm" });
    };
    Date.prototype.toLocaleTimeString = function (_l, o) {
      return realT.call(this, "en-GB", { ...o, timeZone: "Europe/Stockholm" });
    };
    try {
      return kickoffLabel(row(over));
    } finally {
      Date.prototype.toLocaleDateString = real;
      Date.prototype.toLocaleTimeString = realT;
    }
  };

  it("shows an afternoon Eastern game as a Sunday evening", () => {
    // 1:00PM in New York is 19:00 in Stockholm.
    expect(inStockholm({})).toBe("Sun 19:00");
  });

  it("moves the day when the conversion crosses midnight", () => {
    // Sunday night football is Monday morning here — which is exactly why the
    // day is recomputed instead of using game_day.
    expect(inStockholm({ game_start_time: "8:20PM" })).toBe("Mon 02:20");
  });

  it("falls back to the stated day when there is no usable time", () => {
    expect(kickoffLabel(row({ game_start_time: null }))).toBe("Sun");
  });

  it("is null when the row says nothing about when", () => {
    expect(kickoffLabel(row({ game_day: null, game_start_time: null }))).toBeNull();
    expect(kickoffLabel(null)).toBeNull();
  });
});

describe("earliestKickoff", () => {
  it("finds the game that starts first", () => {
    const thu = row({ name: "Thu", game_date: "2026-10-08", game_start_time: "8:20PM" });
    const early = row({ name: "Early", game_start_time: "1:00PM" });
    const late = row({ name: "Late", game_start_time: "4:25PM" });
    expect(earliestKickoff([late, early, thu]).name).toBe("Thu");
    expect(earliestKickoff([late, early]).name).toBe("Early");
  });

  it("compares instants, not clock faces", () => {
    const sunMorning = row({ game_date: "2026-10-11", game_start_time: "9:30AM" });
    const satNight = row({ name: "Sat", game_date: "2026-10-10", game_start_time: "8:15PM" });
    expect(earliestKickoff([sunMorning, satNight]).name).toBe("Sat");
  });

  it("ignores a player whose kickoff is unknown", () => {
    const known = row({ name: "Known", game_start_time: "4:25PM" });
    const unknown = row({ name: "Unknown", game_start_time: null });
    expect(earliestKickoff([unknown, known]).name).toBe("Known");
  });

  it("skips empty slots, which is how an unfilled roster arrives", () => {
    expect(earliestKickoff([null, undefined, row({ name: "Only" })]).name).toBe("Only");
  });

  it("is null when nothing says when it plays", () => {
    expect(earliestKickoff([null, null])).toBeNull();
    expect(earliestKickoff([row({ game_date: null })])).toBeNull();
    expect(earliestKickoff([])).toBeNull();
    expect(earliestKickoff()).toBeNull();
  });
});

import {
  kickoffAt,
  kickoffLabel,
  earliestKickoff,
  hasKickedOff,
  parseGameStartToUtc,
} from "./dfsKickoff";

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

describe("hasKickedOff", () => {
  // 11 October 2026 is inside US DST, so 1:00PM Eastern is 17:00 UTC.
  const KICKOFF = new Date("2026-10-11T17:00:00Z");

  it("is false before kickoff", () => {
    expect(hasKickedOff(row(), new Date("2026-10-11T16:59:00Z"))).toBe(false);
  });

  it("is true from the kickoff instant onward", () => {
    expect(hasKickedOff(row(), KICKOFF)).toBe(true);
    expect(hasKickedOff(row(), new Date("2026-10-11T20:00:00Z"))).toBe(true);
  });

  it("handles a Sunday night game that is Monday in Europe", () => {
    const snf = row({ game_start_time: "8:20PM" });

    expect(hasKickedOff(snf, new Date("2026-10-12T00:00:00Z"))).toBe(false);
    expect(hasKickedOff(snf, new Date("2026-10-12T00:30:00Z"))).toBe(true);
  });

  it("falls back to the small hours after the game when there is no time", () => {
    // 02:00 UTC the next day — 03:00 CET. Deliberately late: a cutoff that
    // guesses late leaves a player editable a little too long, where one that
    // guesses early locks a lineup before its games have been played.
    const noTime = row({ game_start_time: null });

    expect(hasKickedOff(noTime, new Date("2026-10-11T23:00:00Z"))).toBe(false);
    expect(hasKickedOff(noTime, new Date("2026-10-12T01:59:00Z"))).toBe(false);
    expect(hasKickedOff(noTime, new Date("2026-10-12T02:00:00Z"))).toBe(true);
  });

  it("treats a player with no game date as not started", () => {
    // Missing slate data, not a kickoff. Freezing a lineup over it would lock
    // an entrant out for a scrape that came back thin.
    expect(hasKickedOff(row({ game_date: null }), KICKOFF)).toBe(false);
    expect(hasKickedOff({}, KICKOFF)).toBe(false);
  });

  it("does not throw on an empty slot, which is how a part-built roster arrives", () => {
    expect(hasKickedOff(null, KICKOFF)).toBe(false);
    expect(hasKickedOff(undefined, KICKOFF)).toBe(false);
  });

  it("is the same answer for a defence as for anybody else", () => {
    // Defences were skipped by one of the two inlined copies this replaced.
    const dst = row({ name: "Jets", position: "DST" });

    expect(hasKickedOff(dst, new Date("2026-10-11T16:00:00Z"))).toBe(false);
    expect(hasKickedOff(dst, KICKOFF)).toBe(true);
  });
});

// ── The schedule our own backend serves uses a 24-hour clock ───────────────

describe("parseGameStartToUtc on a 24-hour time", () => {
  // Same Eastern instants as the AM/PM cases above, written the other way.
  // 8 November 2026 is after the US clocks go back, so Eastern is UTC-5.
  it("reads the Sunday slate", () => {
    expect(iso(parseGameStartToUtc("2026-11-08", "13:00")))
      .toBe("2026-11-08T18:00:00.000Z");
  });

  it("reads the London kick, which is a morning Eastern time", () => {
    expect(iso(parseGameStartToUtc("2026-11-08", "09:30")))
      .toBe("2026-11-08T14:30:00.000Z");
  });

  it("reads a night game", () => {
    expect(iso(parseGameStartToUtc("2026-11-05", "20:15")))
      .toBe("2026-11-06T01:15:00.000Z");
  });

  it("agrees with the same time written with a meridiem", () => {
    expect(iso(parseGameStartToUtc("2026-11-08", "16:25")))
      .toBe(iso(parseGameStartToUtc("2026-11-08", "4:25PM")));
  });

  it("does not quietly become six in the evening", () => {
    // The regression this branch exists for: a 24-hour time missed the
    // meridiem test and fell through to the "6:00PM" guess, putting every
    // Sunday kickoff five hours late.
    const sundayOne = parseGameStartToUtc("2026-11-08", "13:00");
    const guessedSixPm = parseGameStartToUtc("2026-11-08", "nonsense");

    expect(iso(sundayOne)).not.toBe(iso(guessedSixPm));
    expect(iso(guessedSixPm)).toBe("2026-11-08T23:00:00.000Z");
  });

  it("is null for a clock reading that is not a time", () => {
    expect(parseGameStartToUtc("2026-11-08", "25:00")).toBeNull();
    expect(parseGameStartToUtc("2026-11-08", "13:70")).toBeNull();
  });

  it("still guesses for a string that is no kind of time", () => {
    // Deliberately unchanged: a row with a date but unreadable time keeps the
    // late guess, which locks a player too late rather than too early.
    expect(iso(parseGameStartToUtc("2026-11-08", "kickoff"))).toBe("2026-11-08T23:00:00.000Z");
  });
});

import { kickoffLabel, kickoffSortKey, earliestKickoff } from "./dfsKickoff";

// Shaped like a row from the salary scrape.
const row = (over = {}) => ({
  name: "A Player",
  game_day: "Sunday",
  game_date: "2026-10-11",
  game_start_time: "1:00PM",
  ...over,
});

describe("kickoffLabel", () => {
  it("shortens the day and spaces the meridiem", () => {
    expect(kickoffLabel(row())).toBe("Sun 1:00 PM");
    expect(kickoffLabel(row({ game_day: "Thursday", game_start_time: "8:20PM" }))).toBe(
      "Thu 8:20 PM"
    );
  });

  it("copes with a row that has only one of the two", () => {
    expect(kickoffLabel(row({ game_start_time: null }))).toBe("Sun");
    expect(kickoffLabel(row({ game_day: null }))).toBe("1:00 PM");
  });

  it("is null when the row says nothing about when", () => {
    expect(kickoffLabel(row({ game_day: null, game_start_time: null }))).toBeNull();
    expect(kickoffLabel({})).toBeNull();
    expect(kickoffLabel(null)).toBeNull();
  });
});

describe("kickoffSortKey", () => {
  it("puts the clock into 24 hours so the strings sort", () => {
    expect(kickoffSortKey(row({ game_start_time: "1:00PM" }))).toBe("2026-10-11 13:00");
    expect(kickoffSortKey(row({ game_start_time: "9:30AM" }))).toBe("2026-10-11 09:30");
  });

  it("handles both noons correctly", () => {
    expect(kickoffSortKey(row({ game_start_time: "12:00PM" }))).toBe("2026-10-11 12:00");
    expect(kickoffSortKey(row({ game_start_time: "12:15AM" }))).toBe("2026-10-11 00:15");
  });

  it("sorts an unknown kickoff after that day's known ones", () => {
    // An unknown time must not be reported as the one the lineup locks on.
    const unknown = kickoffSortKey(row({ game_start_time: null }));
    expect(unknown > kickoffSortKey(row({ game_start_time: "11:59PM" }))).toBe(true);
  });

  it("is null without a date to anchor it", () => {
    expect(kickoffSortKey(row({ game_date: null }))).toBeNull();
    expect(kickoffSortKey(null)).toBeNull();
  });
});

describe("earliestKickoff", () => {
  it("finds the game that starts first", () => {
    const thu = row({ name: "Thu guy", game_day: "Thursday", game_date: "2026-10-08", game_start_time: "8:20PM" });
    const early = row({ name: "Early", game_start_time: "1:00PM" });
    const late = row({ name: "Late", game_start_time: "4:25PM" });
    expect(earliestKickoff([late, early, thu]).name).toBe("Thu guy");
    expect(earliestKickoff([late, early]).name).toBe("Early");
  });

  it("compares across days, not just clock times", () => {
    const sunMorning = row({ game_date: "2026-10-11", game_start_time: "9:30AM" });
    const satNight = row({ name: "Sat", game_date: "2026-10-10", game_start_time: "8:15PM" });
    expect(earliestKickoff([sunMorning, satNight]).name).toBe("Sat");
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

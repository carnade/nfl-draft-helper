import { weekToShow } from "./gamedayWeek";

// Local days, since that is what the rule reads.
const at = (iso) => new Date(iso);
const MON = at("2026-10-12T20:00:00");
const TUE_MNF = at("2026-10-13T03:00:00"); // Monday night football, European clock
const TUE = at("2026-10-13T14:00:00");
const WED = at("2026-10-14T09:00:00");
const THU = at("2026-10-15T20:00:00");
const SUN = at("2026-10-18T19:00:00");

// Sleeper during and after week 5: week rolls to 6 once Monday night ends.
const playing = { week: 5, displayWeek: 4, upcomingWeekHasStarted: true };
const rolledOver = { week: 6, displayWeek: 5, upcomingWeekHasStarted: false };

describe("weekToShow", () => {
  it("shows the week being played while it is being played", () => {
    expect(weekToShow({ ...playing, now: THU })).toBe(5);
    expect(weekToShow({ ...playing, now: SUN })).toBe(5);
    expect(weekToShow({ ...playing, now: MON })).toBe(5);
  });

  it("keeps the finished week up through Tuesday", () => {
    expect(weekToShow({ ...rolledOver, now: TUE })).toBe(5);
  });

  it("moves on from Wednesday", () => {
    expect(weekToShow({ ...rolledOver, now: WED })).toBe(6);
    expect(weekToShow({ ...rolledOver, now: THU })).toBe(6);
  });

  it("does not hide a Monday night game being played on Tuesday morning", () => {
    // Kickoff is around 02:15 CET. The calendar says Tuesday, but week 5 is
    // live, and showing week 4's final score instead would be backwards.
    expect(weekToShow({ ...playing, now: TUE_MNF })).toBe(5);
  });

  it("switches the moment that game ends, since the week rolls over with it", () => {
    // Same Tuesday morning, a few hours later: Sleeper has moved to week 6 and
    // none of its games have kicked off.
    expect(weekToShow({ ...rolledOver, now: at("2026-10-13T06:00:00") })).toBe(5);
  });

  it("ignores a display_week that is not directly behind", () => {
    // Not a shape Sleeper produces; not one worth guessing at either.
    expect(weekToShow({ week: 6, displayWeek: 3, now: TUE })).toBe(6);
    expect(weekToShow({ week: 6, displayWeek: 6, now: TUE })).toBe(6);
    expect(weekToShow({ week: 6, displayWeek: 7, now: TUE })).toBe(6);
  });

  it("falls back to week when display_week is missing or nonsense", () => {
    expect(weekToShow({ week: 6, now: TUE })).toBe(6);
    expect(weekToShow({ week: 6, displayWeek: null, now: TUE })).toBe(6);
    expect(weekToShow({ week: 6, displayWeek: 0, now: TUE })).toBe(6);
    expect(weekToShow({ week: 6, displayWeek: "x", now: TUE })).toBe(6);
  });

  it("never returns less than week 1", () => {
    // Preseason reports week 0.
    expect(weekToShow({ week: 0, displayWeek: 0, now: TUE })).toBe(1);
    expect(weekToShow({})).toBe(1);
    expect(weekToShow()).toBe(1);
  });

  it("week 1 Tuesday has nothing to fall back to", () => {
    // display_week 0 is not a week that was played.
    expect(weekToShow({ week: 1, displayWeek: 0, now: TUE })).toBe(1);
  });
});

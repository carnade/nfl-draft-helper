// Which NFL week Gameday should be showing.
//
// Sleeper's /state/nfl carries two: `week`, which is the week whose games come
// next, and `display_week`, which trails it by one. `week` advances on Tuesday
// as soon as Monday night's game finishes — so from Tuesday morning a page
// following `week` shows an empty upcoming fixture, and the result you were
// watching the night before is gone.
//
// The rule here keeps the finished week up through Tuesday and moves on from
// Wednesday.
//
// The awkward part is that Monday Night Football is a Tuesday morning fixture
// in Europe: it kicks off around 02:15 and ends around 05:30 CET. So "it is
// Tuesday, show the previous week" would replace a game being played right now
// with last week's final score. That is why the upcoming week's own games are
// consulted — if any of them has kicked off, `week` is the live week and is
// what to show, whatever day it is.

const TUESDAY = 2;

/**
 * The week to show.
 *
 * `upcomingWeekHasStarted` is whether any game in `week` has kicked off.
 *
 * Falls back to `week` whenever `displayWeek` is missing or does not sit
 * directly behind it — a shape we have not seen is not worth guessing at.
 */
export function weekToShow({
  week,
  displayWeek,
  upcomingWeekHasStarted = false,
  now = new Date(),
} = {}) {
  const current = Number(week) > 0 ? Number(week) : 1;
  const previous = Number(displayWeek);

  if (!Number.isFinite(previous) || previous <= 0) return current;
  // Sleeper keeps these exactly one apart. Anything else and the assumption
  // behind this does not hold.
  if (previous !== current - 1) return current;

  // Games are on. This is the live week whatever the calendar says.
  if (upcomingWeekHasStarted) return current;

  return now.getDay() === TUESDAY ? previous : current;
}

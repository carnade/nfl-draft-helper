// Rosters with somebody sitting on the bench who could be on injured reserve.
//
// Pure: the league objects and a way to look a player up go in, a list of
// issues comes out. No React, no fetching.
//
// Which statuses a reserve slot accepts was established from the live data
// rather than from the documentation. Across nine leagues with reserve slots,
// the only statuses actually sitting on reserve are IR and PUP — and several of
// those leagues have every reserve_allow_* flag switched off, so those two are
// the base case. The flags extend it; they are not the whole rule.
//
// Worth knowing: reserve_allow_out is 0 in every one of these leagues, so an
// "Out" player is not IR-eligible in any of them. Offering one would produce a
// move Sleeper rejects.

import { emptyBenchSlots } from "./rosterSlots";

export const BASE_RESERVE_STATUSES = ["IR", "PUP"];

// league.settings flag -> the injury_status it additionally permits.
const FLAG_STATUSES = {
  reserve_allow_out: "Out",
  reserve_allow_doubtful: "Doubtful",
  reserve_allow_sus: "Sus",
  reserve_allow_na: "NA",
  reserve_allow_dnr: "DNR",
  reserve_allow_cov: "COV",
};

// Most-clearly-unavailable first, so a short list of slots goes to the players
// least likely to be back this week.
const STATUS_ORDER = ["IR", "PUP", "NA", "DNR", "Sus", "COV", "Doubtful", "Out"];

/** The injury statuses this league's reserve slots will accept. */
export function reserveEligibleStatuses(settings) {
  const allowed = new Set(BASE_RESERVE_STATUSES);
  for (const [flag, status] of Object.entries(FLAG_STATUSES)) {
    if (settings?.[flag]) allowed.add(status);
  }
  return allowed;
}

/** Reserve slots with nobody in them. */
export function freeReserveSlots(league) {
  const slots = league?.settings?.reserve_slots || 0;
  if (!slots) return 0;
  const used = (league?.userRoster?.reserve || []).length;
  return Math.max(0, slots - used);
}

/**
 * The issue on one league, or null if there is nothing to do.
 *
 * `getPlayer(leagueId, playerId)` returns whatever metadata the page holds —
 * only injury_status, position and the name are read.
 *
 * Only bench players are offered. Somebody already on reserve has nothing to
 * move, and pulling a starter out would change the lineup as a side effect of
 * what reads as a tidy-up.
 */
export function irIssueFor(league, getPlayer) {
  const freeSlots = freeReserveSlots(league);
  if (!freeSlots) return null;

  const allowed = reserveEligibleStatuses(league?.settings);
  const roster = league?.userRoster || {};

  // Said here rather than relied on from elsewhere. uniquePlayers is already
  // built by subtracting starters, reserve and taxi, so this changes nothing
  // today — but that is a property of how the page happens to derive the list,
  // not of this rule, and a taxi player must never be offered a reserve slot:
  // Sleeper will not take them, and the taxi spot is what makes them cheap to
  // hold in the first place.
  const unavailable = new Set(
    [...(roster.taxi || []), ...(roster.reserve || []), ...(roster.starters || [])]
      .filter((id) => id != null)
      .map(String)
  );

  const candidates = (roster.uniquePlayers || [])
    .filter((id) => !unavailable.has(String(id)))
    .map((id) => {
      const info = getPlayer(league.league_id, id) || {};
      const status = info.injury_status;
      if (!status || !allowed.has(status)) return null;
      return {
        id,
        status,
        position: info.position || null,
        name:
          [info.first_name, info.last_name].filter(Boolean).join(" ").trim() || String(id),
      };
    })
    .filter(Boolean)
    .sort(
      (a, b) =>
        STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) ||
        a.name.localeCompare(b.name)
    );

  if (candidates.length === 0) return null;

  return {
    leagueId: league.league_id,
    leagueName: league.name,
    rosterId: league.userRoster?.rosterId ?? null,
    reserve: league.userRoster?.reserve || [],
    freeSlots,
    candidates,
    // More to move than there is room for, which is what the dialog has to
    // stop you doing rather than letting Sleeper refuse it.
    oversubscribed: candidates.length > freeSlots,
  };
}

/** Every league with a free reserve slot and somebody who could fill it. */
export function findIrIssues(leagues, getPlayer) {
  return (leagues || [])
    .map((league) => irIssueFor(league, getPlayer))
    .filter(Boolean);
}

/** The ones to tick on opening: as many as will fit, best candidates first. */
export function preselectIds(candidates = [], freeSlots = 0) {
  return candidates.slice(0, Math.max(0, freeSlots)).map((c) => c.id);
}

/**
 * Whether a candidate can still be ticked.
 *
 * Once the free slots are spoken for the rest go flat, and un-ticking one
 * brings them back — the alternative is letting you select six for four slots
 * and finding out from Sleeper.
 */
export function selectionIsFull(selectedIds = [], freeSlots = 0) {
  return selectedIds.length >= freeSlots;
}

/**
 * The other direction: somebody on reserve who no longer qualifies to be there.
 *
 * A player who has recovered keeps occupying a reserve slot they are not
 * entitled to, which Sleeper can refuse at lock. Unlike the move *to* reserve,
 * this is worth saying even when it cannot be acted on — the roster is wrong
 * either way, and knowing is the point.
 *
 * Coming off reserve means going back onto the active roster, so it needs a
 * free bench spot, which is the same count the Empty bench column shows.
 */
export function irReturnIssueFor(league, getPlayer) {
  const allowed = reserveEligibleStatuses(league?.settings);
  const reserve = league?.userRoster?.reserve || [];

  const candidates = reserve
    .map((id) => {
      const info = getPlayer(league.league_id, id);
      // No record at all means the page has not loaded this player yet, which
      // is not the same as a player with nothing wrong with them. Flagging it
      // would report every reserve slot as a problem while the page settles.
      if (!info) return null;
      const status = info.injury_status || null;
      if (status && allowed.has(status)) return null;
      return {
        id,
        status,
        position: info.position || null,
        name:
          [info.first_name, info.last_name].filter(Boolean).join(" ").trim() || String(id),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));

  if (candidates.length === 0) return null;

  const userRoster = league?.userRoster || {};
  const freeBench =
    emptyBenchSlots({
      rosterPositions: league?.roster_positions,
      players: [
        ...(userRoster.starters || []),
        ...(userRoster.uniquePlayers || []),
        ...(userRoster.reserve || []),
        ...(userRoster.taxi || []),
      ],
      reserve: userRoster.reserve,
      taxi: userRoster.taxi,
    }) ?? 0;

  return {
    leagueId: league.league_id,
    leagueName: league.name,
    rosterId: userRoster.rosterId ?? null,
    reserve,
    freeBench,
    candidates,
    // Reported anyway. There is nowhere to put them, and that is the thing
    // worth knowing rather than a reason to stay quiet.
    blocked: freeBench === 0,
  };
}

/** Every league holding somebody on reserve who should not be there. */
export function findIrReturnIssues(leagues, getPlayer) {
  return (leagues || [])
    .map((league) => irReturnIssueFor(league, getPlayer))
    .filter(Boolean);
}

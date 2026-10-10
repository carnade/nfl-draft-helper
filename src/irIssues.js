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
  const bench = league?.userRoster?.uniquePlayers || [];

  const candidates = bench
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

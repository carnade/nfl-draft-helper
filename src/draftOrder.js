// Where a manager is projected to draft, and what that makes their picks worth.
//
// A traded draft pick is only as good as the slot it turns into, and nobody
// knows that slot until the season ends. What is known is how a roster is
// doing, so the order is projected from that: lowest max points for drafts
// first, which is the order Sleeper itself will use in reverse.
//
// Max points for rather than points for, deliberately. It is the ceiling a
// roster has shown rather than what it managed to start, so it reads through
// a run of bad lineup luck in a way the standings do not. It is also the one
// number the user asked for.
//
// The projected playoff teams are then moved to the back. A real dynasty draft
// order puts every team that made the playoffs behind every team that did not,
// however badly a seed then went out, and a projection that ignored that would
// put a contender in the top four on ceiling alone.
//
// Nothing here guesses. When the season has produced nothing to rank on, the
// order is reported as unknowable rather than invented — a plausible-looking
// wrong slot is worse than a dash, because it is the sort of thing that gets
// quoted back across a negotiating table.

/**
 * Points, including the hundredths Sleeper splits into a second field.
 *
 * `fpts`/`ppts` carry the whole part and `fpts_decimal`/`ppts_decimal` the
 * rest. Ranking on the whole part alone throws away the tiebreaker, which is
 * exactly the situation a tiebreaker exists for.
 */
export function exactPoints(settings, key) {
  return (settings?.[key] || 0) + (settings?.[`${key}_decimal`] || 0) / 100;
}

/** Sleeper's default standings order: wins, then points scored. */
export function standingsCompare(a, b) {
  return (
    (b.settings?.wins || 0) - (a.settings?.wins || 0) ||
    exactPoints(b.settings, "fpts") - exactPoints(a.settings, "fpts") ||
    (a.roster_id || 0) - (b.roster_id || 0)
  );
}

// Lowest ceiling drafts first. The tiebreaks exist so the order cannot shuffle
// between two renders of the same data — the slots end up in a cache and in a
// tooltip, and a number that moves on its own is not believable.
function maxPfCompare(a, b) {
  return (
    exactPoints(a.settings, "ppts") - exactPoints(b.settings, "ppts") ||
    exactPoints(a.settings, "fpts") - exactPoints(b.settings, "fpts") ||
    (a.roster_id || 0) - (b.roster_id || 0)
  );
}

/** Who is projected to make the playoffs, by the standings as they stand. */
export function projectedPlayoffIds(rosters = [], playoffTeams) {
  const teams = (rosters || []).filter((r) => r?.roster_id != null);
  const wanted = Math.max(0, Math.min(Number(playoffTeams) || 0, teams.length));
  return new Set(
    [...teams].sort(standingsCompare).slice(0, wanted).map((r) => r.roster_id)
  );
}

/**
 * The projected draft order.
 *
 * `slots` maps a roster_id to its 1-based pick slot. `confidence` is "ok" when
 * the playoff count was known, "low" when it was not and the order is max
 * points for alone, and "none" when there is nothing to rank on at all — in
 * which case `slots` is empty and callers must show no slot rather than
 * falling back to the middle of the draft.
 */
export function draftOrder(rosters = [], { playoffTeams } = {}) {
  const teams = (rosters || []).filter((r) => r?.roster_id != null);
  const total = teams.length;
  if (total === 0) return { slots: new Map(), total: 0, confidence: "none" };

  // Nobody has scored, so every roster ranks equal and the "order" would be
  // whatever the tiebreaks happened to say. That is not a projection.
  if (teams.every((r) => exactPoints(r.settings, "ppts") === 0)) {
    return { slots: new Map(), total, confidence: "none" };
  }

  const seeded = projectedPlayoffIds(teams, playoffTeams);
  const byMaxPf = [...teams].sort(maxPfCompare);
  const order = [
    ...byMaxPf.filter((r) => !seeded.has(r.roster_id)),
    ...byMaxPf.filter((r) => seeded.has(r.roster_id)),
  ];

  const slots = new Map(order.map((r, i) => [r.roster_id, i + 1]));
  return { slots, total, confidence: seeded.size === 0 ? "low" : "ok" };
}

/**
 * Early, Mid or Late for a slot — the league split into thirds.
 *
 * The remainder goes to Early, because that is how the values these feed into
 * are priced: KeepTradeCut's "Early 1st" is 1.01 to 1.04 of a twelve, and a
 * twelve is what every dynasty league here runs.
 */
export function bandFor(slot, total) {
  if (!slot || !total || slot < 1 || slot > total) return null;
  const early = Math.ceil(total / 3);
  const mid = Math.ceil((total * 2) / 3);
  if (slot <= early) return "Early";
  return slot <= mid ? "Mid" : "Late";
}

/**
 * A pick written the way a draft board writes it: "1.04".
 *
 * `snake` reverses even rounds. It defaults off because dynasty rookie drafts
 * are normally linear, and it is a parameter rather than an assumption so the
 * real draft type can be plumbed in later without touching the banding.
 */
export function pickLabel({ slot, round, total, snake = false } = {}) {
  if (!slot || !round) return null;
  const effective = snake && total && round % 2 === 0 ? total + 1 - slot : slot;
  return `${round}.${String(effective).padStart(2, "0")}`;
}

/** The key the pick value table uses: "2027_early_1". */
export function pickValueId({ season, band, round } = {}) {
  if (!season || !band || !round) return null;
  return `${season}_${String(band).toLowerCase()}_${round}`;
}

/**
 * Everything displayable about one traded pick.
 *
 * `reason` is why a band or slot is missing, so the row can say which kind of
 * "we don't know" this is instead of showing a bare dash.
 */
export function describePick(pick, { order, currentSeason } = {}) {
  const base = {
    season: pick?.season ?? null,
    round: pick?.round ?? null,
    band: null,
    slot: null,
    label: null,
    valueId: null,
    reason: null,
  };
  if (!pick?.season || !pick?.round) return { ...base, reason: "unparsed" };

  // This season's order is already settled, or the draft has been held. Either
  // way the projection has nothing to say about it.
  if (currentSeason && pick.season <= currentSeason) {
    return { ...base, reason: "past-season" };
  }
  if (!order || order.confidence === "none") {
    return { ...base, reason: "no-order" };
  }

  // The slot belongs to whoever the pick originally belonged to, not to
  // whoever is trading it — a pick that has changed hands twice still lands
  // wherever its first owner finishes.
  const slot = order.slots.get(pick.originalOwner);
  if (!slot) return { ...base, reason: "unknown-roster" };

  const band = bandFor(slot, order.total);
  return {
    ...base,
    band,
    slot,
    label: pickLabel({ slot, round: pick.round, total: order.total }),
    valueId: pickValueId({ season: pick.season, band, round: pick.round }),
    reason: null,
  };
}

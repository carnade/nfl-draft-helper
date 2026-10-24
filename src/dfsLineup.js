// The DFS lineup: its slots, and whether it has changed.
//
// "Has it changed" exists because submitting a lineup to a league marks that
// league's button "Lineup submitted", and the marker used to outlive the
// lineup it was about. Close the modal, swap a player, press Finish again, and
// the button still read submitted and refused to send — the only way out was
// to navigate away and back, which unmounted the page and reset the state.
//
// A submission is a snapshot. Change the lineup and every marker describes
// something that no longer exists, so they all have to go.

// In the order the lineup is built and submitted in. Declared once because the
// signature below compares positionally, and reading the order off the roster
// object's own keys would make it depend on how that object was constructed —
// which happens in more than one place.
export const DFS_SLOTS = ["QB", "RB1", "RB2", "WR1", "WR2", "WR3", "TE", "FLX", "DST"];

/** A lineup with nothing in it. */
export function emptyLineup() {
  return DFS_SLOTS.reduce((out, slot) => ({ ...out, [slot]: null }), {});
}

/**
 * A short string that changes whenever the lineup does.
 *
 * Positional, so moving a player from the flex into a running back slot counts
 * — that is a different lineup and it submits a different code.
 *
 * Players are identified by `sleeper_id`, falling back to the name: a manually
 * entered player carries a name in that field rather than a numeric id, and
 * either way it is what tells two players apart.
 */
export function lineupSignature(roster = {}) {
  return DFS_SLOTS.map((slot) => {
    const player = roster?.[slot];
    if (!player) return "";
    return String(player.sleeper_id || player.name || "?");
  }).join("|");
}

/** Whether two lineups hold the same players in the same slots. */
export function sameLineup(a, b) {
  return lineupSignature(a) === lineupSignature(b);
}

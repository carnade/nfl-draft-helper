import LZString from "lz-string";

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

// ── Reading a submitted lineup back ────────────────────────────────────────

/**
 * The players inside a submitted lineup string, or null.
 *
 * A submission is `"{week}|{LZString.compressToEncodedURIComponent('User:id-salary,...')}"`.
 * The same decode ladder is copy-pasted in five places across DFSResults.js,
 * DFS.js and DFSManage.js, each doing something different with the result. This
 * is the one place that knows the shape, which is where the frontend already
 * keeps "what a lineup is" — see lineupSignature above.
 *
 * Tokens rather than resolved players: a defence is a team code and a manual
 * entry is a name, so the caller decides how to turn a token into something to
 * display. That mirrors the backend's own `_lineup_slot_tokens`.
 */
export function decodeLineup(data) {
  if (typeof data !== "string" || !data.includes("|")) return null;

  const [week, payload] = [data.slice(0, data.indexOf("|")), data.slice(data.indexOf("|") + 1)];
  if (!payload) return null;

  // The order the page writes them in first, then the older spellings.
  let text = null;
  for (const decode of [
    (p) => LZString.decompressFromEncodedURIComponent(p),
    (p) => LZString.decompressFromBase64(p),
    (p) => LZString.decompressFromUTF16(p),
  ]) {
    try {
      const out = decode(payload);
      if (out && (out.includes("-") || out.includes(":"))) {
        text = out;
        break;
      }
    } catch {
      /* try the next one */
    }
  }
  if (!text) return null;

  // A username prefix, when there is one. A purely numeric head is a player id
  // in the older "id:salary" spelling, not a handle.
  let username = null;
  let list = text;
  if (text.includes(":")) {
    const head = text.slice(0, text.indexOf(":")).trim();
    if (!/^\d+$/.test(head)) {
      username = head;
      list = text.slice(text.indexOf(":") + 1);
    }
  }

  const players = list
    .split(",")
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const [token, salary] = pair.split("-");
      return { token: (token || "").trim(), salary: Number(salary) || null };
    })
    .filter((p) => p.token);

  return { week: Number(week) || null, username, players };
}

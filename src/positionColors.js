// Turning whatever a data source calls a position into the one name we use.
//
// Deliberately holds no colours. Those live in positionColors.css as custom
// properties, which is the only way a value can be themed — this module just
// names things and assembles strings that point at those properties.
//
// It replaces five hand-rolled normalisers and three identical getPositionClass
// switches. They disagreed: DFS mapped D/ST four ways, DraftModal emitted a
// `def` class that no rule matched (so defences were simply uncoloured), and
// DFSResults treated every unrecognised position as a flex.

const ALIASES = {
  qb: ["QB"],
  rb: ["RB", "RB1", "RB2"],
  wr: ["WR", "WR1", "WR2", "WR3"],
  te: ["TE"],
  // P and P/K are the draft-list spelling; that bucket counts kickers.
  k: ["K", "PK", "P", "P/K"],
  // Every spelling of a defence seen across Sleeper, the DFS scrape and the
  // tournament entries. DEFENSE_POSITIONS in DFSResults.js is where the odder
  // ones (D, TEAM, TM) come from.
  dst: ["DST", "D/ST", "D_ST", "D-ST", "DEF", "DEFENSE", "D", "TEAM", "TM"],
  flx: ["FLX", "FLEX", "SUPER_FLEX", "SUPERFLEX", "SF", "REC_FLEX", "WRRB_FLEX"],
};

const KEY_BY_ALIAS = new Map();
for (const [key, aliases] of Object.entries(ALIASES)) {
  for (const alias of aliases) KEY_BY_ALIAS.set(alias, key);
}

/** Every key positionKey can return, for tests and for generating CSS. */
export const POSITION_KEYS = [...Object.keys(ALIASES), "default"];

/**
 * The canonical key for a position or roster slot.
 *
 * Unknown returns "default" rather than guessing. That matters: the results
 * page used to fall back to the flex colour, so a player whose metadata had not
 * loaded was rendered as though they were a flex.
 */
export function positionKey(raw) {
  if (raw == null) return "default";
  const cleaned = String(raw).trim().toUpperCase();
  if (!cleaned) return "default";
  return KEY_BY_ALIAS.get(cleaned) || "default";
}

/** The tone class to put on an element, e.g. "pos-dst". */
export function positionClass(raw) {
  return `pos-${positionKey(raw)}`;
}

/**
 * A colour for an inline style, pointing at the token rather than carrying a value.
 *
 * The fallback is not decoration. A custom property that does not resolve makes
 * the whole declaration invalid at computed-value time, and that fails silently
 * — no background, no error, nothing in the console. Naming --pos-default as the
 * fallback means the worst case is a grey chip.
 */
export function positionFill(raw, alpha = 1) {
  const key = positionKey(raw);
  const token = key === "default" ? "--pos-default" : `--pos-${key}`;
  return `hsl(var(${token}, var(--pos-default)) / ${alpha})`;
}

/**
 * What to print on a chip: the position without its depth-chart number.
 *
 * Roster slots arrive as RB1/RB2/WR1..WR3 and should read RB and WR. Anything
 * else is passed through unchanged, so FLX stays FLX and an unknown string is
 * shown as it came rather than being swallowed.
 */
export function positionLabel(slot) {
  if (slot == null) return "";
  const cleaned = String(slot).trim().toUpperCase();
  if (/^RB[12]$/.test(cleaned)) return "RB";
  if (/^WR[123]$/.test(cleaned)) return "WR";
  return String(slot);
}

/**
 * The slots that hold more than one position, and how to draw them.
 *
 * Sleeper shows these as a split icon rather than a word, which is worth
 * copying: "SUPER_FLEX" tells you nothing about what fits, while four coloured
 * bands do. The band order is Sleeper's — WR, RB, TE, QB — which is not the
 * order startSitModel stores eligibility in, so it is written out here.
 *
 * The label is spelled one character per band. FLX happens to be three
 * characters against three bands and SFLX four against four; the two variants
 * below do not line up, and fall back to the label centred across the pill.
 * Neither of those occurs in any league this app has seen — they exist in
 * SLOT_ELIGIBILITY and so must render something sane rather than nonsense.
 */
export const COMPOSITE_SLOTS = {
  FLEX: { label: "FLX", bands: ["WR", "RB", "TE"] },
  SUPER_FLEX: { label: "SFLX", bands: ["WR", "RB", "TE", "QB"] },
  REC_FLEX: { label: "RFX", bands: ["WR", "TE"] },
  WRRB_FLEX: { label: "WRB", bands: ["WR", "RB"] },
};

/** How to draw this slot as a split pill, or null if it is a plain one. */
export function compositeSlot(slot) {
  if (slot == null) return null;
  return COMPOSITE_SLOTS[String(slot).trim().toUpperCase()] || null;
}

/** The positions a composite slot accepts, in the order they are drawn. */
export function positionsForSlot(slot) {
  return compositeSlot(slot)?.bands || null;
}

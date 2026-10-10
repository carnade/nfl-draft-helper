import fs from "fs";
import path from "path";
import {
  positionKey,
  positionClass,
  positionFill,
  positionLabel,
  POSITION_KEYS,
} from "./positionColors";

const CSS_PATH = path.join(__dirname, "positionColors.css");
const css = fs.readFileSync(CSS_PATH, "utf8");

describe("positionKey", () => {
  // Every spelling that actually occurs somewhere in the app or in the data.
  const cases = {
    QB: "qb",
    RB: "rb",
    RB1: "rb",
    RB2: "rb",
    WR: "wr",
    WR1: "wr",
    WR2: "wr",
    WR3: "wr",
    TE: "te",
    K: "k",
    PK: "k",
    P: "k",
    "P/K": "k",
    DST: "dst",
    "D/ST": "dst",
    D_ST: "dst",
    "D-ST": "dst",
    DEF: "dst",
    DEFENSE: "dst",
    D: "dst",
    TEAM: "dst",
    TM: "dst",
    FLX: "flx",
    FLEX: "flx",
    SUPER_FLEX: "flx",
    REC_FLEX: "flx",
    WRRB_FLEX: "flx",
  };

  for (const [raw, key] of Object.entries(cases)) {
    it(`maps ${JSON.stringify(raw)} to ${key}`, () => {
      expect(positionKey(raw)).toBe(key);
    });
  }

  it("does not care about case or surrounding space", () => {
    expect(positionKey("rb")).toBe("rb");
    expect(positionKey(" TE ")).toBe("te");
    expect(positionKey("d/st")).toBe("dst");
  });

  it("calls an unknown position unknown rather than guessing", () => {
    // The results page used to fall back to the flex colour here, so a player
    // whose metadata had not arrived was drawn as though they were a flex.
    expect(positionKey("ZZZ")).toBe("default");
    expect(positionKey("")).toBe("default");
    expect(positionKey("   ")).toBe("default");
    expect(positionKey(null)).toBe("default");
    expect(positionKey(undefined)).toBe("default");
  });

  it("does not know about BN, which is a slot and not a position", () => {
    expect(positionKey("BN")).toBe("default");
  });
});

describe("positionClass", () => {
  it("prefixes the key", () => {
    expect(positionClass("D/ST")).toBe("pos-dst");
    expect(positionClass("RB2")).toBe("pos-rb");
    expect(positionClass("nonsense")).toBe("pos-default");
  });
});

describe("positionFill", () => {
  // Locked as an exact string on purpose. A mistyped custom property makes the
  // declaration invalid at computed-value time: the element simply renders with
  // no background, with nothing logged anywhere. A test on the string is the
  // only cheap way to catch it.
  it("points at the token and carries a fallback", () => {
    expect(positionFill("D/ST", 0.8)).toBe("hsl(var(--pos-dst, var(--pos-default)) / 0.8)");
    expect(positionFill("QB", 0.8)).toBe("hsl(var(--pos-qb, var(--pos-default)) / 0.8)");
  });

  it("defaults to full opacity", () => {
    expect(positionFill("TE")).toBe("hsl(var(--pos-te, var(--pos-default)) / 1)");
  });

  it("does not nest the default inside itself", () => {
    expect(positionFill("ZZZ", 0.8)).toBe("hsl(var(--pos-default, var(--pos-default)) / 0.8)");
  });
});

describe("positionLabel", () => {
  it("drops the depth-chart number", () => {
    expect(positionLabel("RB1")).toBe("RB");
    expect(positionLabel("RB2")).toBe("RB");
    expect(positionLabel("WR3")).toBe("WR");
  });

  it("passes anything else through untouched", () => {
    expect(positionLabel("FLX")).toBe("FLX");
    expect(positionLabel("QB")).toBe("QB");
    expect(positionLabel("")).toBe("");
    expect(positionLabel(null)).toBe("");
  });
});

describe("the stylesheet backs every key", () => {
  const root = css.slice(css.indexOf(":root"), css.indexOf("body.dark"));
  const dark = css.slice(css.indexOf("body.dark"));

  for (const key of POSITION_KEYS) {
    it(`declares all three ramps for ${key}`, () => {
      expect(root).toContain(`--pos-${key}:`);
      expect(root).toContain(`--pos-${key}-edge:`);
      expect(root).toContain(`--pos-${key}-ink:`);
    });
  }

  it("declares a tone class for every key", () => {
    for (const key of POSITION_KEYS) {
      expect(css).toContain(`.pos-${key} {`);
    }
  });

  it("overrides edge and ink for dark, since those are the ramps that move", () => {
    // Fill is deliberately absent here: every chip in the app already used one
    // background for both themes, and only the border and the text changed.
    for (const key of POSITION_KEYS) {
      if (key === "default") continue;
      expect(dark).toContain(`--pos-${key}-edge:`);
      expect(dark).toContain(`--pos-${key}-ink:`);
    }
  });
});

describe("no position colour is written anywhere else", () => {
  // The guard that matters. Eleven copies of the palette drifted into three
  // versions once already; this is what makes a twelfth copy fail out loud.
  const OLD_LITERALS = [
    "339 44%", "155 43%", "155 30%", "201 54%", "30 61%",
    "280 81%", "280 60%", "12 86%",
    "239, 116", "143, 242", "86, 201", "254, 174", "235, 88", "239, 91",
    "#61afef", "#98c379", "#e5c07b", "#c678dd",
  ];
  // #6c757d is deliberately absent. TournamentResults uses it for the bench
  // badge, but it is also the generic muted grey in half a dozen unrelated
  // stylesheets, so banning it would drag files into this change that have
  // nothing to do with positions.

  // Two uses of a position-adjacent hue that are not positions at all.
  const ALLOWED = {
    "positionColors.css": "the palette itself",
    "DFSResults.css": "hsl(30 61% 50%) is the bronze third-place rank badge",
    "TradeAnalyzer.css": "hsl(280 60% 60%) is the KTC value colour",
    "positionColors.test.js": "this file lists the literals it is banning",
  };

  const files = fs
    .readdirSync(__dirname)
    .filter((f) => /\.(css|js)$/.test(f) && !ALLOWED[f]);

  it("checks a plausible number of files", () => {
    expect(files.length).toBeGreaterThan(30);
  });

  for (const file of files) {
    it(`${file} has no hardcoded position colour`, () => {
      const body = fs.readFileSync(path.join(__dirname, file), "utf8");
      const found = OLD_LITERALS.filter((lit) => body.includes(lit));
      expect(found).toEqual([]);
    });
  }
});

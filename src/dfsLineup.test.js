import LZString from "lz-string";
import { DFS_SLOTS, emptyLineup, lineupSignature, sameLineup, decodeLineup } from "./dfsLineup";

const player = (id, name) => ({ sleeper_id: id, name: name || `P${id}` });

const lineup = (over = {}) => ({ ...emptyLineup(), ...over });

describe("emptyLineup", () => {
  it("has every slot, all empty", () => {
    const empty = emptyLineup();
    expect(Object.keys(empty)).toEqual(DFS_SLOTS);
    expect(Object.values(empty).every((v) => v === null)).toBe(true);
  });

  it("is a fresh object each time", () => {
    // Shared between the initial state and the clear-on-load path, so one must
    // not be able to mutate the other.
    const a = emptyLineup();
    a.QB = player("1");
    expect(emptyLineup().QB).toBeNull();
  });
});

describe("lineupSignature", () => {
  it("changes when a player is swapped", () => {
    // This is the bug: the button stayed on "Lineup submitted" because nothing
    // noticed the lineup had changed.
    const before = lineup({ QB: player("100") });
    const after = lineup({ QB: player("200") });
    expect(lineupSignature(before)).not.toBe(lineupSignature(after));
  });

  it("changes when a player is added or removed", () => {
    const empty = lineup();
    const one = lineup({ RB1: player("5") });
    expect(lineupSignature(empty)).not.toBe(lineupSignature(one));
    expect(lineupSignature(one)).not.toBe(lineupSignature(lineup()));
  });

  it("changes when a player moves between slots", () => {
    // A different lineup that submits a different code, so it counts.
    const asRb = lineup({ RB2: player("7") });
    const asFlex = lineup({ FLX: player("7") });
    expect(lineupSignature(asRb)).not.toBe(lineupSignature(asFlex));
  });

  it("is unchanged by anything that is not the lineup", () => {
    // The markers must survive submitting to a second league, so re-rendering
    // with the same players has to produce the same signature.
    const a = lineup({ QB: player("1"), DST: player("9") });
    const b = lineup({ QB: player("1"), DST: player("9") });
    expect(lineupSignature(a)).toBe(lineupSignature(b));
    expect(sameLineup(a, b)).toBe(true);
  });

  it("ignores fields other than the player's identity", () => {
    const a = lineup({ QB: { sleeper_id: "1", name: "X", salary: 7000 } });
    const b = lineup({ QB: { sleeper_id: "1", name: "X", salary: 9000 } });
    expect(lineupSignature(a)).toBe(lineupSignature(b));
  });

  it("identifies a manually entered player by name", () => {
    // Manual entries carry a name in sleeper_id rather than a numeric id; a
    // player with neither must still not collide with an empty slot.
    const byName = lineup({ TE: { name: "Some Rookie" } });
    expect(lineupSignature(byName)).toContain("Some Rookie");
    expect(lineupSignature(byName)).not.toBe(lineupSignature(lineup()));
  });

  it("survives a missing or malformed roster", () => {
    expect(lineupSignature()).toBe(lineupSignature(emptyLineup()));
    expect(lineupSignature(null)).toBe(lineupSignature(emptyLineup()));
    expect(lineupSignature({ QB: {} })).toBe(lineupSignature(lineup({ QB: { } })));
  });

  it("does not depend on the order the roster object was built in", () => {
    // Two places construct a roster, and reading the order off its own keys
    // would make the signature depend on which one did.
    const forwards = lineup({ QB: player("1"), DST: player("9") });
    const backwards = Object.fromEntries(Object.entries(forwards).reverse());
    expect(lineupSignature(backwards)).toBe(lineupSignature(forwards));
  });
});


describe("decodeLineup", () => {
  // Built the way DFS.js builds a submission, so the test exercises the real
  // encoding rather than an idea of it.
  const encode = (text) => LZString.compressToEncodedURIComponent(text);

  it("reads back a lineup the page would have sent", () => {
    const body = "11560-7000,10212-4000,CHI-3500";
    const out = decodeLineup(`7|${encode(`MrJocke:${body}`)}`);
    expect(out.week).toBe(7);
    expect(out.username).toBe("MrJocke");
    expect(out.players).toEqual([
      { token: "11560", salary: 7000 },
      { token: "10212", salary: 4000 },
      { token: "CHI", salary: 3500 },
    ]);
  });

  it("keeps a defence's team code as its token", () => {
    // A defence has no numeric id, which is why tokens are returned rather
    // than resolved players.
    const out = decodeLineup(`7|${encode("MrJocke:CHI-3500")}`);
    expect(out.players[0].token).toBe("CHI");
  });

  it("handles a handle containing digits", () => {
    const out = decodeLineup(`7|${encode("Ringside1981:11560-7000")}`);
    expect(out.username).toBe("Ringside1981");
    expect(out.players).toHaveLength(1);
  });

  it("treats a numeric head as a player, not a handle", () => {
    // The older "id:salary" spelling has no username prefix to strip.
    const out = decodeLineup(`7|${encode("11560:7000")}`);
    expect(out.username).toBeNull();
  });

  it("returns null for anything it cannot read", () => {
    expect(decodeLineup("no-pipe-here")).toBeNull();
    expect(decodeLineup("7|")).toBeNull();
    expect(decodeLineup(`7|${"!!!not a payload!!!"}`)).toBeNull();
    expect(decodeLineup(null)).toBeNull();
    expect(decodeLineup(undefined)).toBeNull();
  });
});

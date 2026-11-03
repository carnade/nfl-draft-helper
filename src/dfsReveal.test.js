import { parseRevealTime, revealIsPending } from "./dfsReveal";

const BEFORE = new Date("2026-11-08T12:00:00Z");
const REVEAL = new Date("2026-11-08T17:00:00Z");
const AFTER = new Date("2026-11-08T19:00:00Z");

describe("parseRevealTime", () => {
  it("reads the formats the backend stores", () => {
    // The rollover writes isoformat() + "Z"; the create form writes
    // milliseconds. Both are live in production right now.
    expect(parseRevealTime("2026-11-08T17:00:00Z")).toEqual(REVEAL);
    expect(parseRevealTime("2026-11-08T17:00:00.000Z")).toEqual(REVEAL);
  });

  it("is null for nothing", () => {
    expect(parseRevealTime(null)).toBeNull();
    expect(parseRevealTime(undefined)).toBeNull();
    expect(parseRevealTime("")).toBeNull();
  });

  it("is null for a date it cannot read, not an Invalid Date", () => {
    // The whole reason this function exists. new Date("nonsense") is truthy,
    // so it satisfied a presence check and then lost every comparison — which
    // switched the gate off instead of closing it.
    expect(parseRevealTime("nonsense")).toBeNull();
    expect(parseRevealTime("2026-13-45T99:00:00Z")).toBeNull();
  });
});

describe("revealIsPending", () => {
  describe("when the server has spoken", () => {
    it("hides, because the server is what withheld the lineups", () => {
      expect(revealIsPending({ serverSaysPending: true, now: AFTER })).toBe(true);
    });

    it("hides even when this browser thinks the reveal has passed", () => {
      // A clock running fast used to cross the reveal early and show the week.
      expect(
        revealIsPending({ serverSaysPending: true, revealTime: REVEAL, now: AFTER })
      ).toBe(true);
    });

    it("hides even for a self-declared admin", () => {
      // admin=true is a URL parameter. The server tells a real organiser apart
      // by verifying their Sleeper token, and if it withheld the data then this
      // viewer is not one — so the local flag must not reopen the page.
      expect(
        revealIsPending({ serverSaysPending: true, isAdmin: true, now: BEFORE })
      ).toBe(true);
    });
  });

  describe("when the server has not objected", () => {
    it("hides before the reveal time", () => {
      expect(revealIsPending({ revealTime: REVEAL, now: BEFORE })).toBe(true);
    });

    it("shows after the reveal time", () => {
      expect(revealIsPending({ revealTime: REVEAL, now: AFTER })).toBe(false);
    });

    it("shows for the organiser's own view, which is how the manage page works", () => {
      expect(
        revealIsPending({ revealTime: REVEAL, isAdmin: true, now: BEFORE })
      ).toBe(false);
    });

    it("shows when there is no reveal set, since there is nothing to wait for", () => {
      expect(revealIsPending({ revealTime: null, now: BEFORE })).toBe(false);
    });

    it("shows at the moment the reveal lands", () => {
      expect(revealIsPending({ revealTime: REVEAL, now: REVEAL })).toBe(false);
    });
  });

  it("shows when asked about nothing at all", () => {
    // A page with no tournament loaded, or an organiser pasting their own data.
    expect(revealIsPending()).toBe(false);
    expect(revealIsPending({})).toBe(false);
  });

  it("closes rather than opens on an unreadable reveal time", () => {
    // parseRevealTime hands over null, and the server's verdict carries it.
    const revealTime = parseRevealTime("nonsense");

    expect(revealIsPending({ serverSaysPending: true, revealTime, now: BEFORE })).toBe(true);
  });
});

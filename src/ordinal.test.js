import { ordinal, ordinalSuffix } from "./ordinal";

describe("ordinalSuffix", () => {
  it("handles the ordinary cases", () => {
    expect(ordinalSuffix(1)).toBe("st");
    expect(ordinalSuffix(2)).toBe("nd");
    expect(ordinalSuffix(3)).toBe("rd");
    expect(ordinalSuffix(4)).toBe("th");
  });

  it("handles the teens, which are the whole reason this exists", () => {
    expect(ordinalSuffix(11)).toBe("th");
    expect(ordinalSuffix(12)).toBe("th");
    expect(ordinalSuffix(13)).toBe("th");
  });

  it("handles the twenties and thirties, where the pattern resumes", () => {
    expect(ordinalSuffix(21)).toBe("st");
    expect(ordinalSuffix(22)).toBe("nd");
    expect(ordinalSuffix(23)).toBe("rd");
    expect(ordinalSuffix(32)).toBe("nd");
  });

  it("is empty for anything that is not a place", () => {
    expect(ordinalSuffix(null)).toBe("");
    expect(ordinalSuffix(undefined)).toBe("");
    expect(ordinalSuffix(0)).toBe("");
    expect(ordinalSuffix("abc")).toBe("");
  });
});

describe("ordinal", () => {
  it("joins the number to its suffix", () => {
    expect(ordinal(1)).toBe("1st");
    expect(ordinal(12)).toBe("12th");
    expect(ordinal(32)).toBe("32nd");
  });

  it("is empty rather than a bare number for a missing rank", () => {
    expect(ordinal(null)).toBe("");
    expect(ordinal(0)).toBe("");
  });
});

import React from "react";
import { render, screen } from "@testing-library/react";
import PositionPill from "./PositionPill";

const bandsOf = (container) => [...container.querySelectorAll(".pos-pill-band")];

describe("PositionPill", () => {
  it("draws a plain position as one chip", () => {
    const { container } = render(<PositionPill position="QB" />);
    const pill = container.querySelector(".pos-pill");
    expect(pill).toHaveClass("pos-pill-solid", "pos-qb");
    expect(pill).toHaveTextContent("QB");
    expect(bandsOf(container)).toHaveLength(0);
  });

  it("drops the depth-chart number from a roster slot", () => {
    render(<PositionPill position="RB2" />);
    expect(screen.getByTitle("RB")).toHaveTextContent("RB");
  });

  it("splits FLEX into W, R and T bands spelling FLX", () => {
    const { container } = render(<PositionPill position="FLEX" />);
    const bands = bandsOf(container);
    expect(bands.map((b) => b.textContent)).toEqual(["F", "L", "X"]);
    expect(bands.map((b) => b.className)).toEqual([
      "pos-pill-band pos-wr",
      "pos-pill-band pos-rb",
      "pos-pill-band pos-te",
    ]);
  });

  it("splits SUPER_FLEX into four bands spelling SFLX", () => {
    const { container } = render(<PositionPill position="SUPER_FLEX" />);
    const bands = bandsOf(container);
    expect(bands.map((b) => b.textContent)).toEqual(["S", "F", "L", "X"]);
    // Quarterback last, which is the band the other flex does not have.
    expect(bands[3]).toHaveClass("pos-qb");
  });

  it("says what a flex accepts, since the letters do not", () => {
    render(<PositionPill position="SUPER_FLEX" />);
    expect(screen.getByTitle("SFLX: WR, RB, TE or QB")).toBeInTheDocument();
  });

  it("centres the label when it does not line up with the bands", () => {
    // REC_FLEX has two bands and a three-character label. No league this app
    // has seen uses it, but it must not render a chopped-up word.
    const { container } = render(<PositionPill position="REC_FLEX" />);
    expect(container.querySelector(".pos-pill")).toHaveClass("pos-pill-labelled");
    expect(bandsOf(container).map((b) => b.textContent)).toEqual(["", ""]);
    expect(container.querySelector(".pos-pill-overlay")).toHaveTextContent("RFX");
  });

  it("renders nothing rather than an empty chip", () => {
    const { container } = render(<PositionPill position={null} />);
    expect(container).toBeEmptyDOMElement();
    const { container: blank } = render(<PositionPill position="" />);
    expect(blank).toBeEmptyDOMElement();
  });

  it("gives an unknown position the neutral tone, not a flex colour", () => {
    const { container } = render(<PositionPill position="ZZZ" />);
    expect(container.querySelector(".pos-pill")).toHaveClass("pos-default");
  });
});

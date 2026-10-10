import React from "react";
import PropTypes from "prop-types";
import "./PositionPill.css";
import { positionClass, positionLabel, compositeSlot } from "./positionColors";

// A position or roster slot as a small coloured chip.
//
// A plain position is one chip. A flex slot is split into a band per position
// it accepts, with the label spelled one character per band — so a SUPER_FLEX
// reads S|F|L|X over wide receiver, running back, tight end and quarterback
// instead of spelling out ten uppercase characters in a table that is already
// short of width.

function bandTitle({ bands }) {
  if (bands.length === 1) return bands[0];
  return `${bands.slice(0, -1).join(", ")} or ${bands[bands.length - 1]}`;
}

function PositionPill({ position, title }) {
  if (position == null || position === "") return null;

  const composite = compositeSlot(position);

  if (composite) {
    const { label, bands } = composite;
    // One character per band only when they happen to match; otherwise the
    // label is centred over the whole pill rather than chopped up arbitrarily.
    const perBand = label.length === bands.length;
    return (
      <span
        className={`pos-pill pos-pill-split${perBand ? "" : " pos-pill-labelled"}`}
        title={title || `${label}: ${bandTitle(composite)}`}
      >
        {bands.map((band, i) => (
          <span key={band} className={`pos-pill-band ${positionClass(band)}`}>
            {perBand ? label[i] : ""}
          </span>
        ))}
        {!perBand && <span className="pos-pill-overlay">{label}</span>}
      </span>
    );
  }

  const label = positionLabel(position);
  return (
    <span className={`pos-pill pos-pill-solid ${positionClass(position)}`} title={title || label}>
      {label}
    </span>
  );
}

PositionPill.propTypes = {
  /** A position (QB, D/ST) or a roster slot (RB2, SUPER_FLEX). */
  position: PropTypes.string,
  /** Overrides the hover text, which otherwise says what a flex accepts. */
  title: PropTypes.string,
};

export default PositionPill;

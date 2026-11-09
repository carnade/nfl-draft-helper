// A matchup, slot by slot.
//
// The card above this says who is winning. This says why: both lineups paired
// against their roster slots, each player's points so far beside what they were
// projected to score, and — when asked for — what they have actually done.
//
// Paired rather than listed twice side by side, because the question being
// asked of a matchup is always "how is my flex doing against theirs".

import React from "react";

import "./MatchupDetail.css";
import PositionPill from "./PositionPill";
import { statLine } from "./gamedayStatLine";
import { rowsTotal } from "./gamedayDetail";

/** Points, to one decimal, or an em dash. Matching Start/Sit's `fmt`. */
function fmt(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(1) : "—";
}

/**
 * One player's half of a row.
 *
 * `align` puts my side's numbers against the slot in the middle and the
 * opponent's against theirs, so the two point columns sit either side of the
 * label rather than drifting to the outer edges of the panel.
 */
export function SidePlayer({ row, stats, showStatLine, align }) {
  if (!row || !row.id) {
    return (
      <div className={`gd-side gd-side-${align} gd-side-empty`}>
        <span className="gd-name ss-muted">empty</span>
      </div>
    );
  }

  const line = showStatLine ? statLine(stats, row.position) : null;

  return (
    <div className={`gd-side gd-side-${align}`}>
      <div className="gd-side-top">
        <span className="gd-name" title={row.team ? `${row.name} · ${row.team}` : row.name}>
          {row.name}
        </span>
        <span className="gd-points">
          <strong>{fmt(row.actual)}</strong>
          <span className="gd-proj" title="Projected for the whole game">
            {" / "}
            {row.hasProjection ? fmt(row.projected) : "—"}
          </span>
        </span>
      </div>
      {showStatLine && (
        <div className="gd-statline ss-muted">{line || "—"}</div>
      )}
    </div>
  );
}

/** One roster slot, with both teams' player in it. */
export function SlotRow({ slot, mine, theirs, statsFor, showStatLine }) {
  return (
    <div className="gd-row">
      <SidePlayer
        row={mine}
        stats={mine?.id ? statsFor(mine.id) : null}
        showStatLine={showStatLine}
        align="mine"
      />
      <div className="gd-slot">
        {slot ? <PositionPill position={slot} /> : <span className="ss-muted">—</span>}
      </div>
      <SidePlayer
        row={theirs}
        stats={theirs?.id ? statsFor(theirs.id) : null}
        showStatLine={showStatLine}
        align="theirs"
      />
    </div>
  );
}

/**
 * The totals strip.
 *
 * The figures come from the rows rather than from the card above, deliberately:
 * if the two ever disagree the panel is wrong about something, and a total that
 * silently borrowed the card's number would hide it.
 */
export function Totals({ mine, theirs, myName, oppName }) {
  return (
    <div className="gd-row gd-totals">
      <div className="gd-side gd-side-mine">
        <div className="gd-side-top">
          <span className="gd-name">{myName}</span>
          <span className="gd-points">
            <strong>{fmt(rowsTotal(mine))}</strong>
            <span className="gd-proj">{" / "}{fmt(rowsTotal(mine, "projected"))}</span>
          </span>
        </div>
      </div>
      <div className="gd-slot ss-muted">now / proj</div>
      <div className="gd-side gd-side-theirs">
        <div className="gd-side-top">
          <span className="gd-name">{oppName}</span>
          <span className="gd-points">
            <strong>{fmt(rowsTotal(theirs))}</strong>
            <span className="gd-proj">{" / "}{fmt(rowsTotal(theirs, "projected"))}</span>
          </span>
        </div>
      </div>
    </div>
  );
}

function MatchupDetail({
  detail,
  oppName,
  statLines = {},
  showStatLines = false,
  onToggleStatLines,
}) {
  if (!detail?.mine?.length) {
    return <div className="gd-detail gd-detail-empty ss-muted">No lineup to show yet.</div>;
  }
  if (!detail.theirs) {
    return (
      <div className="gd-detail gd-detail-empty ss-muted">
        A bye week — there is no opposing lineup to compare against.
      </div>
    );
  }

  const statsFor = (id) => statLines[String(id)] || null;

  return (
    <div className="gd-detail">
      <Totals
        mine={detail.mine}
        theirs={detail.theirs}
        myName="You"
        oppName={oppName || "Opponent"}
      />

      {detail.mine.map((mine, index) => (
        <SlotRow
          key={`${detail.slots[index] || "slot"}-${index}`}
          slot={detail.slots[index]}
          mine={mine}
          theirs={detail.theirs[index]}
          statsFor={statsFor}
          showStatLine={showStatLines}
        />
      ))}

      <button
        type="button"
        className="gd-statline-toggle"
        onClick={onToggleStatLines}
        aria-pressed={showStatLines}
      >
        {showStatLines ? "Hide stat lines" : "Show stat lines"}
      </button>
    </div>
  );
}

export default MatchupDetail;

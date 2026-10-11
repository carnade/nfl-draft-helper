import React, { useState, useMemo } from "react";
import PropTypes from "prop-types";
import "./LeagueIssues.css";
import PositionPill from "./PositionPill";
import { preselectIds, selectionIsFull } from "./irIssues";

// Things worth fixing across every league. One card per kind of problem,
// however many leagues it affects, and one dialog that clears all of them in a
// single pass.
//
// Two kinds so far, in opposite directions: somebody on the bench who could be
// on injured reserve, and somebody on injured reserve who no longer qualifies
// to be there.

const plural = (n, one, many) => (n === 1 ? one : `${n} ${many}`);

/**
 * The selection dialog, shared by both directions.
 *
 * `limitFor` is what makes it work for both: the number of players this league
 * can take. A blocked league returns 0, and everything then falls out of the
 * same rule that stops you over-filling a league — nothing pre-ticked, every
 * box closed off.
 */
function ReserveDialog({
  issues,
  title,
  intro,
  limitFor,
  limitText,
  blockedNote,
  onClose,
  onConfirm,
  busy,
  failures,
}) {
  // Per league, because one league's limit says nothing about another's.
  const [selected, setSelected] = useState(() =>
    Object.fromEntries(
      issues.map((i) => [i.leagueId, preselectIds(i.candidates, limitFor(i))])
    )
  );

  const toggle = (leagueId, id) => {
    setSelected((prev) => {
      const current = prev[leagueId] || [];
      return {
        ...prev,
        [leagueId]: current.includes(id)
          ? current.filter((x) => x !== id)
          : current.concat(id),
      };
    });
  };

  // Reopening restores the pre-ticked state, so this needs no counterpart.
  const clearAll = () =>
    setSelected(Object.fromEntries(issues.map((i) => [i.leagueId, []])));

  const totalSelected = Object.values(selected).reduce((n, ids) => n + ids.length, 0);
  const failureFor = (leagueId) => failures.find((f) => f.leagueId === leagueId);

  return (
    <div className="li-overlay" onClick={busy ? undefined : onClose}>
      <div
        className="li-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="li-modal-head">
          <h2 className="li-modal-title">{title}</h2>
          <p className="li-modal-note">{intro}</p>
        </header>

        <div className="li-modal-scroll">
          {issues.map((issue) => {
            const picked = selected[issue.leagueId] || [];
            const limit = limitFor(issue);
            const full = selectionIsFull(picked, limit);
            const failure = failureFor(issue.leagueId);
            return (
              <section className="li-league" key={issue.leagueId}>
                <header className="li-league-head">
                  <span className="li-league-name">{issue.leagueName}</span>
                  <span className="li-league-slots">{limitText(issue, picked.length)}</span>
                </header>

                {issue.blocked && blockedNote && (
                  <p className="li-league-blocked">{blockedNote}</p>
                )}
                {failure && <p className="li-modal-error">{failure.error}</p>}

                <ul className="li-options">
                  {issue.candidates.map((c) => {
                    const checked = picked.includes(c.id);
                    // Closed off rather than hidden: you can see who else is
                    // involved, and unticking somebody brings them back.
                    const blocked = !checked && full;
                    return (
                      <li key={c.id}>
                        <label
                          className={`li-option${blocked ? " li-option-blocked" : ""}`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={blocked || busy}
                            onChange={() => toggle(issue.leagueId, c.id)}
                          />
                          <PositionPill position={c.position} />
                          <span className="li-option-name">{c.name}</span>
                          <span className={`li-status li-status-${c.status || "none"}`}>
                            {c.status || "fit"}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>

        <footer className="li-modal-foot">
          <p className="li-modal-warning">
            {plural(totalSelected, "1 player", "players")} selected. This changes
            your rosters on Sleeper.
          </p>
          <div className="li-modal-buttons">
            <button
              type="button"
              className="li-confirm"
              onClick={() => onConfirm(selected)}
              disabled={busy || totalSelected === 0}
            >
              {busy ? "Moving…" : "Continue"}
            </button>
            <button type="button" className="li-cancel" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            {/* Apart from the other two: it changes the selection rather than
                deciding what to do with it. */}
            <button
              type="button"
              className="li-clear"
              onClick={clearAll}
              disabled={busy || totalSelected === 0}
            >
              Clear all
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

ReserveDialog.propTypes = {
  issues: PropTypes.array.isRequired,
  title: PropTypes.string.isRequired,
  intro: PropTypes.node.isRequired,
  limitFor: PropTypes.func.isRequired,
  limitText: PropTypes.func.isRequired,
  blockedNote: PropTypes.string,
  onClose: PropTypes.func.isRequired,
  onConfirm: PropTypes.func.isRequired,
  busy: PropTypes.bool,
  failures: PropTypes.array,
};

function IssueCard({ headline, issues, detailFor, canEdit, onFix, actionable }) {
  return (
    <div className="li-card">
      <div className="li-card-body">
        <span className="li-card-headline">{headline}</span>
        <ul className="li-card-leagues">
          {issues.map((i) => (
            <li key={i.leagueId}>
              <span className="li-card-league">{i.leagueName}</span>
              <span className="li-card-slots">{detailFor(i)}</span>
            </li>
          ))}
        </ul>
      </div>
      {!canEdit ? (
        <span
          className="li-card-locked"
          title="Sign in with Sleeper in Settings to make changes"
        >
          sign in to fix
        </span>
      ) : (
        <button type="button" className="li-fix" onClick={onFix}>
          {actionable ? "Fix" : "Review"}
        </button>
      )}
    </div>
  );
}

IssueCard.propTypes = {
  headline: PropTypes.string.isRequired,
  issues: PropTypes.array.isRequired,
  detailFor: PropTypes.func.isRequired,
  canEdit: PropTypes.bool,
  onFix: PropTypes.func.isRequired,
  actionable: PropTypes.bool,
};

function LeagueIssues({ issues, returnIssues, canEdit, onApplyIr, onApplyReturn }) {
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState(false);
  const [failures, setFailures] = useState([]);

  const byName = (a, b) => a.leagueName.localeCompare(b.leagueName);
  const toReserve = useMemo(() => [...(issues || [])].sort(byName), [issues]);
  const fromReserve = useMemo(() => [...(returnIssues || [])].sort(byName), [returnIssues]);

  if (toReserve.length === 0 && fromReserve.length === 0) return null;

  const close = () => {
    if (busy) return;
    setOpen(null);
    setFailures([]);
  };

  const confirm = async (selected) => {
    const source = open === "toReserve" ? toReserve : fromReserve;
    const apply = open === "toReserve" ? onApplyIr : onApplyReturn;
    const picks = source
      .map((issue) => ({ issue, playerIds: selected[issue.leagueId] || [] }))
      .filter((p) => p.playerIds.length > 0);
    if (picks.length === 0) return;

    setBusy(true);
    setFailures([]);
    try {
      const results = await apply(picks);
      const failed = (results || []).filter((r) => r.error);
      // Anything that worked has already left the issue list, so only the
      // leagues that refused stay on screen with their reason.
      if (failed.length === 0) setOpen(null);
      else setFailures(failed);
    } catch (err) {
      setFailures([{ leagueId: source[0].leagueId, error: err?.message || String(err) }]);
    } finally {
      setBusy(false);
    }
  };

  const openKind = (kind) => {
    setFailures([]);
    setOpen(kind);
  };

  const returnCount = fromReserve.reduce((n, i) => n + i.candidates.length, 0);
  const anyRoom = fromReserve.some((i) => !i.blocked);

  return (
    <div className="li-panel">
      {toReserve.length > 0 && (
        <IssueCard
          headline={`${plural(
            toReserve.reduce((n, i) => n + i.candidates.length, 0),
            "1 player",
            "players"
          )} could be on injured reserve`}
          issues={toReserve}
          detailFor={(i) => `${plural(i.freeSlots, "1 slot", "slots")} free`}
          canEdit={canEdit}
          actionable
          onFix={() => openKind("toReserve")}
        />
      )}

      {fromReserve.length > 0 && (
        <IssueCard
          headline={`${plural(returnCount, "1 player", "players")} on injured reserve ${
            returnCount === 1 ? "no longer qualifies" : "no longer qualify"
          }`}
          issues={fromReserve}
          detailFor={(i) =>
            i.blocked ? "no bench room" : `${plural(i.freeBench, "1 spot", "spots")} free`
          }
          canEdit={canEdit}
          actionable={anyRoom}
          onFix={() => openKind("fromReserve")}
        />
      )}

      {open === "toReserve" && (
        <ReserveDialog
          issues={toReserve}
          title="Move to injured reserve"
          intro="Each league is limited to the slots it has free. Everything selected here is applied in one go."
          limitFor={(i) => i.freeSlots}
          limitText={(i, picked) => `${picked} of ${i.freeSlots} free`}
          busy={busy}
          failures={failures}
          onClose={close}
          onConfirm={confirm}
        />
      )}

      {open === "fromReserve" && (
        <ReserveDialog
          issues={fromReserve}
          title="Move off injured reserve"
          intro="These players no longer qualify for the reserve slot they are in. Moving one back needs a free bench spot."
          limitFor={(i) => i.freeBench}
          limitText={(i, picked) =>
            i.blocked ? "no bench room" : `${picked} of ${i.freeBench} free`
          }
          blockedNote="There is no free bench spot in this league, so these cannot be moved until you drop somebody."
          busy={busy}
          failures={failures}
          onClose={close}
          onConfirm={confirm}
        />
      )}
    </div>
  );
}

LeagueIssues.propTypes = {
  issues: PropTypes.array,
  returnIssues: PropTypes.array,
  canEdit: PropTypes.bool,
  onApplyIr: PropTypes.func.isRequired,
  onApplyReturn: PropTypes.func,
};

export default LeagueIssues;

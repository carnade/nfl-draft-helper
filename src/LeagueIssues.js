import React, { useState, useMemo } from "react";
import PropTypes from "prop-types";
import "./LeagueIssues.css";
import PositionPill from "./PositionPill";
import { preselectIds, selectionIsFull } from "./irIssues";

// Things worth fixing across every league — one card, however many leagues are
// affected, and one dialog that clears all of them in a single pass.
//
// Only one kind so far: somebody on the bench who could be on injured reserve
// while that roster has a reserve slot free.

const plural = (n, one, many) => (n === 1 ? one : `${n} ${many}`);

function IrFixDialog({ issues, onClose, onConfirm, busy, failures }) {
  // Selection is per league, because the slot limit is: four free slots in one
  // league says nothing about another.
  const [selected, setSelected] = useState(() =>
    Object.fromEntries(
      issues.map((i) => [i.leagueId, preselectIds(i.candidates, i.freeSlots)])
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

  const totalSelected = Object.values(selected).reduce((n, ids) => n + ids.length, 0);
  const failureFor = (leagueId) => failures.find((f) => f.leagueId === leagueId);

  return (
    <div className="li-overlay" onClick={busy ? undefined : onClose}>
      <div
        className="li-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Move players to injured reserve"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="li-modal-head">
          <h2 className="li-modal-title">Move to injured reserve</h2>
          <p className="li-modal-note">
            Each league is limited to the slots it has free. Everything selected
            here is applied in one go.
          </p>
        </header>

        <div className="li-modal-scroll">
          {issues.map((issue) => {
            const picked = selected[issue.leagueId] || [];
            const full = selectionIsFull(picked, issue.freeSlots);
            const failure = failureFor(issue.leagueId);
            return (
              <section className="li-league" key={issue.leagueId}>
                <header className="li-league-head">
                  <span className="li-league-name">{issue.leagueName}</span>
                  <span className="li-league-slots">
                    {picked.length} of {issue.freeSlots} free
                  </span>
                </header>

                {failure && <p className="li-modal-error">{failure.error}</p>}

                <ul className="li-options">
                  {issue.candidates.map((c) => {
                    const checked = picked.includes(c.id);
                    // Closed off rather than hidden: you can see who else
                    // qualifies, and unticking somebody brings them back.
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
                          <span className={`li-status li-status-${c.status}`}>
                            {c.status}
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
          </div>
        </footer>
      </div>
    </div>
  );
}

IrFixDialog.propTypes = {
  issues: PropTypes.array.isRequired,
  onClose: PropTypes.func.isRequired,
  onConfirm: PropTypes.func.isRequired,
  busy: PropTypes.bool,
  failures: PropTypes.array,
};

function LeagueIssues({ issues, canEdit, onApplyIr }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failures, setFailures] = useState([]);

  const sorted = useMemo(
    () => [...(issues || [])].sort((a, b) => a.leagueName.localeCompare(b.leagueName)),
    [issues]
  );

  const playerCount = sorted.reduce((n, i) => n + i.candidates.length, 0);

  if (sorted.length === 0) return null;

  const close = () => {
    if (busy) return;
    setOpen(false);
    setFailures([]);
  };

  const confirm = async (selected) => {
    const picks = sorted
      .map((issue) => ({ issue, playerIds: selected[issue.leagueId] || [] }))
      .filter((p) => p.playerIds.length > 0);
    if (picks.length === 0) return;

    setBusy(true);
    setFailures([]);
    try {
      const results = await onApplyIr(picks);
      const failed = (results || []).filter((r) => r.error);
      // Anything that worked has already left the issue list, so only the
      // leagues that refused stay on screen with their reason.
      if (failed.length === 0) setOpen(false);
      else setFailures(failed);
    } catch (err) {
      setFailures([{ leagueId: sorted[0].leagueId, error: err?.message || String(err) }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="li-panel">
      <div className="li-card">
        <div className="li-card-body">
          <span className="li-card-headline">
            {plural(playerCount, "1 player", "players")} could be on injured reserve
          </span>
          <ul className="li-card-leagues">
            {sorted.map((i) => (
              <li key={i.leagueId}>{i.leagueName}</li>
            ))}
          </ul>
        </div>
        {canEdit ? (
          <button
            type="button"
            className="li-fix"
            onClick={() => {
              setFailures([]);
              setOpen(true);
            }}
          >
            Fix
          </button>
        ) : (
          <span
            className="li-card-locked"
            title="Sign in with Sleeper in Settings to make changes"
          >
            sign in to fix
          </span>
        )}
      </div>

      {open && (
        <IrFixDialog
          issues={sorted}
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
  canEdit: PropTypes.bool,
  onApplyIr: PropTypes.func.isRequired,
};

export default LeagueIssues;

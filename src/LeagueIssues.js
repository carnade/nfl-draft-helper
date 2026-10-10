import React, { useState, useMemo } from "react";
import PropTypes from "prop-types";
import "./LeagueIssues.css";
import PositionPill from "./PositionPill";
import { preselectIds, selectionIsFull } from "./irIssues";

// Things worth fixing across every league, one card each.
//
// Only one kind so far: somebody on the bench who could be on injured reserve
// while the roster has a reserve slot free. The card states the problem, names
// the league, and opens a dialog to do something about it.

function IrFixDialog({ issue, onClose, onConfirm, busy, error }) {
  const [selected, setSelected] = useState(() =>
    preselectIds(issue.candidates, issue.freeSlots)
  );

  const full = selectionIsFull(selected, issue.freeSlots);

  const toggle = (id) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.concat(id)
    );
  };

  return (
    <div className="li-overlay" onClick={busy ? undefined : onClose}>
      <div
        className="li-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Move players to injured reserve in ${issue.leagueName}`}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="li-modal-title">Move to injured reserve</h2>
        <p className="li-modal-league">{issue.leagueName}</p>

        <p className="li-modal-note">
          {issue.freeSlots === 1
            ? "One reserve slot is free."
            : `${issue.freeSlots} reserve slots are free.`}{" "}
          {issue.oversubscribed
            ? "More players qualify than there is room for, so the rest are closed off until you free one up."
            : "Everyone who qualifies fits."}
        </p>

        <ul className="li-options">
          {issue.candidates.map((c) => {
            const checked = selected.includes(c.id);
            // Closed off rather than hidden: you can see who else qualifies,
            // and un-ticking somebody brings them back within reach.
            const blocked = !checked && full;
            return (
              <li key={c.id}>
                <label className={`li-option${blocked ? " li-option-blocked" : ""}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={blocked || busy}
                    onChange={() => toggle(c.id)}
                  />
                  <PositionPill position={c.position} />
                  <span className="li-option-name">{c.name}</span>
                  <span className={`li-status li-status-${c.status}`}>{c.status}</span>
                </label>
              </li>
            );
          })}
        </ul>

        <p className="li-modal-count">
          {selected.length} of {issue.freeSlots} selected
        </p>

        <p className="li-modal-warning">This changes your roster on Sleeper.</p>
        {error && <p className="li-modal-error">{error}</p>}

        <div className="li-modal-buttons">
          <button
            type="button"
            className="li-confirm"
            onClick={() => onConfirm(selected)}
            disabled={busy || selected.length === 0}
          >
            {busy ? "Moving…" : "Continue"}
          </button>
          <button type="button" className="li-cancel" onClick={onClose} disabled={busy}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

IrFixDialog.propTypes = {
  issue: PropTypes.object.isRequired,
  onClose: PropTypes.func.isRequired,
  onConfirm: PropTypes.func.isRequired,
  busy: PropTypes.bool,
  error: PropTypes.string,
};

function IssueCard({ issue, canEdit, onFix }) {
  const count = issue.candidates.length;
  return (
    <div className="li-card">
      <div className="li-card-body">
        <span className="li-card-headline">
          {count === 1
            ? "A player on the bench could be on injured reserve"
            : `${count} players on the bench could be on injured reserve`}
        </span>
        <span className="li-card-detail">
          {issue.leagueName} — {issue.freeSlots === 1 ? "1 slot" : `${issue.freeSlots} slots`} free
        </span>
      </div>
      {canEdit ? (
        <button type="button" className="li-fix" onClick={() => onFix(issue)}>
          Fix
        </button>
      ) : (
        <span className="li-card-locked" title="Sign in with Sleeper in Settings to make changes">
          sign in to fix
        </span>
      )}
    </div>
  );
}

IssueCard.propTypes = {
  issue: PropTypes.object.isRequired,
  canEdit: PropTypes.bool,
  onFix: PropTypes.func.isRequired,
};

function LeagueIssues({ issues, canEdit, onApplyIr }) {
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const sorted = useMemo(
    () => [...(issues || [])].sort((a, b) => a.leagueName.localeCompare(b.leagueName)),
    [issues]
  );

  if (sorted.length === 0) return null;

  const close = () => {
    if (busy) return;
    setOpen(null);
    setError(null);
  };

  const confirm = async (playerIds) => {
    setBusy(true);
    setError(null);
    try {
      await onApplyIr(open, playerIds);
      setOpen(null);
    } catch (err) {
      // Kept in the dialog rather than thrown away, so the selection it refers
      // to is still on screen.
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="li-panel">
      {sorted.map((issue) => (
        <IssueCard
          key={issue.leagueId}
          issue={issue}
          canEdit={canEdit}
          onFix={(i) => {
            setError(null);
            setOpen(i);
          }}
        />
      ))}
      {open && (
        <IrFixDialog
          key={open.leagueId}
          issue={open}
          busy={busy}
          error={error}
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

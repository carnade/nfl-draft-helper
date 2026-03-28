import React from "react";
import "./DraftGrid.css";

const TEAM_COUNT = 12;

function getPositionClass(player) {
  switch (player.Position) {
    case "WR": return "wr";
    case "RB": return "rb";
    case "TE": return "te";
    case "QB": return "qb";
    case "D/ST": return "dst";
    case "K": return "k";
    default: return "default";
  }
}

function DraftGrid({ initialPlayers, removedPlayers, setPlayers, setRemovedPlayers, draftFormat }) {
  if (!initialPlayers || initialPlayers.length === 0) return null;

  const sorted = [...initialPlayers].sort((a, b) => a["Overall Rank"] - b["Overall Rank"]);
  const rounds = Math.ceil(sorted.length / TEAM_COUNT);

  // Build grid[round][col] = player — use index (not rank value) so rows are always exact
  const grid = Array.from({ length: rounds }, () => Array(TEAM_COUNT).fill(null));

  sorted.forEach((player, index) => {
    const round = Math.floor(index / TEAM_COUNT) + 1; // 1-indexed
    const pickInRound = index % TEAM_COUNT; // 0-indexed

    let col;
    if (draftFormat === "3rr") {
      // Round 3 stays reversed instead of snaking back (F,R,R,F,R,F,R,...)
      // Forward: round 1, or rounds >3 that are even; Reversed: everything else
      const isForward = round === 1 || (round > 3 && round % 2 === 0);
      col = isForward ? pickInRound : (TEAM_COUNT - 1) - pickInRound;
    } else {
      // Snake: odd rounds left→right, even rounds right→left
      col = round % 2 === 1 ? pickInRound : (TEAM_COUNT - 1) - pickInRound;
    }

    grid[round - 1][col] = player;
  });

  const handlePickClick = (player) => {
    const isDrafted = removedPlayers.has(player.Name);
    if (isDrafted) {
      // Un-draft: remove from removedPlayers, add back to players
      setRemovedPlayers((prev) => {
        const next = new Set(prev);
        next.delete(player.Name);
        return next;
      });
      setPlayers((prev) => {
        const next = [...prev, player];
        return next.sort((a, b) => a["Overall Rank"] - b["Overall Rank"]);
      });
    } else {
      // Draft: add to removedPlayers, remove from players
      setRemovedPlayers((prev) => {
        const next = new Set(prev);
        next.add(player.Name);
        return next;
      });
      setPlayers((prev) =>
        prev.filter((p) => p["Overall Rank"] !== player["Overall Rank"])
      );
    }
  };

  return (
    <div className="draft-board">
      {grid.map((row, rowIndex) => (
        <div key={rowIndex} className="draft-grid-row">
          <div className="draft-grid-round-label">R{rowIndex + 1}</div>
          {row.map((player, colIndex) => (
            <div key={colIndex} className="draft-grid-cell">
              {player ? (
                <button
                  className={`grid-player-card ${getPositionClass(player)}${removedPlayers.has(player.Name) ? " drafted" : ""}`}
                  onClick={() => handlePickClick(player)}
                  title={`${player.Name} · ${player.Position} · ${player.Team}`}
                >
                  <div className="grid-card-rank">#{player["Overall Rank"]}</div>
                  <div className="grid-card-name">{player.Name}</div>
                  <div className="grid-card-pos">{player.Position} · {player.Team}</div>
                </button>
              ) : (
                <div className="draft-grid-cell-empty" />
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export default DraftGrid;

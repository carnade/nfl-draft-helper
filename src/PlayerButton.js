import React, { useState } from "react";
import PropTypes from "prop-types";
import "./PlayerButton.css";

function PlayerButton({ player, setPlayers, setRemovedPlayers, scoringType, showPtsMode = false, showPortfolio = true }) {
  const [isDisabled] = useState(false);

  const handleClick = () => {
    const playerId = player["Overall Rank"];

    // Hide all buttons with the same Overall Rank
    document
      .querySelectorAll(`[data-id='${player["Overall Rank"]}']`)
      .forEach((button) => {
        button.style.display = "none"; // Hides the button
      });

    // Add the player to the removedPlayers set
    setRemovedPlayers((prevRemovedPlayers) => {
      const newSet = new Set(prevRemovedPlayers);
      newSet.add(player.Name);
      return newSet;
    });

    // Remove the player from the players list
    setPlayers((prevPlayers) =>
      prevPlayers.filter((p) => p["Overall Rank"] !== playerId)
    );
  };

  const getPositionClass = () => {
    switch (player.Position) {
      case "WR":
        return "wr";
      case "RB":
        return "rb";
      case "TE":
        return "te";
      case "QB":
        return "qb";
      case "D/ST":
        return "dst";
      case "K":
        return "k";
      default:
        return "default";
    }
  };

  const renderPortfolioOrDynastyRankings = () => {
    if (showPtsMode) {
      // Show pts/g mode (redraft)
      const pts = scoringType && scoringType.toLowerCase().includes("half_ppr")
        ? player.pts_half_ppr
        : player.pts_ppr;
      // Calculate pts/g = total points / games played
      const ptsPerGame = (pts !== null && pts !== undefined && player.gp && player.gp > 0)
        ? (pts / player.gp).toFixed(1)
        : "N/A";
      
      // Build the display string with conditional portfolio part
      const parts = [];
      if (showPortfolio) {
        parts.push(`Portfolio: ${player.BestBallTotal || 0}`);
      }
      parts.push(`Pts/g: ${ptsPerGame}`);
      return parts.join(" | ");
    }
    // Show dynasty rankings (KTC/FC) when toggle is off
    return `KTC: ${player["KTC Value"] || "N/A"} | FC: ${
      player["FC Value"] || "N/A"
    }`;
  };

  return (
    <button
      data-id={player["Overall Rank"]}
      disabled={isDisabled}
      onClick={handleClick}
      className={`player-button ${getPositionClass()}`}
    >
      <div className="grid-container">
        <div className="grid-item">R:{player["Overall Rank"]}</div>
        <div className="grid-item player-name" style={{ color: "inherit" }}>
          {player.Name}
        </div>
        <div className="grid-item">{player.Team}</div>
        <div className="grid-item">
          {player["Position"]}
          {player["Position Rank"]}
        </div>
        <div className="grid-item">{renderPortfolioOrDynastyRankings()}</div>
        <div className="grid-item">({player.Bye})</div>
      </div>
    </button>
  );
}

PlayerButton.propTypes = {
  player: PropTypes.shape({
    Name: PropTypes.string.isRequired,
    Position: PropTypes.string.isRequired,
    "Overall Rank": PropTypes.number.isRequired,
    "Position Rank": PropTypes.number,
    Team: PropTypes.string.isRequired,
    Bye: PropTypes.number,
    BestBallTotal: PropTypes.number,
    pts_ppr: PropTypes.number,
    pts_half_ppr: PropTypes.number,
    gp: PropTypes.number,
    "KTC Value": PropTypes.number,
    "FC Value": PropTypes.number,
  }).isRequired,
  setPlayers: PropTypes.func.isRequired,
  setRemovedPlayers: PropTypes.func.isRequired,
  scoringType: PropTypes.string,
  showPtsMode: PropTypes.bool,
};

export default PlayerButton;

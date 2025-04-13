import React, { useState } from "react";
import "./PlayerButton.css";

function PlayerButton({ player, setPlayers, setRemovedPlayers, scoringType }) {
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
    if (["2qb", "ppr", "half_ppr"].includes(scoringType)) {
      return `Portfolio: ${player.BestBallTotal || 0}`; // Default to 0 if BestBallTotal is undefined
    }
    // Render KTC and FC values if scoringType is not one of the specified types
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
        <div className="grid-item player-name">{player.Name}</div>
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

export default PlayerButton;

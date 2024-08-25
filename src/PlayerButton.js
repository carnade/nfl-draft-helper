import React, { useState } from "react";

function PlayerButton({ player, setPlayers, setRemovedPlayers }) {
  const [isDisabled] = useState(false);

  const handleClick = () => {
    const playerId = player["Overall Rank"];
    // Update state to hide the button

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

  const getButtonStyle = () => {
    let color;
    switch (player.Position) {
      case "WR":
        color = "blue";
        break;
      case "RB":
        color = "green";
        break;
      case "TE":
        color = "orange";
        break;
      case "QB":
        color = "red";
        break;
      case "D/ST":
        color = "brown";
        break;
      case "K":
        color = "purple";
        break;
      default:
        color = "Gray";
    }
    return { backgroundColor: color };
  };

  return (
    <button
      data-id={player["Overall Rank"]}
      style={getButtonStyle()}
      disabled={isDisabled}
      onClick={handleClick}
      className="player-button"
    >
      <div className="button-content">
        <span className="overall-rank">
          {player["Overall Rank"]}: {player["Position"]}
          {player["Position Rank"]}
        </span>
        <span className="name">{player.Name}</span>
        <span className="team">{player.Team}</span>
        <span className="bye">({player.Bye})</span>
      </div>
    </button>
  );
}
//     {player["Overall Rank"]} {player.Name} - {player.Team} ({player.Bye})
/*<div className="button-content">
        <span className="overall-rank">{player["Overall Rank"]}</span>
        <span className="name">{player.Name}</span>
        <span className="team">{player.Team}</span>
        <span className="bye">({player.Bye})</span>
      </div>
   */
export default PlayerButton;

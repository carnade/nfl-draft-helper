import React from "react";
import "./PlayerButton.css";

function PlayerButtonDroppable({ player }) {
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
    <div
      data-id={player["Overall Rank"]}
      style={getButtonStyle()}
      className="player-button droppable"
    >
      <div className="grid-container small">
        <div className="grid-item">
          {player["Overall Rank"]}: {player["Position"]}
          {player["Position Rank"]}
        </div>
        <div className="grid-item player-name">{player.Name}</div>
        <div className="grid-item">
          {player.Team} ({player.Bye})
        </div>
      </div>
    </div>
  );
}

export default PlayerButtonDroppable;

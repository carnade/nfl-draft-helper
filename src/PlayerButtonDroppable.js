import React, { useState } from "react";
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
    </div>
  );
}

export default PlayerButtonDroppable;

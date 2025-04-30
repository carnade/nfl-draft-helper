import React from "react";
import PropTypes from "prop-types";
import "./PlayerButton.css";

function PlayerButtonDroppable({ player }) {
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

  return (
    <div
      data-id={player["Overall Rank"]}
      className={`player-button droppable ${getPositionClass()}`}
    >
      <div className="grid-container small">
        <div className="grid-item">
          {player["Overall Rank"]}: {player["Position"]}
          {player["Position Rank"]}
        </div>
        <div className="grid-item player-name" style={{ color: "inherit" }}>
          {player.Name}
        </div>
        <div className="grid-item">
          {player.Team} ({player.Bye})
        </div>
      </div>
    </div>
  );
}

PlayerButtonDroppable.propTypes = {
  player: PropTypes.shape({
    Name: PropTypes.string.isRequired,
    Position: PropTypes.string.isRequired,
    "Overall Rank": PropTypes.number.isRequired,
    "Position Rank": PropTypes.number,
    Team: PropTypes.string.isRequired,
    Bye: PropTypes.number,
  }).isRequired,
};

export default PlayerButtonDroppable;

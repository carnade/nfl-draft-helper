import React, { useState } from "react";

function PlayerButton({ player }) {
  const [isDisabled, setIsDisabled] = useState(false);
  const [isVisible, setIsVisible] = useState(true);

  const handleClick = () => {
    // Update state to hide the button
    setIsVisible(false);

    // Hide all buttons with the same Overall Rank
    document
      .querySelectorAll(`[data-id='${player["Overall Rank"]}']`)
      .forEach((button) => {
        button.style.display = "none"; // Hides the button
      });
    /*setIsDisabled(true);
    document
      .querySelectorAll(`[data-id='${player["Overall Rank"]}']`)
      .forEach((button) => {
        button.disabled = true;
        button.classList.add("disabled");
      });*/
  };

  const getButtonStyle = () => {
    let color;
    switch (player.Position) {
      case "WR":
        color = "blue";
        break;
      case "TE":
        color = "orange";
        break;
      case "QB":
        color = "red";
        break;
      default:
        color = "green";
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
          {player["Overall Rank"]} ({player["Position Rank"]})
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

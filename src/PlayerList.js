import React from "react";
import PlayerButton from "./PlayerButton";

function PlayerList({ title, players, groupBy, removedPlayers }) {
  const groupedPlayers = players.reduce((acc, player) => {
    const tier = player[groupBy];
    if (!acc[tier]) {
      acc[tier] = [];
    }
    acc[tier].push(player);
    return acc;
  }, {});

  return (
    <div className="player-list">
      <h2>{title}</h2>
      {Object.keys(groupedPlayers)
        .sort((a, b) => parseInt(a) - parseInt(b))
        .map((tier) => (
          <div key={tier} className="tier-group">
            <h3>Tier {tier}</h3>
            {groupedPlayers[tier].map(
              (player) =>
                !removedPlayers.has(`${player.Name}`) && (
                  <PlayerButton key={player["Overall Rank"]} player={player} />
                )
            )}
          </div>
        ))}
    </div>
  );
}

export default PlayerList;

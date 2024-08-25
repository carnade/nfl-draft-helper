import React from "react";
import PlayerButton from "./PlayerButton";

function PlayerList({
  title,
  players,
  groupBy,
  removedPlayers,
  setPlayers,
  setRemovedPlayers,
  keepEmptyTiers,
}) {
  // Determine the maximum tier number by checking the players
  const maxTier = players.reduce((max, player) => {
    const tier = player[groupBy];
    return Math.max(max, tier);
  }, 0);

  // Initialize all possible tiers in groupedPlayers
  const groupedPlayers = {};
  for (let i = 1; i <= maxTier; i++) {
    groupedPlayers[i] = []; // Initialize each tier with an empty array
  }

  // Group players into the appropriate tier
  players.forEach((player) => {
    const tier = player[groupBy];
    groupedPlayers[tier].push(player);
  });

  return (
    <div className="player-list">
      <h2>{title}</h2>
      {Object.keys(groupedPlayers).map((tier) => {
        const tierHasPlayers = groupedPlayers[tier].some(
          (player) => !removedPlayers.has(`${player.Name}`)
        );

        // Only render the tier if it has players or keepEmptyTiers is true
        if (tierHasPlayers || keepEmptyTiers) {
          return (
            <div key={tier}>
              <h3>{`Tier ${tier}`}</h3>
              {groupedPlayers[tier].map((player) => {
                const shouldRenderPlayer = !removedPlayers.has(
                  `${player.Name}`
                );

                return shouldRenderPlayer ? (
                  <PlayerButton
                    key={player["Overall Rank"]}
                    player={player}
                    setPlayers={setPlayers}
                    setRemovedPlayers={setRemovedPlayers}
                  />
                ) : null;
              })}
            </div>
          );
        }

        return null; // If tier is empty and keepEmptyTiers is false, render nothing
      })}
    </div>
  );
}

export default PlayerList;

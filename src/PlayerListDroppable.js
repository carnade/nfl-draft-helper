import React from "react";
import PlayerButtonDroppable from "./PlayerButtonDroppable";
import "./PlayerList.css";
// Import from React Beautiful DnD
import { Droppable, Draggable } from "react-beautiful-dnd";

function PlayerListDroppable({ title, players, groupBy }) {
  // 1. Figure out how many tiers exist
  const maxTier = players.reduce((max, player) => {
    const tier = player[groupBy];
    return Math.max(max, tier);
  }, 0);

  // 2. Build an object to group players by tier
  const groupedPlayers = {};
  for (let i = 1; i <= maxTier; i++) {
    groupedPlayers[i] = [];
  }
  // Put each player into groupedPlayers[tier]
  players.forEach((player) => {
    const tier = player[groupBy];
    if (groupedPlayers[tier]) {
      groupedPlayers[tier].push(player);
    }
  });

  return (
    <div className="player-list">
      <h2>{title}</h2>

      {Object.keys(groupedPlayers).map((tier) => {
        // Only render this tier if it has players or keepEmptyTiers is true
        // We'll make each tier its own "droppable" area.
        // droppableId can be something like "QB-1" or "ALL-2", etc.
        const droppableId = `${title}-tier-${tier}`;

        return (
          <Droppable droppableId={droppableId} key={droppableId}>
            {(provided) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className="tier-group"
              >
                <h3>{`Tier ${tier}`}</h3>

                {groupedPlayers[tier].map((player, index) => {
                  // Each Draggable must have a unique string draggableId
                  // We’ll combine the player's overall rank + tier for uniqueness
                  const draggableId = `${player["Overall Rank"]}-${title}`;

                  return (
                    <Draggable
                      key={draggableId}
                      draggableId={draggableId}
                      index={index} // the position in this tier
                    >
                      {(provided) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          {...provided.dragHandleProps}
                        >
                          <PlayerButtonDroppable player={player} />
                        </div>
                      )}
                    </Draggable>
                  );
                })}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        );
      })}
    </div>
  );
}

export default PlayerListDroppable;

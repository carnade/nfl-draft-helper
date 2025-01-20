// CreateRankings.js
import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Papa from "papaparse";
import { DragDropContext, Droppable, Draggable } from "react-beautiful-dnd";
import "./CreateRankings.css";
// 1) Recalculate each player's PositionRank
function recalcPositionRanks(allPlayers) {
  let qbCount = 0,
    rbCount = 0,
    wrCount = 0,
    teCount = 0;
  // Extend if you have more positions

  // We assume allPlayers is ALREADY sorted by OverallRank ascending
  allPlayers.forEach((p) => {
    switch (p.Position) {
      case "QB":
        qbCount++;
        p.PositionRank = qbCount;
        break;
      case "RB":
        rbCount++;
        p.PositionRank = rbCount;
        break;
      case "WR":
        wrCount++;
        p.PositionRank = wrCount;
        break;
      case "TE":
        teCount++;
        p.PositionRank = teCount;
        break;
      // add more positions if needed
      default:
        break;
    }
  });
  return allPlayers; // mutated in place, or you can map/return a new array
}

// 2) Recalculate each player's "Tier" based on their position subset
function recalcPositionTier(allPlayers) {
  // Example: chunk each position by 12 players => Tier = floor(i/12)+1
  // We'll gather them separately, then assign tiers
  const qbList = allPlayers.filter((p) => p.Position === "QB");
  qbList.sort((a, b) => a.OverallRank - b.OverallRank);

  qbList.forEach((player, i) => {
    player.Tier = Math.floor(i / 12) + 1;
  });

  const rbList = allPlayers.filter((p) => p.Position === "RB");
  rbList.sort((a, b) => a.OverallRank - b.OverallRank);

  rbList.forEach((player, i) => {
    player.Tier = Math.floor(i / 12) + 1;
  });

  const wrList = allPlayers.filter((p) => p.Position === "WR");
  wrList.sort((a, b) => a.OverallRank - b.OverallRank);

  wrList.forEach((player, i) => {
    player.Tier = Math.floor(i / 12) + 1;
  });

  const teList = allPlayers.filter((p) => p.Position === "TE");
  teList.sort((a, b) => a.OverallRank - b.OverallRank);

  teList.forEach((player, i) => {
    player.Tier = Math.floor(i / 12) + 1;
  });
  // If you have more positions, do them too
}

// 3) reorderAll: user is dragging within the "ALL" list
function reorderAll(allPlayers, startIndex, endIndex) {
  const newAll = [...allPlayers];
  // Remove item from startIndex
  const [removed] = newAll.splice(startIndex, 1);
  // Insert at endIndex
  newAll.splice(endIndex, 0, removed);

  // Reassign OverallRank from top to bottom
  newAll.forEach((p, i) => {
    p.OverallRank = i + 1;
    // For example, chunk by 12 => OverallTier
    p.OverallTier = Math.floor(i / 12) + 1;
  });

  // Then recalc position ranks
  recalcPositionRanks(newAll);

  // Optionally recalc the per-position Tier
  recalcPositionTier(newAll);

  return newAll; // final updated array
}

// 4) reorderInSubList: user drags within a sub-list (e.g. WR #10 -> WR #7)
function reorderInSubList(
  allPlayers,
  draggableId,
  sourceIndex,
  destIndex,
  position
) {
  // parse the overall rank from draggableId
  const overallRankNum = parseInt(draggableId, 10);

  // find the item in allPlayers
  const oldIndexInAll = allPlayers.findIndex(
    (p) => p.OverallRank === overallRankNum
  );
  if (oldIndexInAll === -1) return allPlayers;

  // gather the subList for that position
  const subList = allPlayers.filter((p) => p.Position === position);
  // sort by PositionRank or OverallRank as needed
  subList.sort((a, b) => a.PositionRank - b.PositionRank);

  // the item at subList[sourceIndex] is what's being dragged
  // the item at subList[destIndex] is the "target" we position around
  const targetItem = subList[destIndex];
  if (!targetItem) return allPlayers; // if no valid target

  // find target in allPlayers
  const targetIndexInAll = allPlayers.findIndex(
    (p) => p.OverallRank === targetItem.OverallRank
  );
  if (targetIndexInAll === -1) return allPlayers;

  // create new array
  const newAll = [...allPlayers];
  // remove the dragged item
  const [removed] = newAll.splice(oldIndexInAll, 1);

  // decide "above" or "below"
  const isMovingUp = destIndex < sourceIndex;
  let insertIndex = targetIndexInAll;
  if (!isMovingUp) {
    insertIndex = targetIndexInAll + 1;
  }
  newAll.splice(insertIndex, 0, removed);

  // now reassign OverallRank from top to bottom
  newAll.forEach((p, i) => {
    p.OverallRank = i + 1;
    p.OverallTier = Math.floor(i / 12) + 1;
  });

  // recalc position-based ranks
  recalcPositionRanks(newAll);
  recalcPositionTier(newAll);

  return newAll;
}

function CreateRankings({ csvData, csvFileName, useTierForOverall }) {
  const navigate = useNavigate();
  const [allPlayers, setAllPlayers] = useState([]);

  // Load CSV
  const handleStartWithCSV = useCallback(
    (csv) => {
      Papa.parse(csv, {
        header: true,
        complete: (result) => {
          let data = result.data;
          // If not using OverallTier from CSV, create your own
          if (!useTierForOverall) {
            data = data.map((player, index) => {
              // overall rank can be i+1, or chunk tiers as you prefer
              return {
                ...player,
                OverallRank: index + 1,
              };
            });
          }
          // Recalc position ranks
          let finalAll = recalcPositionRanks(data);
          setAllPlayers(finalAll);
        },
      });
    },
    [useTierForOverall]
  );

  const handleStartFile = useCallback(
    (fileName) => {
      fetch(fileName)
        .then((res) => res.text())
        .then((csv) => {
          Papa.parse(csv, {
            header: true,
            complete: (result) => {
              let data = result.data;
              if (!useTierForOverall) {
                data = data.map((player, index) => ({
                  ...player,
                  OverallRank: index + 1,
                }));
              }
              let finalAll = recalcPositionRanks(data);
              setAllPlayers(finalAll);
            },
          });
        });
    },
    [useTierForOverall]
  );

  useEffect(() => {
    if (csvData) {
      handleStartWithCSV(csvData);
    } else {
      handleStartFile(csvFileName);
    }
  }, [csvData, csvFileName, handleStartWithCSV, handleStartFile]);

  // Build sub-lists for rendering (always derived from the single allPlayers array)
  const qbPlayers = allPlayers
    .filter((p) => p.Position === "QB")
    .sort((a, b) => a.PositionRank - b.PositionRank);

  const rbPlayers = allPlayers
    .filter((p) => p.Position === "RB")
    .sort((a, b) => a.PositionRank - b.PositionRank);

  const wrPlayers = allPlayers
    .filter((p) => p.Position === "WR")
    .sort((a, b) => a.PositionRank - b.PositionRank);

  const tePlayers = allPlayers
    .filter((p) => p.Position === "TE")
    .sort((a, b) => a.PositionRank - b.PositionRank);

  // For the ALL list, we sort by OverallRank
  const sortedAll = [...allPlayers].sort(
    (a, b) => a.OverallRank - b.OverallRank
  );

  /**
   * onDragEnd - the main logic to handle reordering
   */
  const onDragEnd = (result) => {
    const { source, destination, draggableId } = result;
    if (!destination) return;

    // If user dropped item in the same place
    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) {
      return;
    }

    // If user tries to drop in a different droppable, but we only do same-droppable
    if (destination.droppableId !== source.droppableId) {
      // For example, block cross-list moves:
      return;
    }

    // The user is reordering within the SAME droppable
    if (source.droppableId === "all") {
      // reorder in the 'allPlayers' array by index
      const newAll = reorderAll(sortedAll, source.index, destination.index);
      setAllPlayers(newAll);
    } else {
      // reorder in sub-list
      // droppableId might be "qb", "rb", "wr", or "te"
      const newAll = reorderInSubList(
        sortedAll,
        draggableId,
        source.index,
        destination.index,
        source.droppableId // e.g. "wr"
      );
      setAllPlayers(newAll);
    }
  };

  /**
   * Helper to render a droppable list
   * @param droppableId "all" | "qb" | "rb" | "wr" | "te"
   * @param list array of players to display
   * @param title heading
   */
  const renderDroppable = (
    droppableId,
    list,
    title,
    useOverallRank = false
  ) => {
    // useOverallRank means we display the "OverallRank" or the "PositionRank"
    return (
      <Droppable droppableId={droppableId}>
        {(provided) => (
          <div
            className="player-list"
            ref={provided.innerRef}
            {...provided.droppableProps}
          >
            <h2>{title}</h2>
            {list.map((player, index) => {
              // Draggable ID must be string
              // We'll do `${player.OverallRank}-${player.Position}`
              // so we can parse out the rank in reorderInSublist
              const dragId = `${player.OverallRank}${
                droppableId === "all" ? "" : `-${player.Position}`
              }`;

              // If you want the user to see the rank in the UI
              const rankLabel = useOverallRank
                ? `#${player.OverallRank}`
                : `#${player.PositionRank}`;

              return (
                <Draggable key={dragId} draggableId={dragId} index={index}>
                  {(provided) => (
                    <div
                      className="player-item"
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      {...provided.dragHandleProps}
                    >
                      {rankLabel} {player.Name} - {player.Position} -{" "}
                      {player.Team}
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
  };

  return (
    <div className="create-rankings-container">
      <h1>Create Your Rankings</h1>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="lists-container">
          {/* The "ALL" list, sorted by OverallRank */}
          {renderDroppable("all", sortedAll, "ALL", true)}

          {/* QB list */}
          {renderDroppable("qb", qbPlayers, "QB")}

          {/* RB list */}
          {renderDroppable("rb", rbPlayers, "RB")}

          {/* WR list */}
          {renderDroppable("wr", wrPlayers, "WR")}

          {/* TE list */}
          {renderDroppable("te", tePlayers, "TE")}
        </div>
      </DragDropContext>
    </div>
  );
}

export default CreateRankings;

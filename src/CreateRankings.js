// CreateRankings.js
import React, { useState, useEffect, useCallback } from "react";
import Papa from "papaparse";

import { DragDropContext } from "react-beautiful-dnd";

// Import our new "droppable" PlayerList
import PlayerListDroppable from "./PlayerListDroppable";

import "./CreateRankings.css";

function CreateRankings({ csvData, csvFileName, useTierForOverall }) {
  const [allPlayers, setAllPlayers] = useState([]);

  // 1. Parse CSV from either csvData or csvFileName
  const handleStartWithCSV = useCallback(
    (csv) => {
      Papa.parse(csv, {
        header: true,
        skipEmptyLines: true,
        complete: (result) => {
          const hasOverallTier = result?.meta?.fields?.includes("OverallTier");
          let data = result.data;
          if (!hasOverallTier) {
            // Just always assign OverallTier yourself
            data = data.map((p, i) => ({
              ...p,
              OverallRank: i + 1,
              OverallTier: Math.floor(i / 12) + 1,
            }));
          } else {
            // If CSV has OverallTier, do nothing or parse OverallRank
            data = data.map((p, i) => ({
              ...p,
              OverallRank: parseInt(p["Overall Rank"] ?? i + 1, 10),
            }));
          }
          const finalAll = recalcPositionRanks(data);
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
            skipEmptyLines: true,
            complete: (result) => {
              let data = result.data;
              if (!useTierForOverall) {
                data = data.map((p, i) => ({
                  ...p,
                  OverallRank: i + 1,
                  OverallTier: Math.floor(i / 12) + 1,
                }));
              } else {
                data = data.map((p, i) => ({
                  ...p,
                  OverallRank: parseInt(p["Overall Rank"] ?? i + 1, 10),
                }));
              }
              const finalAll = recalcPositionRanks(data);
              setAllPlayers(finalAll);
            },
          });
        });
    },
    [useTierForOverall]
  );

  /**
   * Recalculate each player's PositionRank based on the order in allPlayers.
   * We assume allPlayers is sorted by OverallRank ascending (1..n).
   */
  function recalcPositionRanks(allPlayers) {
    let qbCount = 0,
      rbCount = 0,
      wrCount = 0,
      teCount = 0;

    return allPlayers.map((p) => {
      switch (p.Position) {
        case "QB":
          qbCount++;
          p.PositionRank = qbCount;
          p["Position Rank"] = qbCount.toString();
          break;
        case "RB":
          rbCount++;
          p.PositionRank = rbCount;
          p["Position Rank"] = rbCount.toString();
          break;
        case "WR":
          wrCount++;
          p.PositionRank = wrCount;
          p["Position Rank"] = wrCount.toString();
          break;
        case "TE":
          teCount++;
          p.PositionRank = teCount;
          p["Position Rank"] = teCount.toString();
          break;
        default:
          // If you have more positions, handle them here
          break;
      }
      return p;
    });
  }

  /**
   * Reorder an item in the "ALL" list by array indexes
   * then reassign OverallRank from top to bottom.
   */
  function reorderAll(allPlayers, oldIndex, newIndex, newTier) {
    //console.log("reorderAll", oldIndex, newIndex);
    const newArray = Array.from(allPlayers);
    const [removed] = newArray.splice(oldIndex, 1);
    //console.log("removed", removed);
    let closestPosTier = removed.Tier;
    //Calc if the player's position tier has changed
    if (oldIndex < newIndex) {
      for (let i = newIndex - 1; i > 0; i--) {
        //console.log("i", i, "newArray[i]", newArray[i]);
        if (removed.Position === newArray[i].Position) {
          //console.log("closestPosTier up", newArray[i]);
          closestPosTier = newArray[i].Tier;
          break;
        }
      }
    } else if (oldIndex > newIndex) {
      for (let i = newIndex; i < newArray.length; i++) {
        //console.log("i", i, "newArray[i]", newArray[i]);
        if (removed.Position === newArray[i].Position) {
          //console.log("closestPosTier down", newArray[i]);
          closestPosTier = newArray[i].Tier;
          break;
        }
      }
    }

    removed.OverallTier = newTier;
    removed.Tier = closestPosTier;
    newArray.splice(newIndex, 0, removed);
    // Reassign OverallRank in ascending order
    let qbCount = 0,
      rbCount = 0,
      wrCount = 0,
      teCount = 0;

    newArray.forEach((p, i) => {
      p.OverallRank = i + 1;
      p["Overall Rank"] = String(i + 1);
      // If you want overallTier:
      // p.OverallTier = Math.floor(i / 12) + 1;

      switch (p.Position) {
        case "QB":
          qbCount++;
          p.PositionRank = qbCount;
          p["Position Rank"] = String(qbCount);
          break;
        case "RB":
          rbCount++;
          p.PositionRank = rbCount;
          p["Position Rank"] = String(rbCount);
          break;
        case "WR":
          wrCount++;
          p.PositionRank = wrCount;
          p["Position Rank"] = String(wrCount);
          break;
        case "TE":
          teCount++;
          p.PositionRank = teCount;
          p["Position Rank"] = String(teCount);
          break;
        default:
        // ...
      }
    });

    return newArray;
  }

  /**
   * Reorder an item in a position sub-list (like WR #10 -> WR #7).
   * We find the oldIndex in the main array, find the target in the main array,
   * then splice, reassign OverallRank, recalc position ranks.
   */
  /**
   * reorderInSubList(allPlayers, draggableId, sourceIndex, destIndex, droppableId)
   *
   * - "sub-list" means the user is dragging in a position-based column (e.g. WR).
   * - We still operate on allPlayers (the global array).
   * - We find both the old and new “global” array indexes, do the splice, then recalc everything.
   */
  function reorderInSubList(
    allPlayers,
    draggableId,
    sourceIndex,
    destIndex,
    droppableId
  ) {
    console.log("reorderInSubList -> draggableId:", draggableId, {
      sourceIndex,
      destIndex,
      droppableId,
    });

    // 1) Identify the item being dragged by `OverallRank`
    const overallRankStr = draggableId.split("-")[0]; // e.g. "67"
    const overallRankNum = parseInt(overallRankStr, 10);

    const oldIndexInAll = allPlayers.findIndex(
      (p) => p.OverallRank === overallRankNum
    );
    if (oldIndexInAll === -1) {
      console.warn("Could not find item with OverallRank", overallRankNum);
      return allPlayers;
    }
    // 2) We need to figure out the new insertion index in the global array.
    //    We'll gather all players of that position, sort them by PositionRank,
    //    see which item is at `destIndex` in that sub-list, then get that item’s “global” index.

    const position = droppableId.split("-")[0]; // e.g. "WR"
    const newTier = droppableId.split("-")[2];

    const subList = allPlayers
      .filter((p) => p.Position === position)
      .sort((a, b) => a.PositionRank - b.PositionRank);
    const positionPlayers = allPlayers.filter((p) => p.Position === position);
    const groupedPosition = groupByTier(positionPlayers, position);
    console.log("groupedPosition", groupedPosition);
    const targetItem = groupedPosition[newTier][destIndex];
    console.log(
      "newTier",
      newTier,
      "destIndex",
      destIndex,
      "targetItem",
      targetItem
    );
    console.log("from overall rank", allPlayers[oldIndexInAll]);
    //const targetItem = subList[destIndex];
    console.log("targetItem", targetItem);
    if (!targetItem || targetItem.Name === allPlayers[oldIndexInAll].Name) {
      allPlayers[oldIndexInAll].Tier = newTier;
      console.warn("No item found at subList[destIndex] - maybe out of range?");
      return allPlayers;
    }

    // e.g. targetItem has OverallRank = 34
    const targetIndexInAll = allPlayers.findIndex(
      (p) => p.OverallRank === targetItem.OverallRank
    );

    console.log(
      "oldIndexInAll",
      oldIndexInAll,
      "targetIndexInAll",
      targetIndexInAll
    );
    if (targetIndexInAll === -1) {
      console.warn("Could not find targetItem in allPlayers");
      return allPlayers;
    }

    // 3) Copy the array, remove the dragged item
    const newAll = [...allPlayers];
    const [removed] = newAll.splice(oldIndexInAll, 1);
    console.log("removed", removed);

    // 4) Decide if we place above or below target
    const isMovingUp = targetItem.OverallRank < removed.OverallRank;
    let insertIndex = targetIndexInAll;
    if (!isMovingUp) {
      insertIndex = targetIndexInAll; // - 1;
    }

    if (removed.Tier !== newTier && !isMovingUp) {
      insertIndex -= 1;
      console.log("adjusting insertIndex -1", insertIndex);
    }

    console.log("newall", newAll);
    console.log("insertIndex", insertIndex);
    newAll.splice(insertIndex, 0, removed);
    removed.Tier = newTier;
    removed.OverallTier = targetItem.OverallTier;
    // 5) Now recalc OverallRank, OverallTier, PositionRank, etc.
    newAll.forEach((p, i) => {
      // i is 0-based; your overall rank is i+1
      p.OverallRank = i + 1;
      p["Overall Rank"] = String(i + 1);
      // If you want an overall tier by chunking 12 players per tier:
      //p.OverallTier = Math.floor(i / 12) + 1;
      // If you also have a separate position-based Tier,
      // you might call a separate recalcPositionTier or something similar here
    });

    // Finally, recalc the “PositionRank” for each position
    return recalcPositionRanks(newAll);
  }

  useEffect(() => {
    if (csvData) {
      handleStartWithCSV(csvData);
    } else if (csvFileName) {
      handleStartFile(csvFileName);
    }
  }, [csvData, csvFileName, handleStartWithCSV, handleStartFile]);

  function groupByTier(players, type) {
    const grouped = {};
    // Decide which property to use: OverallTier for "ALL", Tier for positions
    const tierProperty = type === "ALL" ? "OverallTier" : "Tier";

    players.forEach((player) => {
      const tierValue = player[tierProperty];
      // If the tierValue is null/undefined, you may want to handle that
      if (!grouped[tierValue]) {
        grouped[tierValue] = [];
      }
      grouped[tierValue].push(player);
    });

    return grouped;
  }

  // 2. onDragEnd handling
  const onDragEnd = (result) => {
    console.log("onDragEnd", result);
    const { source, destination, draggableId } = result;
    console.log("onDragEnd", result);
    if (!destination) return;

    if (
      destination.droppableId.split("-")[0] !== source.droppableId.split("-")[0]
    ) {
      console.log("block cross-list");
      // block cross-list
      return;
    }

    const sortedAll = [...allPlayers].sort(
      (a, b) => a.OverallRank - b.OverallRank
    );

    if (source.droppableId.split("-")[0] === "ALL") {
      // 1) Sort your array by OverallRank
      const oldTierStr = source.droppableId.split("-")[2]; // e.g. "2"
      const oldTier = parseInt(oldTierStr, 10);
      const newTierStr = destination.droppableId.split("-")[2]; // e.g. "2"
      const newTier = parseInt(newTierStr, 10);
      console.log("oldTier", oldTier, "newTier", newTier);
      // 3) Group them by tier so we can find the start index of "ALL-tier-n"
      const groupedAll = groupByTier(allPlayers, "ALL");
      console.log("grouped", groupedAll);
      // 4) The start index for tierN is the sum of lengths of all tiers < N
      let oldTierStart = 0;
      for (let t = 1; t < oldTier; t++) {
        oldTierStart += groupedAll[t]?.length || 0;
      }
      console.log("oldtierStart", oldTierStart);
      let newTierStart = 0;
      for (let t = 1; t < newTier; t++) {
        newTierStart += groupedAll[t]?.length || 0;
      }
      console.log("newtierStart", newTierStart);

      let tierAdjustment = 1;
      if (oldTier === newTier || oldTierStart > newTierStart) {
        tierAdjustment = 0;
      }
      // 5) The final insertion index is tierStart + destination.index
      const actualRemoveIndex = oldTierStart + source.index;
      const actualInsertIndex =
        newTierStart - tierAdjustment + destination.index;

      console.log(
        "actualRemoveIndex",
        actualRemoveIndex,
        "actualInsertIndex",
        actualInsertIndex
      );
      // 2) Figure out which tier the user is dropping from and into

      // 6) Reorder the array using that global index
      const newAll = reorderAll(
        sortedAll,
        actualRemoveIndex, // the old position
        actualInsertIndex, // the new position (in the entire array)
        newTier // if you want to reassign OverallTier
      );
      setAllPlayers(newAll);
    } else {
      const newAll = reorderInSubList(
        sortedAll,
        draggableId,
        source.index, // the old position
        destination.index, // the new position (in the entire array)
        destination.droppableId
      );
      setAllPlayers(newAll);
    }
  };

  // 3. Building out columns
  //    Each column is a "PlayerListDroppable" that organizes data by Tiers.
  //    We'll pass "ALL" players if it's the "ALL" column, or a filtered set if it's "QB", etc.

  // For "ALL," let's pass them sorted by OverallRank
  const sortedAll = [...allPlayers].sort(
    (a, b) => a.OverallRank - b.OverallRank
  );

  // For each position, we'll still do the normal filter + sort by PositionRank
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

  function handleExport() {
    // 1) Define the CSV header
    const headers = [
      "Overall Rank",
      "Name",
      "Position",
      "Team",
      "Bye",
      "Position Rank",
      "Tier",
      "OverallTier",
    ];
    let csvContent = headers.join(",") + "\n";

    // 2) Build the CSV rows
    // Make sure each field is included in your allPlayers
    // If "Tier" is stored as `player.Tier` or `player["Tier"]`, match that exactly.
    allPlayers.forEach((player) => {
      const row = [
        player["Overall Rank"], // or player.OverallRank
        player.Name,
        player.Position,
        player.Team,
        player.Bye,
        player["Position Rank"], // or player.PositionRank
        player.Tier || "", // might be player["Tier"]
        player.OverallTier || "",
      ];

      csvContent += row.join(",") + "\n";
    });

    // 3) Create a blob and trigger a download
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    // 4) Create a temporary link, click it, then remove it
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "rankings.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <div className="create-rankings-container">
      <h1>Create Your Rankings</h1>

      <button className="modern-button" onClick={handleExport}>
        Export Rankings
      </button>

      <DragDropContext onDragEnd={onDragEnd}>
        <div
          className="lists-container"
          style={{ display: "flex", gap: "20px" }}
        >
          {/* 1) ALL column, grouping by "OverallTier" (or "Tier") */}
          <PlayerListDroppable
            title="ALL"
            players={sortedAll} // or allPlayers if you prefer
            groupBy="OverallTier" // or "Tier"
          />

          {/* 2) QB column, grouping by Tier or OverallTier */}
          <PlayerListDroppable
            title="QB"
            players={qbPlayers}
            groupBy="Tier" // or "OverallTier"
          />

          {/* 3) RB column */}
          <PlayerListDroppable title="RB" players={rbPlayers} groupBy="Tier" />

          {/* 4) WR column */}
          <PlayerListDroppable title="WR" players={wrPlayers} groupBy="Tier" />

          {/* 5) TE column */}
          <PlayerListDroppable title="TE" players={tePlayers} groupBy="Tier" />
        </div>
      </DragDropContext>
    </div>
  );
}

export default CreateRankings;

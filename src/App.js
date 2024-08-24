import React, { useState, useEffect } from "react";
import Papa from "papaparse";
import PlayerList from "./PlayerList";
import StartPage from "./StartPage";
import "./App.css";

function App() {
  const [players, setPlayers] = useState([]);
  const [draftId, setDraftId] = useState("");
  const [draftName, setDraftName] = useState("New Draft");
  const [removedPlayers, setRemovedPlayers] = useState(new Set());
  const [showStartPage, setShowStartPage] = useState(true);
  const [useTierForOverall, setUseTierForOverall] = useState(false);

  // New state for reloading functionality
  const [autoReload, setAutoReload] = useState(false);
  const [reloadInterval, setReloadInterval] = useState(30); // Default 30 seconds
  const [isFlashing, setIsFlashing] = useState(false); // State for flash text

  const handleStartWithCSV = (csvData) => {
    Papa.parse(csvData, {
      header: true,
      complete: (result) => {
        let playersData = result.data;
        console.log("useTierForOverall", useTierForOverall);
        if (!useTierForOverall) {
          playersData = playersData.map((player, index) => {
            return { ...player, OverallTier: Math.floor(index / 10) + 1 };
          });
        }
        setPlayers(playersData);
        setShowStartPage(false);
      },
    });
  };
  const fixTeamNames = (team) => {
    switch (team) {
      case "WAS":
        return "WSH";
      case "JAX":
        return "JAC";
      default:
        return team;
    }
  };
  const handleFetchDraftData = async () => {
    try {
      const response = await fetch(
        `https://api.sleeper.app/v1/draft/${draftId}/picks`
      );
      const data = await response.json();

      const playersToRemove = new Set();

      data.forEach((pick) => {
        const fetchedLastName = pick.metadata.last_name;
        let fetchedTeam = pick.metadata.team;
        fetchedTeam = fixTeamNames(fetchedTeam);
        const fetchedPosition = pick.metadata.position;

        players.forEach((player) => {
          const csvFullName = player.Name;
          const csvTeam = player.Team;
          const csvPosition = player.Position;

          if (
            csvFullName &&
            csvFullName.includes(fetchedLastName) &&
            fetchedTeam === csvTeam &&
            fetchedPosition === csvPosition
          ) {
            playersToRemove.add(csvFullName);
          }
        });
      });

      const responseLeague = await fetch(
        `https://api.sleeper.app/v1/draft/${draftId}`
      );
      const dataLeague = await responseLeague.json();
      setDraftName(dataLeague.metadata.name);

      setRemovedPlayers(playersToRemove);
      // Trigger the flash animation
      setIsFlashing(true);
      setTimeout(() => setIsFlashing(false), 700); // 0.5 second flash
    } catch (error) {
      console.error("Error fetching draft data:", error);
    }
  };

  const handleStartDefault = (useTierForOverall) => {
    fetch("/myranks.csv")
      .then((response) => response.text())
      .then((csvData) => {
        Papa.parse(csvData, {
          header: true,
          complete: (result) => {
            let playersData = result.data;
            if (useTierForOverall) {
              playersData = playersData.map((player, index) => {
                return { ...player, OverallTier: Math.floor(index / 10) + 1 };
              });
            }
            setPlayers(playersData);
            setShowStartPage(false);
          },
        });
      });
  };

  useEffect(() => {
    if (autoReload) {
      const interval = setInterval(handleFetchDraftData, reloadInterval * 1000);
      return () => clearInterval(interval);
    }
  }, [autoReload, reloadInterval]);

  return (
    <div className="app">
      {showStartPage ? (
        <StartPage
          onStartWithCSV={handleStartWithCSV}
          onStartDefault={handleStartDefault}
          useTierForOverall={useTierForOverall}
          setUseTierForOverall={setUseTierForOverall}
        />
      ) : (
        <div>
          <h1>{draftName}</h1>
          <div className="input-container">
            <input
              type="text"
              value={draftId}
              onChange={(e) => setDraftId(e.target.value)}
              placeholder="Enter Draft ID"
            />
            <button onClick={handleFetchDraftData}>Fetch Draft Results</button>
          </div>

          <div className="reload-container">
            <input
              type="checkbox"
              id="auto-reload-checkbox"
              checked={autoReload}
              onChange={() => setAutoReload(!autoReload)}
            />
            <label htmlFor="auto-reload-checkbox">Enable Auto Reload</label>

            <input
              type="number"
              value={reloadInterval}
              onChange={(e) => setReloadInterval(e.target.value)}
              className="reload-interval-input"
            />
            <label>seconds</label>
            {isFlashing && <span className="flash-text">Refreshed</span>}
          </div>

          <div className="lists-container">
            <PlayerList
              title="ALL"
              players={players}
              groupBy="OverallTier"
              removedPlayers={removedPlayers}
            />
            <PlayerList
              title="QB"
              players={players.filter((p) => p.Position === "QB")}
              groupBy="Tier"
              removedPlayers={removedPlayers}
            />
            <PlayerList
              title="RB"
              players={players.filter((p) => p.Position === "RB")}
              groupBy="Tier"
              removedPlayers={removedPlayers}
            />
            <PlayerList
              title="WR"
              players={players.filter((p) => p.Position === "WR")}
              groupBy="Tier"
              removedPlayers={removedPlayers}
            />
            <PlayerList
              title="TE"
              players={players.filter((p) => p.Position === "TE")}
              groupBy="Tier"
              removedPlayers={removedPlayers}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default App;

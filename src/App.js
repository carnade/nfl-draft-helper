import React, { useState, useEffect, useCallback } from "react";
import Papa from "papaparse";
import PlayerList from "./PlayerList";
import StartPage from "./StartPage";
import "./App.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faRecycle } from "@fortawesome/free-solid-svg-icons";

function App() {
  const [players, setPlayers] = useState([]);
  const [draftId, setDraftId] = useState("");
  const [draftName, setDraftName] = useState("New Draft");
  const [removedPlayers, setRemovedPlayers] = useState(new Set());
  const [showStartPage, setShowStartPage] = useState(true);
  const [useTierForOverall, setUseTierForOverall] = useState(false);
  const [initialPlayers, setInitialPlayers] = useState([]); // Store initial state
  const [keepEmptyTiers, setKeepEmptyTiers] = useState(false);

  // New state for reloading functionality
  const [autoReload, setAutoReload] = useState(false);
  const [reloadInterval, setReloadInterval] = useState(30); // Default 30 seconds
  const [setIsFlashing] = useState(false); // State for flash text

  const handleStartWithCSV = (csvData) => {
    Papa.parse(csvData, {
      header: true,
      complete: (result) => {
        let playersData = result.data;
        if (!useTierForOverall) {
          playersData = playersData.map((player, index) => {
            return { ...player, OverallTier: Math.floor(index / 10) + 1 };
          });
        }
        setPlayers(playersData);
        setInitialPlayers(playersData); // Store the initial player data
        setShowStartPage(false);
      },
    });
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
            setInitialPlayers(playersData); // Store the initial player data
            setShowStartPage(false);
          },
        });
      });
  };

  // Frontend validation for the reload interval
  const handleReloadIntervalChange = (e) => {
    const value = parseInt(e.target.value, 10);
    if (value >= 10) {
      setReloadInterval(value);
    } else {
      alert("Auto-refresh interval cannot be less than 10 seconds.");
    }
  };

  const handleResetDraft = () => {
    setPlayers(initialPlayers); // Reset players to initial state
    setRemovedPlayers(new Set()); // Clear the removed players set
  };

  const handleFetchDraftData = useCallback(async () => {
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
      setPlayers((prevPlayers) =>
        prevPlayers.filter((player) => !playersToRemove.has(player.Name))
      );
      // Trigger the flash animation
      setIsFlashing(true);
      setTimeout(() => setIsFlashing(false), 700); // 0.5 second flash
    } catch (error) {
      console.error("Error fetching draft data:", error);
    }
  }, [draftId, players, setIsFlashing]);

  useEffect(() => {
    if (autoReload) {
      const interval = setInterval(handleFetchDraftData, reloadInterval * 1000);
      return () => clearInterval(interval);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoReload, reloadInterval, handleFetchDraftData]);

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
            <button onClick={handleResetDraft}>
              <FontAwesomeIcon icon={faRecycle} /> Reset Draft
            </button>
            <input
              type="checkbox"
              checked={autoReload}
              onChange={() => setAutoReload(!autoReload)}
            />
            <label htmlFor="autoReload">Auto-Reload</label>
            <select
              value={reloadInterval}
              onChange={handleReloadIntervalChange}
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={30}>30</option>
              <option value={40}>40</option>
              <option value={50}>50</option>
              <option value={60}>60</option>
            </select>
            <input
              type="checkbox"
              checked={keepEmptyTiers}
              onChange={() => setKeepEmptyTiers(!keepEmptyTiers)}
            />
            <label htmlFor="autoReload">Keep empty tiers</label>
          </div>

          {/*    <div className="reload-container">
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
              onChange={handleReloadIntervalChange}
              className="reload-interval-input"
            />
            <label>seconds</label>
            {isFlashing && <span className="flash-text">Refreshed</span>}
          </div>*/}

          <div className="lists-container">
            <PlayerList
              title="ALL"
              players={players}
              groupBy="OverallTier"
              removedPlayers={removedPlayers}
              setPlayers={setPlayers}
              setRemovedPlayers={setRemovedPlayers}
              keepEmptyTiers={keepEmptyTiers}
            />
            <PlayerList
              title="QB"
              players={players.filter((p) => p.Position === "QB")}
              groupBy="Tier"
              removedPlayers={removedPlayers}
              setPlayers={setPlayers}
              setRemovedPlayers={setRemovedPlayers}
              keepEmptyTiers={keepEmptyTiers}
            />
            <PlayerList
              title="RB"
              players={players.filter((p) => p.Position === "RB")}
              groupBy="Tier"
              removedPlayers={removedPlayers}
              setPlayers={setPlayers}
              setRemovedPlayers={setRemovedPlayers}
              keepEmptyTiers={keepEmptyTiers}
            />
            <PlayerList
              title="WR"
              players={players.filter((p) => p.Position === "WR")}
              groupBy="Tier"
              removedPlayers={removedPlayers}
              setPlayers={setPlayers}
              setRemovedPlayers={setRemovedPlayers}
              keepEmptyTiers={keepEmptyTiers}
            />
            <PlayerList
              title="TE"
              players={players.filter((p) => p.Position === "TE")}
              groupBy="Tier"
              removedPlayers={removedPlayers}
              setPlayers={setPlayers}
              setRemovedPlayers={setRemovedPlayers}
              keepEmptyTiers={keepEmptyTiers}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default App;

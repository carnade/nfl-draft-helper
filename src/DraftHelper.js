import React, { useState, useEffect, useCallback } from "react";
import PlayerList from "./PlayerList";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faRecycle } from "@fortawesome/free-solid-svg-icons";
import Papa from "papaparse";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import "./DraftHelper.css";

function DraftHelper({ csvData, csvFileName, useTierForOverall }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { draftId: routeDraftId } = useParams();

  // If user navigated from DraftList with `state={{ scoringType: ... }}`
  const scoringType = location.state?.scoringType;

  // Basic local states
  const [players, setPlayers] = useState([]);
  const [initialPlayers, setInitialPlayers] = useState([]);
  const [draftName, setDraftName] = useState("New Draft");
  const [removedPlayers, setRemovedPlayers] = useState(new Set());
  const [keepEmptyTiers, setKeepEmptyTiers] = useState(false);
  const [autoReload, setAutoReload] = useState(false);
  const [reloadInterval, setReloadInterval] = useState(30);
  const [isFlashing, setIsFlashing] = useState(false);

  // This is the final draft ID we use.
  // If routeDraftId is present, we’ll eventually set it.
  const [draftId, setDraftId] = useState("");
  // Track if CSV is loaded
  const [csvLoaded, setCsvLoaded] = useState(false);

  // 1) If there's a :draftId param, set local draftId, but do NOT fetch yet
  useEffect(() => {
    if (routeDraftId) {
      console.log("routeDraftId found =>", routeDraftId);
      setDraftId(routeDraftId);
    }
  }, [routeDraftId]);

  // 2) Parse CSV from either raw data or a local file path
  const handleStartWithCSV = useCallback(
    (csvString) => {
      return new Promise((resolve) => {
        Papa.parse(csvString, {
          header: true,
          complete: (result) => {
            let playersData = result.data;
            if (!useTierForOverall) {
              playersData = playersData.map((player, index) => ({
                ...player,
                OverallTier: Math.floor(index / 12) + 1,
              }));
            }
            setPlayers(playersData);
            setInitialPlayers(playersData);
            resolve(); // let caller know we're done
          },
        });
      });
    },
    [useTierForOverall]
  );

  const handleStartFile = useCallback(
    (fileName) => {
      const absolutePath = `/${fileName}`;
      return fetch(absolutePath)
        .then((response) => response.text())
        .then((csvString) => handleStartWithCSV(csvString));
    },
    [handleStartWithCSV]
  );

  // Helper for default file based on scoring type
  const getDefaultFile = (type) => {
    switch (type) {
      case "dynasty_2qb":
        return "dynasty_sf_adp.csv";
      case "ppr":
        return "redraft_ppr_adp.csv";
      case "2qb":
        return "redraft_sf_adp.csv";
      case "half-ppr":
      case "half_ppr":
        return "redraft_half_ppr_adp.csv";
      default:
        return "dynasty_sf_adp.csv";
    }
  };

  // 3) On mount or changes, load CSV (once) and set `csvLoaded = true` afterwards
  useEffect(() => {
    async function loadCSV() {
      console.log("csvData:", csvData, "csvFileName:", csvFileName);

      if (csvData) {
        // Raw CSV content already provided
        await handleStartWithCSV(csvData);
      } else {
        // localFileName from prop or scoringType
        let localFileName = csvFileName;

        if (scoringType) {
          localFileName = getDefaultFile(scoringType);
        }
        console.log("Using localFileName:", localFileName);

        if (localFileName) {
          await handleStartFile(localFileName);
        } else {
          console.log("No CSV file + no scoring type => no CSV to load");
        }
      }
      // Mark CSV as loaded
      setCsvLoaded(true);
    }

    loadCSV();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [csvData, csvFileName, scoringType]);

  // 4) Once CSV is loaded, if we have routeDraftId => fetch picks to remove them
  useEffect(() => {
    if (csvLoaded && routeDraftId) {
      console.log("CSV loaded & routeDraftId => auto fetch draft picks");
      handleFetchDraftData(routeDraftId);
    }
  }, [csvLoaded, routeDraftId]);

  // 5) Manual fetch or auto reload uses final `draftId` from state
  const handleFetchDraftData = useCallback(
    async (overrideId) => {
      const finalId = overrideId || draftId;
      if (!finalId) {
        console.log("No draft ID to fetch");
        return;
      }
      console.log("Fetching draft data for:", finalId);

      try {
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

        // 1) picks
        const picksResponse = await fetch(
          `https://api.sleeper.app/v1/draft/${finalId}/picks`
        );
        const picksData = await picksResponse.json();

        const playersToRemove = new Set();
        picksData.forEach((pick) => {
          const fetchedLastName = pick.metadata.last_name;
          let fetchedTeam = fixTeamNames(pick.metadata.team);
          const fetchedPosition = pick.metadata.position;

          players.forEach((player) => {
            if (
              player.Name?.includes(fetchedLastName) &&
              player.Team === fetchedTeam &&
              player.Position === fetchedPosition
            ) {
              playersToRemove.add(player.Name);
            }
          });
        });

        // 2) league data
        const leagueResponse = await fetch(
          `https://api.sleeper.app/v1/draft/${finalId}`
        );
        const leagueData = await leagueResponse.json();

        setDraftName(leagueData.metadata.name);

        // remove drafted players
        setRemovedPlayers(playersToRemove);
        setPlayers((prevPlayers) =>
          prevPlayers.filter((p) => !playersToRemove.has(p.Name))
        );

        // Indicate "Refreshed"
        setIsFlashing(true);
        setTimeout(() => setIsFlashing(false), 700);
      } catch (error) {
        console.error("Error fetching draft data:", error);
      }
    },
    [draftId, players]
  );

  // 6) autoReload effect
  useEffect(() => {
    if (autoReload) {
      const interval = setInterval(
        () => handleFetchDraftData(),
        reloadInterval * 1000
      );
      return () => clearInterval(interval);
    }
  }, [autoReload, reloadInterval, handleFetchDraftData]);

  // UI callbacks
  const handleResetDraft = () => {
    setPlayers(initialPlayers);
    setRemovedPlayers(new Set());
  };

  const handleReloadIntervalChange = (e) => {
    const val = parseInt(e.target.value, 10);
    if (val >= 10) setReloadInterval(val);
    else alert("Auto-refresh interval cannot be less than 10 seconds.");
  };

  return (
    <div>
      <div className="draftname">
        <h1>{draftName}</h1>
      </div>

      <div className="input-container">
        <input
          type="text"
          value={draftId}
          onChange={(e) => setDraftId(e.target.value)}
          placeholder="Enter Draft ID"
        />
        {/* Manual fetch if user typed a draftID */}
        <button onClick={() => handleFetchDraftData()}>
          Fetch Draft Results
        </button>
        <button onClick={handleResetDraft}>
          <FontAwesomeIcon icon={faRecycle} /> Reset Draft
        </button>

        <input
          type="checkbox"
          checked={autoReload}
          onChange={() => setAutoReload(!autoReload)}
        />
        <label>Auto-Reload</label>

        <select value={reloadInterval} onChange={handleReloadIntervalChange}>
          <option value={10}>10</option>
          <option value={20}>20</option>
          <option value={30}>30</option>
          <option value={40}>40</option>
          <option value={50}>50</option>
          <option value={60}>60</option>
        </select>
        <label>seconds</label>
        {isFlashing && <span className="flash-text">Refreshed</span>}

        <input
          type="checkbox"
          checked={keepEmptyTiers}
          onChange={() => setKeepEmptyTiers(!keepEmptyTiers)}
        />
        <label>Keep empty tiers</label>
      </div>

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
  );
}

export default DraftHelper;

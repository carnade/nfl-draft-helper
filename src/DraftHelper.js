import React, { useState, useEffect, useCallback } from "react";
import PlayerList from "./PlayerList";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faRecycle,
  faExternalLinkAlt,
} from "@fortawesome/free-solid-svg-icons";
import Papa from "papaparse";
import { useLocation, useParams } from "react-router-dom";
import "./DraftHelper.css";

// Add a mock flag
const mock = false; // Set to true for localhost, false for production

// Define the base URL based on the mock flag
const BASE_URL = mock
  ? "http://localhost:5000"
  : "https://shaggy-latashia-carnade-2ea2054a.koyeb.app";

function DraftHelper({ csvData, csvFileName }) {
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
  const [showPtsMode, setShowPtsMode] = useState(false); // Toggle between pts/g and dynasty rankings
  const [showPortfolio, setShowPortfolio] = useState(true); // Toggle to show/hide portfolio count

  // The final "draftId" we use (either from route or user input)
  const [draftId, setDraftId] = useState("");

  /**
   * parseCsvAndCheckTier(csvString):
   *  - parse CSV with Papa
   *  - if no "OverallTier" column, assign it ourselves
   */
  const parseCsvAndCheckTier = useCallback((csvString) => {
    return new Promise((resolve) => {
      Papa.parse(csvString, {
        header: true,
        skipEmptyLines: true,
        complete: (result) => {
          console.log("reult:", result);
          let playersData = result.data;
          // Check if the data has ANY row with a "OverallTier" property
          // e.g. if playersData[0] has "OverallTier" or if result.meta.fields includes "OverallTier"
          const hasOverallTier = result?.meta?.fields?.includes("OverallTier");

          if (!hasOverallTier) {
            console.log(
              "No OverallTier column found -> assigning it ourselves"
            );
            playersData = playersData.map((player, index) => ({
              ...player,
              OverallTier: Math.floor(index / 12) + 1,
            }));
          } else {
            console.log("CSV already has OverallTier column -> using it as-is");
          }
          resolve(playersData);
        },
      });
    });
  }, []);

  /**
   * fetchCsvFile - fetch a local file from server, return its text
   */
  const fetchCsvFile = useCallback(async (fileName) => {
    const absolutePath = `/${fileName}`;
    const response = await fetch(absolutePath);
    const csvString = await response.text();
    return csvString;
  }, []);

  /**
   * removePickedPlayers - fetch Sleeper picks for `draftIdParam`,
   * remove from the given array "playersArr"
   */
  const removePickedPlayers = useCallback(async (draftIdParam, playersArr) => {
    console.log("removePickedPlayers for draftId=", draftIdParam);
    try {
      const picksResp = await fetch(
        `https://api.sleeper.app/v1/draft/${draftIdParam}/picks`,
        {
          cache: 'no-store' // Prevent browser caching
        }
      );
      const picksData = await picksResp.json();

      const fixTeamNames = (team) => {
        switch (team) {
          case "WAS":
            return "WAS";
          case "JAX":
            return "JAX";
          default:
            return team;
        }
      };

      const playersToRemove = new Set();
      picksData.forEach((pick) => {
        const fetchedLastName = pick.metadata.last_name;

        let fetchedTeam = fixTeamNames(pick.metadata.team);
        const fetchedPosition = pick.metadata.position;

        for (const p of playersArr) {
          if (
            p.Name?.includes(fetchedLastName) &&
            p.Team === fetchedTeam &&
            p.Position === fetchedPosition
          ) {
            playersToRemove.add(p.Name);
          }
        }
      });

      console.log("Players to remove:", playersToRemove);
      setRemovedPlayers(playersToRemove);

      const filteredArr = playersArr.filter(
        (p) => !playersToRemove.has(p.Name)
      );

      // Also fetch league data for the draftName
      const leagueResp = await fetch(
        `https://api.sleeper.app/v1/draft/${draftIdParam}`,
        {
          cache: 'no-store' // Prevent browser caching
        }
      );
      const leagueData = await leagueResp.json();
      if (leagueData && leagueData.metadata) {
        setDraftName(leagueData.metadata.name || "Unknown Draft");
      }

      // Indicate "Refreshed"
      setIsFlashing(true);
      setTimeout(() => setIsFlashing(false), 700);

      return filteredArr;
    } catch (err) {
      console.error("Error removing picks:", err);
      return playersArr; // fallback, don't remove anything
    }
  }, []);

  // map scoringType -> localStorage key
  function mapScoringType(scoring) {
    console.log("mapScoringType:", scoring);
    /*    switch (scoring) {
      case "dynasty_2qb":
        return "2qbdata";
      case "dynasty_ppr":
        return "1qbdata";
      case "dynasty_half_ppr":
        return "1qbdata";
      case "ppr":
        return "1qbdata";
      case "2qb":
        return "2qbdata";
      case "half_ppr":
        return "1qbdata";
      default:
        return "dynasty_sf";
    }*/

    switch (scoring) {
      case "dynasty_2qb":
        return "dynasty_sf";
      case "dynasty_ppr":
        return "dynasty_ppr";
      case "dynasty_half_ppr":
        return "dynasty_half_ppr";
      case "ppr":
        return "redraft_ppr";
      case "2qb":
        return "redraft_sf";
      case "half_ppr":
        return "redraft_half_ppr";
      default:
        return "dynasty_sf";
    }
  }

  // fallback for "default" files if userName => "default"
  function getDefaultFile(type) {
    switch (type) {
      case "dynasty_2qb":
        return "adp_dynasty_2qb.csv";
      case "dynasty_ppr":
        return "adp_dynasty_ppr.csv";
      case "dynasty_half-ppr":
        return "adp_dynasty_half_ppr.csv";
      case "ppr":
        return "adp_ppr.csv";
      case "2qb":
        return "adp_2qb.csv";
      case "half_ppr":
        return "adp_half_ppr.csv";
      default:
        return "adp_dynasty_2qb.csv";
    }
  }

  // If user types a draftID or autoReload triggers, remove picks from current players
  const handleFetchDraftData = useCallback(async () => {
    if (!draftId) {
      console.log("No draft ID to fetch");
      return;
    }
    console.log("Manual fetch draft data for:", draftId);

    // We'll remove picks from the current players
    setPlayers((prev) => {
      removePickedPlayers(draftId, prev).then((filteredArr) => {
        setPlayers(filteredArr);
      });
      return prev; // immediate return, updated in .then
    });
  }, [draftId, removePickedPlayers]);

  // autoReload effect
  useEffect(() => {
    if (autoReload) {
      const interval = setInterval(handleFetchDraftData, reloadInterval * 1000);
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

  // 1) If there's a :draftId param, store it in `draftId`
  useEffect(() => {
    if (routeDraftId) {
      console.log("routeDraftId found =>", routeDraftId);
      setDraftId(routeDraftId);
    }
  }, [routeDraftId]);

  // -- CSV & picks loading in one effect --
  useEffect(() => {
    async function loadCsvAndRemovePicks() {
      console.log("DraftHelper: loadCSV triggered");
      console.log("csvData:", csvData, "csvFileName:", csvFileName);

      // Step A) Figure out which CSV data we’ll parse
      let finalCsvContent = null; // raw CSV text to parse

      if (csvData) {
        console.log("Using direct CSV data");
        finalCsvContent = csvData;
      } else {
        let usedCustomData = false;
        let localFileName = csvFileName || "";

        const settingsStr = localStorage.getItem("FantasyHelperSettings");
        if (scoringType && settingsStr) {
          const parsed = JSON.parse(settingsStr);
          const dr = parsed.defaultRankings || {};

          const localStorageKey = mapScoringType(scoringType);
          const customFileEntry = dr[localStorageKey];
          if (customFileEntry && customFileEntry.name !== "default") {
            if (customFileEntry.data) {
              finalCsvContent = customFileEntry.data;
              usedCustomData = true;
            }
          }
        }

        if (!usedCustomData) {
          if (!localFileName && scoringType) {
            localFileName = getDefaultFile(scoringType);
          }
          if (localFileName) {
            finalCsvContent = await fetchCsvFile(localFileName);
          }
        }
      }

      // Step B) Parse CSV if we have any
      let parsedPlayers = [];
      if (finalCsvContent) {
        parsedPlayers = await parseCsvAndCheckTier(finalCsvContent);
      }

      // Step C) Remove picks from Sleeper if we have a routeDraftId
      let finalPlayers = parsedPlayers;
      if (routeDraftId && finalPlayers.length > 0) {
        finalPlayers = await removePickedPlayers(routeDraftId, finalPlayers);
      }

      // Step D) Add BestBallTotal, pts_ppr, and pts_half_ppr fields to each player
      const savedPortfolioData = JSON.parse(
        localStorage.getItem("FantasyHelperBestballPortfolio")
      );

      if (savedPortfolioData) {
        console.log("Loaded bestball portfolio data:", savedPortfolioData);

        // Create a mapping of player names to their portfolio data
        const portfolioMap = savedPortfolioData.reduce((acc, player) => {
          acc[player.name] = {
            count: player.totalCount || 0,
            pts_ppr: player.pts_ppr || null,
            pts_half_ppr: player.pts_half_ppr || null,
          };
          return acc;
        }, {});

        // Add BestBallTotal, pts_ppr, and pts_half_ppr to each player in finalPlayers
        finalPlayers = finalPlayers.map((player) => ({
          ...player,
          BestBallTotal: portfolioMap[player.Name]?.count || 0, // Default to 0 if no match
          pts_ppr: portfolioMap[player.Name]?.pts_ppr || null,
          pts_half_ppr: portfolioMap[player.Name]?.pts_half_ppr || null,
        }));
      } else {
        console.log("No bestball portfolio data found in localStorage.");
        // Add BestBallTotal as 0 and pts fields as null for all players if no portfolio data is found
        finalPlayers = finalPlayers.map((player) => ({
          ...player,
          BestBallTotal: 0,
          pts_ppr: null,
          pts_half_ppr: null,
        }));
      }
      console.log("scoringType:", scoringType);
      // Always fetch KTC/FC values so they're available when user toggles display mode
      try {
        const playerIds = finalPlayers.map((player) => player.SleeperId).filter(Boolean); // Collect SleeperIds, filter out falsy values
        
        // Create cache key from sorted playerIds
        const cacheKey = `playerData_${playerIds.sort().join(',')}`;
        const cacheTimestampKey = `${cacheKey}_timestamp`;
        const cacheExpiry = 60 * 60 * 1000; // 1 hour in milliseconds
        
        // Check cache first
        let externalPlayers = null;
        const cachedData = sessionStorage.getItem(cacheKey);
        const cachedTimestamp = sessionStorage.getItem(cacheTimestampKey);
        const now = Date.now();
        
        if (cachedData && cachedTimestamp && (now - parseInt(cachedTimestamp)) < cacheExpiry) {
          try {
            externalPlayers = JSON.parse(cachedData);
            console.log("Using cached player data");
          } catch (e) {
            console.warn("Failed to parse cached player data", e);
          }
        }
        
        // Fetch if not cached or cache expired
        if (!externalPlayers) {
          const response = await fetch(`${BASE_URL}/getplayers/data`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ playerlist: playerIds }), // Send playerIds in the body
          });

          externalPlayers = await response.json();
          console.log("API Response:", externalPlayers); // Log the response
          
          // Cache the response
          try {
            sessionStorage.setItem(cacheKey, JSON.stringify(externalPlayers));
            sessionStorage.setItem(cacheTimestampKey, now.toString());
          } catch (e) {
            console.warn("Failed to cache player data", e);
          }
        }

        // Map externalPlayers data to finalPlayers based on SleeperId
        finalPlayers = finalPlayers.map((player) => {
          const externalPlayer = externalPlayers[player.SleeperId]; // Access by SleeperId
          return externalPlayer
            ? {
                ...player,
                "FC Value": externalPlayer["FC Value"] || "N/A",
                "KTC Value": externalPlayer["KTC Value"] || "N/A",
                gp: externalPlayer.gp || null, // Extract games played for pts/g calculation
                // Use API data for pts_ppr/pts_half_ppr as it's more reliable (overrides portfolio if present)
                pts_ppr: externalPlayer.pts_ppr !== undefined && externalPlayer.pts_ppr !== null 
                  ? externalPlayer.pts_ppr 
                  : player.pts_ppr, // Fallback to portfolio data if API doesn't have it
                pts_half_ppr: externalPlayer.pts_half_ppr !== undefined && externalPlayer.pts_half_ppr !== null
                  ? externalPlayer.pts_half_ppr
                  : player.pts_half_ppr, // Fallback to portfolio data if API doesn't have it
              } // Merge external data with existing player
            : player; // Keep the original player if no match is found
        });
      } catch (error) {
        console.error("Error fetching external players:", error);
      }

      console.log("Final players with BestBallTotal:", finalPlayers);
      // Step E) Store finalPlayers into state
      setPlayers(finalPlayers);
      setInitialPlayers(finalPlayers);
    }

    loadCsvAndRemovePicks();
  }, [
    csvData,
    csvFileName,
    scoringType,
    routeDraftId,
    fetchCsvFile,
    parseCsvAndCheckTier,
    removePickedPlayers,
  ]);

  return (
    <div>
      <div className="draftname">
        <h1>{draftName}</h1>
      </div>

      {/* 
        Wrap your inputs in "base-container" or similar, or individually
        give them modern classes:
      */}
      <div className="base-container">
        <div className="draft-id-container">
          <input
            type="text"
            className="modern-input"
            value={draftId}
            onChange={(e) => setDraftId(e.target.value)}
            placeholder="Enter Draft ID"
          />
          {draftId && (
            <a
              href={`https://sleeper.app/draft/nfl/${draftId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="modern-button"
            >
              <FontAwesomeIcon icon={faExternalLinkAlt} />
            </a>
          )}
        </div>
        <button onClick={handleFetchDraftData} className="modern-button">
          Fetch Draft Results
        </button>
        <button onClick={handleResetDraft} className="modern-button">
          <FontAwesomeIcon icon={faRecycle} /> Reset Draft
        </button>

        {/* For the auto-reload checkbox, you can optionally style it, 
            or just keep the default. A basic approach: */}
        <label className="modern-checkbox">
          <input
            type="checkbox"
            checked={autoReload}
            onChange={() => setAutoReload(!autoReload)}
          />
          <span>Auto-Reload</span>
        </label>

        <select
          className="modern-dropdown"
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
        <label>seconds</label>

        {isFlashing && <span className="flash-text">Refreshed</span>}

        <label className="modern-checkbox">
          <input
            type="checkbox"
            checked={keepEmptyTiers}
            onChange={() => setKeepEmptyTiers(!keepEmptyTiers)}
          />
          <span>Keep empty tiers</span>
        </label>

        <label className="modern-checkbox">
          <input
            type="checkbox"
            checked={showPtsMode}
            onChange={() => setShowPtsMode(!showPtsMode)}
          />
          <span>Show Pts/g (Redraft)</span>
        </label>

        {showPtsMode && (
          <label className="modern-checkbox">
            <input
              type="checkbox"
              checked={showPortfolio}
              onChange={() => setShowPortfolio(!showPortfolio)}
            />
            <span>Show Portfolio</span>
          </label>
        )}
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
          scoringType={scoringType} // Pass scoringType here
          showPtsMode={showPtsMode} // Pass showPtsMode toggle
          showPortfolio={showPortfolio} // Pass showPortfolio toggle
        />
        <PlayerList
          title="QB"
          players={players.filter((p) => p.Position === "QB")}
          groupBy="Tier"
          removedPlayers={removedPlayers}
          setPlayers={setPlayers}
          setRemovedPlayers={setRemovedPlayers}
          keepEmptyTiers={keepEmptyTiers}
          scoringType={scoringType} // Pass scoringType here
          showPtsMode={showPtsMode} // Pass showPtsMode toggle
          showPortfolio={showPortfolio} // Pass showPortfolio toggle
        />
        <PlayerList
          title="RB"
          players={players.filter((p) => p.Position === "RB")}
          groupBy="Tier"
          removedPlayers={removedPlayers}
          setPlayers={setPlayers}
          setRemovedPlayers={setRemovedPlayers}
          keepEmptyTiers={keepEmptyTiers}
          scoringType={scoringType} // Pass scoringType here
          showPtsMode={showPtsMode} // Pass showPtsMode toggle
          showPortfolio={showPortfolio} // Pass showPortfolio toggle
        />
        <PlayerList
          title="WR"
          players={players.filter((p) => p.Position === "WR")}
          groupBy="Tier"
          removedPlayers={removedPlayers}
          setPlayers={setPlayers}
          setRemovedPlayers={setRemovedPlayers}
          keepEmptyTiers={keepEmptyTiers}
          scoringType={scoringType} // Pass scoringType here
          showPtsMode={showPtsMode} // Pass showPtsMode toggle
          showPortfolio={showPortfolio} // Pass showPortfolio toggle
        />
        <PlayerList
          title="TE"
          players={players.filter((p) => p.Position === "TE")}
          groupBy="Tier"
          removedPlayers={removedPlayers}
          setPlayers={setPlayers}
          setRemovedPlayers={setRemovedPlayers}
          keepEmptyTiers={keepEmptyTiers}
          scoringType={scoringType} // Pass scoringType here
          showPtsMode={showPtsMode} // Pass showPtsMode toggle
          showPortfolio={showPortfolio} // Pass showPortfolio toggle
        />
      </div>
    </div>
  );
}
export default DraftHelper;

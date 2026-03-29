import React, { useState, useEffect, useCallback } from "react";
import PlayerList from "./PlayerList";
import DraftGrid from "./DraftGrid";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faRecycle,
  faExternalLinkAlt,
  faTableCells,
  faList,
} from "@fortawesome/free-solid-svg-icons";
import Papa from "papaparse";
import { useLocation, useParams } from "react-router-dom";
import "./DraftHelper.css";

// Add a mock flag
const mock = true; // Set to true for localhost, false for production

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
  const [viewMode, setViewMode] = useState("list"); // "list" | "grid"
  const [draftFormat, setDraftFormat] = useState("3rr"); // "3rr" | "snake"

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

      const pickedSleeperIds = new Set();
      const removedNames = new Set();

      picksData.forEach((pick) => {
        const pid = pick.player_id;
        if (pid) {
          pickedSleeperIds.add(pid);
          const inList = playersArr.find((p) => String(p.SleeperId) === String(pid));
          if (inList?.Name) removedNames.add(inList.Name);
        }
        const meta = pick.metadata || {};
        const fetchedLastName = meta.last_name;
        const fetchedTeam = fixTeamNames(meta.team);
        const fetchedPosition = meta.position;
        if (!fetchedLastName && !pid) return;
        for (const p of playersArr) {
          if (pickedSleeperIds.has(String(p.SleeperId))) continue;
          if (
            fetchedLastName &&
            p.Name?.includes(fetchedLastName) &&
            (fetchedTeam == null || p.Team === fetchedTeam) &&
            (fetchedPosition == null || p.Position === fetchedPosition)
          ) {
            pickedSleeperIds.add(String(p.SleeperId));
            removedNames.add(p.Name);
          }
        }
      });

      setRemovedPlayers(removedNames);

      const filteredArr = playersArr.filter(
        (p) => !pickedSleeperIds.has(String(p.SleeperId))
      );
      console.log("Players to remove:", removedNames.size, "Filtered count:", filteredArr.length);

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
    const currentPlayers = players;
    const filteredArr = await removePickedPlayers(draftId, currentPlayers);
    setPlayers(filteredArr);
  }, [draftId, players, removePickedPlayers]);

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

      // Step C) Add BestBallTotal, pts_ppr, and pts_half_ppr fields to the full player list
      const savedPortfolioData = JSON.parse(
        localStorage.getItem("FantasyHelperBestballPortfolio")
      );

      if (savedPortfolioData) {
        console.log("Loaded bestball portfolio data:", savedPortfolioData);

        const portfolioMap = savedPortfolioData.reduce((acc, player) => {
          acc[player.name] = {
            count: player.totalCount || 0,
            pts_ppr: player.pts_ppr || null,
            pts_half_ppr: player.pts_half_ppr || null,
          };
          return acc;
        }, {});

        parsedPlayers = parsedPlayers.map((player) => ({
          ...player,
          BestBallTotal: portfolioMap[player.Name]?.count || 0,
          pts_ppr: portfolioMap[player.Name]?.pts_ppr || null,
          pts_half_ppr: portfolioMap[player.Name]?.pts_half_ppr || null,
        }));
      } else {
        console.log("No bestball portfolio data found in localStorage.");
        parsedPlayers = parsedPlayers.map((player) => ({
          ...player,
          BestBallTotal: 0,
          pts_ppr: null,
          pts_half_ppr: null,
        }));
      }

      console.log("scoringType:", scoringType);
      // Always fetch KTC/FC values for the full player list
      try {
        const playerIds = parsedPlayers.map((player) => player.SleeperId).filter(Boolean);

        const cacheKey = `playerData_${[...playerIds].sort().join(',')}`;
        const cacheTimestampKey = `${cacheKey}_timestamp`;
        const cacheExpiry = 60 * 60 * 1000; // 1 hour

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

        if (!externalPlayers) {
          const response = await fetch(`${BASE_URL}/getplayers/data`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ playerlist: playerIds }),
          });
          externalPlayers = await response.json();
          console.log("API Response:", externalPlayers);
          try {
            sessionStorage.setItem(cacheKey, JSON.stringify(externalPlayers));
            sessionStorage.setItem(cacheTimestampKey, now.toString());
          } catch (e) {
            console.warn("Failed to cache player data", e);
          }
        }

        parsedPlayers = parsedPlayers.map((player) => {
          const externalPlayer = externalPlayers[player.SleeperId];
          return externalPlayer
            ? {
                ...player,
                "FC Value": externalPlayer["FC Value"] || "N/A",
                "KTC Value": externalPlayer["KTC Value"] || "N/A",
                gp: externalPlayer.gp || null,
                pts_ppr: externalPlayer.pts_ppr !== undefined && externalPlayer.pts_ppr !== null
                  ? externalPlayer.pts_ppr
                  : player.pts_ppr,
                pts_half_ppr: externalPlayer.pts_half_ppr !== undefined && externalPlayer.pts_half_ppr !== null
                  ? externalPlayer.pts_half_ppr
                  : player.pts_half_ppr,
              }
            : player;
        });
      } catch (error) {
        console.error("Error fetching external players:", error);
      }

      // Step D) Remove picks from Sleeper — parsedPlayers is now fully enriched
      let finalPlayers = parsedPlayers;
      if (routeDraftId && parsedPlayers.length > 0) {
        finalPlayers = await removePickedPlayers(routeDraftId, parsedPlayers);
      }

      console.log("Final players with BestBallTotal:", finalPlayers);
      // Step E) Store state — initialPlayers keeps the full enriched list for grid view
      setPlayers(finalPlayers);
      setInitialPlayers(parsedPlayers);
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

        <div className="view-toggle-group">
          <button
            className={`modern-button view-toggle-btn${viewMode === "list" ? " active" : ""}`}
            onClick={() => setViewMode("list")}
            title="List view"
          >
            <FontAwesomeIcon icon={faList} /> List
          </button>
          <button
            className={`modern-button view-toggle-btn${viewMode === "grid" ? " active" : ""}`}
            onClick={() => setViewMode("grid")}
            title="Grid view"
          >
            <FontAwesomeIcon icon={faTableCells} /> Grid
          </button>
        </div>

        {viewMode === "grid" && (
          <div className="view-toggle-group">
            <button
              className={`modern-button view-toggle-btn${draftFormat === "3rr" ? " active" : ""}`}
              onClick={() => setDraftFormat("3rr")}
            >
              3RR
            </button>
            <button
              className={`modern-button view-toggle-btn${draftFormat === "snake" ? " active" : ""}`}
              onClick={() => setDraftFormat("snake")}
            >
              Snake
            </button>
          </div>
        )}
      </div>

      {viewMode === "grid" ? (
        <DraftGrid
          initialPlayers={initialPlayers}
          removedPlayers={removedPlayers}
          setPlayers={setPlayers}
          setRemovedPlayers={setRemovedPlayers}
          draftFormat={draftFormat}
        />
      ) : (
        <div className="lists-container">
          <PlayerList
            title="ALL"
            players={players}
            groupBy="OverallTier"
            removedPlayers={removedPlayers}
            setPlayers={setPlayers}
            setRemovedPlayers={setRemovedPlayers}
            keepEmptyTiers={keepEmptyTiers}
            scoringType={scoringType}
            showPtsMode={showPtsMode}
            showPortfolio={showPortfolio}
          />
          <PlayerList
            title="QB"
            players={players.filter((p) => p.Position === "QB")}
            groupBy="Tier"
            removedPlayers={removedPlayers}
            setPlayers={setPlayers}
            setRemovedPlayers={setRemovedPlayers}
            keepEmptyTiers={keepEmptyTiers}
            scoringType={scoringType}
            showPtsMode={showPtsMode}
            showPortfolio={showPortfolio}
          />
          <PlayerList
            title="RB"
            players={players.filter((p) => p.Position === "RB")}
            groupBy="Tier"
            removedPlayers={removedPlayers}
            setPlayers={setPlayers}
            setRemovedPlayers={setRemovedPlayers}
            keepEmptyTiers={keepEmptyTiers}
            scoringType={scoringType}
            showPtsMode={showPtsMode}
            showPortfolio={showPortfolio}
          />
          <PlayerList
            title="WR"
            players={players.filter((p) => p.Position === "WR")}
            groupBy="Tier"
            removedPlayers={removedPlayers}
            setPlayers={setPlayers}
            setRemovedPlayers={setRemovedPlayers}
            keepEmptyTiers={keepEmptyTiers}
            scoringType={scoringType}
            showPtsMode={showPtsMode}
            showPortfolio={showPortfolio}
          />
          <PlayerList
            title="TE"
            players={players.filter((p) => p.Position === "TE")}
            groupBy="Tier"
            removedPlayers={removedPlayers}
            setPlayers={setPlayers}
            setRemovedPlayers={setRemovedPlayers}
            keepEmptyTiers={keepEmptyTiers}
            scoringType={scoringType}
            showPtsMode={showPtsMode}
            showPortfolio={showPortfolio}
          />
        </div>
      )}
    </div>
  );
}
export default DraftHelper;

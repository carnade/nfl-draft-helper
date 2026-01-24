import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import "./DraftSetup.css";

// Define the base URL
const mock = false;
const BASE_URL = mock
  ? "http://localhost:5000"
  : "https://shaggy-latashia-carnade-2ea2054a.koyeb.app";

// Default league year constant (can be easily changed)
const DEFAULT_LEAGUE_YEAR = 2026;

function DraftSetup({ setCsvData, setCsvFileName, isRankingsPage, userName }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedOption, setSelectedOption] = useState("adp_2qb.csv"); // Set default value
  const navigate = useNavigate();
  
  // State for draft rankings feature (only used when isRankingsPage is true)
  const [draftIdsInput, setDraftIdsInput] = useState("");
  const [drafts, setDrafts] = useState([]); // Array of { draftId, name, picks: [] }
  const [isLoadingDrafts, setIsLoadingDrafts] = useState(false);
  const [isCompiling, setIsCompiling] = useState(false);
  const [leagueYear, setLeagueYear] = useState(DEFAULT_LEAGUE_YEAR);
  const [myLeagues, setMyLeagues] = useState([]);
  const [myDrafts, setMyDrafts] = useState([]);
  const [isLoadingMyLeagues, setIsLoadingMyLeagues] = useState(false);
  const [draftSource, setDraftSource] = useState("manual"); // "manual" or "myLeagues"

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      setSelectedFile(file);
      // Automatically start with the selected CSV file
      const reader = new FileReader();
      reader.onload = (e) => {
        const csvData = e.target.result;
        setCsvData(csvData); // Passing CSV data
        if (isRankingsPage) {
          navigate("/rankings");
        } else {
          navigate("/drafthelper"); // Navigate to /draft
        }
      };
      reader.readAsText(file);
    }
  };


  const handlePresetClick = (optionValue) => {
    setSelectedOption(optionValue);
    setCsvData("");
    setCsvFileName(optionValue); // Use default CSV data
    if (isRankingsPage) {
      navigate("/rankings");
    } else {
      navigate("/drafthelper"); // Navigate to /draft
    }
  };

  const presetOptions = [
    { value: "adp_ppr.csv", label: "Sleeper PPR" },
    { value: "adp_2qb.csv", label: "Sleeper SF" },
    { value: "adp_half_ppr.csv", label: "Sleeper half-PPR" },
    { value: "adp_dynasty_ppr.csv", label: "Sleeper Dynasy PPR" },
    { value: "adp_dynasty_2qb.csv", label: "Sleeper Dynasy SF" },
    { value: "adp_dynasty_half_ppr.csv", label: "Sleeper Dynasty half-PPR" },
    { value: "adp_rookies.csv", label: "Rookies" },
  ];

  // Fetch league year from state endpoint on mount
  useEffect(() => {
    const fetchLeagueYear = async () => {
      try {
        const response = await fetch("https://api.sleeper.app/v1/state/nfl");
        if (response.ok) {
          const data = await response.json();
          if (data.season) {
            setLeagueYear(data.season);
          }
        }
      } catch (error) {
        console.error("Error fetching league year, using default:", error);
        // Keep default year
      }
    };
    fetchLeagueYear();
  }, []);

  const fetchMyLeagues = useCallback(async () => {
    if (!userName) {
      alert('Please set a username in the left menu or settings to use "My Leagues"');
      return;
    }

    setIsLoadingMyLeagues(true);
    try {
      // Get user ID from username
      const userResponse = await fetch(`https://api.sleeper.app/v1/user/${userName}`);
      if (!userResponse.ok) {
        throw new Error("Failed to fetch user");
      }
      const userData = await userResponse.json();
      const userId = userData.user_id;

      // Fetch user's leagues
      const leaguesResponse = await fetch(
        `https://api.sleeper.app/v1/user/${userId}/leagues/nfl/${leagueYear}`
      );
      if (!leaguesResponse.ok) {
        throw new Error("Failed to fetch leagues");
      }
      const leaguesData = await leaguesResponse.json();

      // Fetch drafts for each league
      const draftsPromises = leaguesData.map(async (league) => {
        try {
          const draftsResponse = await fetch(
            `https://api.sleeper.app/v1/league/${league.league_id}/drafts`
          );
          if (draftsResponse.ok) {
            const draftsData = await draftsResponse.json();
            return draftsData.map((draft) => ({
              draftId: draft.draft_id,
              name: draft.metadata?.name || `Draft ${draft.draft_id}`,
              leagueId: league.league_id,
            }));
          }
          return [];
        } catch (error) {
          console.error(`Error fetching drafts for league ${league.league_id}:`, error);
          return [];
        }
      });

      const allDrafts = (await Promise.all(draftsPromises)).flat();
      setMyDrafts(allDrafts);
      setMyLeagues(leaguesData);
    } catch (error) {
      console.error("Error fetching my leagues:", error);
      alert(`Error fetching leagues: ${error.message}`);
    } finally {
      setIsLoadingMyLeagues(false);
    }
  }, [userName, leagueYear]);

  // Fetch user's leagues when draftSource changes to "myLeagues"
  useEffect(() => {
    if (isRankingsPage && draftSource === "myLeagues" && userName) {
      fetchMyLeagues();
    }
  }, [draftSource, userName, isRankingsPage, fetchMyLeagues]);

  // Function to recalculate position ranks and tiers
  // Position tiers: 5 players per tier
  // Overall tiers: 12 players per tier (calculated separately)
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
          // Calculate tier: 5 players per tier
          p.Tier = Math.floor((qbCount - 1) / 5) + 1;
          break;
        case "RB":
          rbCount++;
          p.PositionRank = rbCount;
          p["Position Rank"] = rbCount.toString();
          // Calculate tier: 5 players per tier
          p.Tier = Math.floor((rbCount - 1) / 5) + 1;
          break;
        case "WR":
          wrCount++;
          p.PositionRank = wrCount;
          p["Position Rank"] = wrCount.toString();
          // Calculate tier: 5 players per tier
          p.Tier = Math.floor((wrCount - 1) / 5) + 1;
          break;
        case "TE":
          teCount++;
          p.PositionRank = teCount;
          p["Position Rank"] = teCount.toString();
          // Calculate tier: 5 players per tier
          p.Tier = Math.floor((teCount - 1) / 5) + 1;
          break;
        default:
          // For other positions, set tier to 1 as default
          p.Tier = 1;
          break;
      }
      return p;
    });
  }

  // Function to add drafts from input
  const handleAddDrafts = async () => {
    if (!draftIdsInput.trim()) {
      alert("Please enter at least one draft ID");
      return;
    }

    setIsLoadingDrafts(true);
    const draftIds = draftIdsInput
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id);

    const newDrafts = [];

    for (const draftId of draftIds) {
      // Check if draft already exists
      if (drafts.some((d) => d.draftId === draftId)) {
        continue;
      }

      try {
        // Fetch draft details (without /picks)
        const draftResponse = await fetch(
          `https://api.sleeper.app/v1/draft/${draftId}`
        );
        if (!draftResponse.ok) {
          console.error(`Failed to fetch draft ${draftId}`);
          continue;
        }
        const draftData = await draftResponse.json();

        // Fetch picks
        const picksResponse = await fetch(
          `https://api.sleeper.app/v1/draft/${draftId}/picks`
        );
        if (!picksResponse.ok) {
          console.error(`Failed to fetch picks for draft ${draftId}`);
          continue;
        }
        const picksData = await picksResponse.json();

        // Get name from metadata.name (which contains league name)
        const draftName = draftData.metadata?.name || `Draft ${draftId}`;

        newDrafts.push({
          draftId,
          name: draftName,
          picks: picksData,
        });
      } catch (error) {
        console.error(`Error fetching draft ${draftId}:`, error);
      }
    }

    setDrafts([...drafts, ...newDrafts]);
    setDraftIdsInput("");
    setIsLoadingDrafts(false);
  };

  // Function to add draft from "My Leagues" dropdown
  const handleAddDraftFromMyLeagues = async (draftId) => {
    // Check if draft already exists
    if (drafts.some((d) => d.draftId === draftId)) {
      alert("This draft is already added");
      return;
    }

    setIsLoadingDrafts(true);
    try {
      // Fetch draft details
      const draftResponse = await fetch(
        `https://api.sleeper.app/v1/draft/${draftId}`
      );
      if (!draftResponse.ok) {
        throw new Error(`Failed to fetch draft ${draftId}`);
      }
      const draftData = await draftResponse.json();

      // Fetch picks
      const picksResponse = await fetch(
        `https://api.sleeper.app/v1/draft/${draftId}/picks`
      );
      if (!picksResponse.ok) {
        throw new Error(`Failed to fetch picks for draft ${draftId}`);
      }
      const picksData = await picksResponse.json();

      // Get name from metadata.name (which contains league name)
      const draftName = draftData.metadata?.name || `Draft ${draftId}`;

      setDrafts([
        ...drafts,
        {
          draftId,
          name: draftName,
          picks: picksData,
        },
      ]);
    } catch (error) {
      console.error(`Error adding draft ${draftId}:`, error);
      alert(`Error adding draft: ${error.message}`);
    } finally {
      setIsLoadingDrafts(false);
    }
  };

  // Function to compile rankings from drafts
  const handleCompileRankings = async () => {
    if (drafts.length === 0) {
      alert("Please add at least one draft first");
      return;
    }

    setIsCompiling(true);

    try {
      // Calculate average ADP for each player
      const playerAdpMap = {}; // { player_id: { adps: [], count: number } }

      drafts.forEach((draft) => {
        // Sort picks by round and pick_no to ensure correct order
        const sortedPicks = [...draft.picks].sort((a, b) => {
          if (a.round !== b.round) {
            return a.round - b.round;
          }
          return (a.pick_no || 0) - (b.pick_no || 0);
        });

        sortedPicks.forEach((pick, index) => {
          const playerId = pick.player_id;
          if (!playerId) return;

          if (!playerAdpMap[playerId]) {
            playerAdpMap[playerId] = { adps: [], count: 0 };
          }
          // Use pick_no if available, otherwise use index + 1
          // ADP is 1-indexed (pick 1 = ADP 1)
          const adp = pick.pick_no || index + 1;
          playerAdpMap[playerId].adps.push(adp);
          playerAdpMap[playerId].count++;
        });
      });

      // Calculate average ADP for each player
      const playerAverages = Object.entries(playerAdpMap).map(
        ([playerId, data]) => {
          const avgAdp =
            data.adps.reduce((sum, adp) => sum + adp, 0) / data.adps.length;
          return {
            playerId,
            avgAdp,
            draftCount: data.count,
          };
        }
      );

      // Sort by average ADP
      playerAverages.sort((a, b) => a.avgAdp - b.avgAdp);

      // Fetch player data for all players
      const playerIds = playerAverages.map((p) => p.playerId);
      const playerDataResponse = await fetch(`${BASE_URL}/getplayers/data`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ playerlist: playerIds }),
      });

      const playerData = await playerDataResponse.json();

      // Build rankings array
      const rankings = playerAverages.map((playerAvg, index) => {
        const playerInfo = playerData[playerAvg.playerId] || {};
        const name =
          playerInfo.name ||
          `${playerInfo.first_name || ""} ${playerInfo.last_name || ""}`.trim() ||
          `Player ${playerAvg.playerId}`;
        const position = playerInfo.position || "UNK";
        const team = playerInfo.team || playerInfo.team_abbr || "";
        const bye = playerInfo.bye || "";

        return {
          SleeperId: playerAvg.playerId,
          Name: name,
          Position: position,
          Team: team,
          Bye: bye,
          OverallRank: index + 1,
          "Overall Rank": String(index + 1),
          OverallTier: Math.floor(index / 12) + 1,
          Tier: 1, // Will be recalculated by recalcPositionRanks
          PositionRank: 0, // Will be recalculated
          "Position Rank": "0", // Will be recalculated
        };
      });

      // Recalculate position ranks
      const finalRankings = recalcPositionRanks(rankings);

      // Convert to CSV format
      const headers = [
        "SleeperId",
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

      finalRankings.forEach((player) => {
        const row = [
          player.SleeperId,
          player["Overall Rank"],
          player.Name,
          player.Position,
          player.Team,
          player.Bye,
          player["Position Rank"],
          player.Tier || "",
          player.OverallTier || "",
        ];
        csvContent += row.join(",") + "\n";
      });

      // Set CSV data and navigate to rankings page
      setCsvData(csvContent);
      setCsvFileName("");
      navigate("/rankings");
    } catch (error) {
      console.error("Error compiling rankings:", error);
      alert("Error compiling rankings. Please try again.");
    } finally {
      setIsCompiling(false);
    }
  };

  // Function to remove a draft
  const handleRemoveDraft = (draftId) => {
    setDrafts(drafts.filter((d) => d.draftId !== draftId));
  };

  return (
    <div className="start-page">
      {isRankingsPage ? (
        <h1>Create Rankings Setup</h1>
      ) : (
        <h1>Draft Helper Setup</h1>
      )}
      <hr className="separator" />
      
      <div className="setup-section">
        <h3>Use Preset Rankings</h3>
        <div className="preset-list-container">
          {presetOptions.map((option) => (
            <div
              key={option.value}
              className={`preset-option ${selectedOption === option.value ? "selected" : ""}`}
              onClick={() => handlePresetClick(option.value)}
            >
              {option.label}
            </div>
          ))}
        </div>
      </div>

      <div className="setup-section">
        <h3>Load Custom Rankings</h3>
        <div className="file-input-container">
          <label htmlFor="file-input" className="file-input-label">
            <span>Start with CSV</span>
            <input
              type="file"
              accept=".csv"
              id="file-input"
              style={{ display: "none" }}
              onChange={handleFileChange}
            />
          </label>
        </div>
      </div>

      {isRankingsPage && (
        <div className="setup-section">
          <h3>Create Rankings from Drafts</h3>
          
          {/* Draft source selector */}
          <div className="draft-source-selector">
            <label>
              <input
                type="radio"
                name="draftSource"
                value="manual"
                checked={draftSource === "manual"}
                onChange={(e) => setDraftSource(e.target.value)}
              />
              Manual Entry
            </label>
            <label>
              <input
                type="radio"
                name="draftSource"
                value="myLeagues"
                checked={draftSource === "myLeagues"}
                onChange={(e) => setDraftSource(e.target.value)}
              />
              My Leagues
            </label>
          </div>

          {draftSource === "manual" ? (
            <div className="draft-input-container">
              <input
                type="text"
                className="draft-ids-input"
                placeholder="Enter draft IDs separated by commas (e.g., 123456, 789012)"
                value={draftIdsInput}
                onChange={(e) => setDraftIdsInput(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === "Enter") {
                    handleAddDrafts();
                  }
                }}
              />
              <button
                className="modern-button"
                onClick={handleAddDrafts}
                disabled={isLoadingDrafts}
              >
                {isLoadingDrafts ? "Adding..." : "Add Drafts"}
              </button>
            </div>
          ) : (
            <div className="my-leagues-container">
              {isLoadingMyLeagues ? (
                <p>Loading your leagues...</p>
              ) : myDrafts.length === 0 ? (
                <p>No drafts found in your leagues for {leagueYear}</p>
              ) : (
                <div className="my-drafts-dropdown-container">
                  <select
                    className="my-drafts-dropdown"
                    onChange={(e) => {
                      if (e.target.value) {
                        handleAddDraftFromMyLeagues(e.target.value);
                        e.target.value = ""; // Reset dropdown
                      }
                    }}
                    disabled={isLoadingDrafts}
                  >
                    <option value="">Select a draft to add...</option>
                    {myDrafts.map((draft) => (
                      <option key={draft.draftId} value={draft.draftId}>
                        {draft.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          <div className="draft-actions-container">
            <button
              className="modern-button"
              onClick={handleCompileRankings}
              disabled={isCompiling || drafts.length === 0}
            >
              {isCompiling ? "Compiling..." : "Compile Rankings"}
            </button>
          </div>

          {drafts.length > 0 && (
            <div className="drafts-list">
              <h4>Added Drafts:</h4>
              <div className="drafts-grid">
                {drafts.map((draft) => (
                  <div key={draft.draftId} className="draft-item">
                    <span className="draft-name">{draft.name}</span>
                    <span className="draft-id">ID: {draft.draftId}</span>
                    <button
                      className="remove-draft-button"
                      onClick={() => handleRemoveDraft(draft.draftId)}
                      title="Remove draft"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default DraftSetup;

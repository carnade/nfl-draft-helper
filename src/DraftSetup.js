import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import "./DraftSetup.css";

// Define the base URL
const mock = process.env.REACT_APP_MOCK === 'true';
const BASE_URL = mock
  ? "http://localhost:5000"
  : "https://shaggy-latashia-carnade-2ea2054a.koyeb.app";

// Default league year constant (can be easily changed)
const DEFAULT_LEAGUE_YEAR = 2026;

// Derive type (Dynasty / Best Ball / Redraft), QB count, PPR, TEP from league
function getLeagueDisplayInfo(league) {
  const typeNum = league.settings?.type ?? 0;
  const bestBall = league.settings?.best_ball === 1;
  const type = typeNum === 2 ? "Dynasty" : bestBall ? "Best Ball" : "Redraft";
  const roster = league.roster_positions || [];
  const qb = roster.includes("SUPER_FLEX") ? 2 : 1;
  const ppr = league.scoring_settings?.rec ?? 0;
  const tep = league.scoring_settings?.bonus_rec_te ?? 0;
  return { type, qb, ppr, tep };
}

// Sort order: complete first, then drafting, then rest (case-insensitive)
function getStatusSortOrder(status) {
  const s = (status || "").toLowerCase();
  if (s === "complete") return 0;
  if (s === "drafting") return 1;
  return 2;
}

// Sort order for type: Dynasty first, then Best Ball, then Redraft
function getTypeSortOrder(type) {
  const t = (type || "").trim();
  if (t === "Dynasty") return 0;
  if (t === "Best Ball") return 1;
  if (t === "Redraft") return 2;
  return 3;
}

// Sort: 1) status (complete > drafting > rest), 2) type (Dynasty > Best Ball > Redraft), 3) name A–Z
function sortDraftsByStatusTypeName(drafts) {
  return [...drafts].sort((a, b) => {
    const statusDiff =
      getStatusSortOrder(a.status) - getStatusSortOrder(b.status);
    if (statusDiff !== 0) return statusDiff;
    const typeDiff = getTypeSortOrder(a.type) - getTypeSortOrder(b.type);
    if (typeDiff !== 0) return typeDiff;
    return (a.name || "").localeCompare(b.name || "", undefined, {
      sensitivity: "base",
    });
  });
}

// CSS class for type color (Dynasty=purple, Best Ball=yellow, Redraft=turquoise)
function getTypeClassName(type) {
  if (!type) return "";
  const key = type.toLowerCase().replace(/\s+/g, "-");
  return `type-${key}`;
}

function formatStatusLabel(status) {
  if (!status) return "—";
  return status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ");
}

function DraftSetup({ setCsvData, setCsvFileName, isRankingsPage, userName }) {
  const navigate = useNavigate();

  // State for draft rankings feature (only used when isRankingsPage is true)
  const [draftIdsInput, setDraftIdsInput] = useState("");
  const [drafts, setDrafts] = useState([]); // Array of { draftId, name, picks: [] }
  const [isLoadingDrafts, setIsLoadingDrafts] = useState(false);
  const [isCompiling, setIsCompiling] = useState(false);
  const [leagueYear, setLeagueYear] = useState(DEFAULT_LEAGUE_YEAR); // 2025 or 2026
  const [myDraftsCache, setMyDraftsCache] = useState({
    2025: null,
    2026: null,
  }); // null = not loaded, array = loaded
  const [myDrafts, setMyDrafts] = useState([]);
  const [isLoadingMyLeagues, setIsLoadingMyLeagues] = useState(false);
  const [draftSource, setDraftSource] = useState("manual"); // "manual" | "myLeagues" | "otherUser"
  const [otherUserInput, setOtherUserInput] = useState("");
  const [otherUserDraftsCache, setOtherUserDraftsCache] = useState({}); // { username: { 2025: []|null, 2026: []|null } }
  const [otherUserDrafts, setOtherUserDrafts] = useState([]);
  const [isLoadingOtherUser, setIsLoadingOtherUser] = useState(false);
  const [otherUserSubmitted, setOtherUserSubmitted] = useState(false);

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
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
    setCsvData("");
    setCsvFileName(optionValue); // Use default CSV data
    if (isRankingsPage) {
      navigate("/rankings");
    } else {
      navigate("/drafthelper"); // Navigate to /draft
    }
  };

  const presetOptions = [
    { value: "communityranks.csv", label: "Sleeper Community" },
    { value: "400draft2026SF.csv", label: "400 2026 Dynasty Drafts" },
    { value: "adp_ppr.csv", label: "Sleeper PPR" },
    { value: "adp_2qb.csv", label: "Sleeper SF" },
    { value: "adp_half_ppr.csv", label: "Sleeper half-PPR" },
    { value: "adp_dynasty_ppr.csv", label: "Sleeper Dynasy PPR" },
    { value: "adp_dynasty_2qb.csv", label: "Sleeper Dynasy SF" },
    { value: "adp_dynasty_half_ppr.csv", label: "Sleeper Dynasty half-PPR" },
    { value: "adp_rookies.csv", label: "Rookies" },
  ];

  const fetchMyLeagues = useCallback(async () => {
    if (!userName) {
      alert(
        'Please set a username in the left menu or settings to use "My Leagues"',
      );
      return;
    }

    setIsLoadingMyLeagues(true);
    try {
      // Get user ID from username
      const userResponse = await fetch(
        `https://api.sleeper.app/v1/user/${userName}`,
      );
      if (!userResponse.ok) {
        throw new Error("Failed to fetch user");
      }
      const userData = await userResponse.json();
      const userId = userData.user_id;

      // Fetch user's leagues
      const leaguesResponse = await fetch(
        `https://api.sleeper.app/v1/user/${userId}/leagues/nfl/${leagueYear}`,
      );
      if (!leaguesResponse.ok) {
        throw new Error("Failed to fetch leagues");
      }
      const leaguesData = await leaguesResponse.json();

      // Fetch drafts for each league
      const draftsPromises = leaguesData.map(async (league) => {
        try {
          const draftsResponse = await fetch(
            `https://api.sleeper.app/v1/league/${league.league_id}/drafts`,
          );
          if (draftsResponse.ok) {
            const draftsData = await draftsResponse.json();
            const info = getLeagueDisplayInfo(league);
            return draftsData.map((draft) => ({
              draftId: draft.draft_id,
              name:
                draft.metadata?.name ||
                league.name ||
                `Draft ${draft.draft_id}`,
              leagueId: league.league_id,
              type: info.type,
              qb: info.qb,
              ppr: info.ppr,
              tep: info.tep,
              status: draft.status || "",
            }));
          }
          return [];
        } catch (error) {
          console.error(
            `Error fetching drafts for league ${league.league_id}:`,
            error,
          );
          return [];
        }
      });

      const allDrafts = (await Promise.all(draftsPromises)).flat();
      const sorted = sortDraftsByStatusTypeName(allDrafts);
      setMyDraftsCache((prev) => ({ ...prev, [leagueYear]: sorted }));
      setMyDrafts(sorted);
    } catch (error) {
      console.error("Error fetching my leagues:", error);
      alert(`Error fetching leagues: ${error.message}`);
    } finally {
      setIsLoadingMyLeagues(false);
    }
  }, [userName, leagueYear]);

  // Fetch another user's leagues for a given year; cache by username + year
  const fetchOtherUserLeagues = useCallback(
    async (username, yearOverride) => {
      const year = yearOverride ?? leagueYear;
      if (!username || !username.trim()) {
        alert("Please enter a username");
        return;
      }
      const trimmed = username.trim();
      setOtherUserSubmitted(true);
      setIsLoadingOtherUser(true);
      setOtherUserDrafts([]);
      try {
        const userResponse = await fetch(
          `https://api.sleeper.app/v1/user/${trimmed}`,
        );
        if (!userResponse.ok) {
          throw new Error("Failed to fetch user");
        }
        const userData = await userResponse.json();
        const userId = userData.user_id;

        const leaguesResponse = await fetch(
          `https://api.sleeper.app/v1/user/${userId}/leagues/nfl/${year}`,
        );
        if (!leaguesResponse.ok) {
          throw new Error("Failed to fetch leagues");
        }
        const leaguesData = await leaguesResponse.json();

        const draftsPromises = leaguesData.map(async (league) => {
          try {
            const draftsResponse = await fetch(
              `https://api.sleeper.app/v1/league/${league.league_id}/drafts`,
            );
            if (draftsResponse.ok) {
              const draftsData = await draftsResponse.json();
              const info = getLeagueDisplayInfo(league);
              return draftsData.map((draft) => ({
                draftId: draft.draft_id,
                name:
                  draft.metadata?.name ||
                  league.name ||
                  `Draft ${draft.draft_id}`,
                leagueId: league.league_id,
                type: info.type,
                qb: info.qb,
                ppr: info.ppr,
                tep: info.tep,
                status: draft.status || "",
              }));
            }
            return [];
          } catch (error) {
            console.error(
              `Error fetching drafts for league ${league.league_id}:`,
              error,
            );
            return [];
          }
        });

        const allDrafts = (await Promise.all(draftsPromises)).flat();
        const sorted = sortDraftsByStatusTypeName(allDrafts);
        setOtherUserDraftsCache((prev) => ({
          ...prev,
          [trimmed]: {
            ...(prev[trimmed] || { 2025: null, 2026: null }),
            [year]: sorted,
          },
        }));
        setOtherUserDrafts(sorted);
      } catch (error) {
        console.error("Error fetching other user leagues:", error);
        alert(`Error fetching leagues: ${error.message}`);
      } finally {
        setIsLoadingOtherUser(false);
      }
    },
    [leagueYear],
  );

  // Load My Leagues: use cache for selected year or fetch once per year (always re-sort when displaying)
  useEffect(() => {
    if (!isRankingsPage || draftSource !== "myLeagues" || !userName) return;
    const cached = myDraftsCache[leagueYear];
    if (cached !== null && cached !== undefined) {
      setMyDrafts(sortDraftsByStatusTypeName(cached));
      return;
    }
    setMyDrafts([]);
    fetchMyLeagues();
  }, [
    draftSource,
    leagueYear,
    userName,
    isRankingsPage,
    fetchMyLeagues,
    myDraftsCache,
  ]);

  // Reset other-user state when switching away
  useEffect(() => {
    if (draftSource !== "otherUser") {
      setOtherUserSubmitted(false);
    }
  }, [draftSource]);

  // When year changes on Other user: use cache or fetch for that year (always re-sort when displaying)
  useEffect(() => {
    if (
      !isRankingsPage ||
      draftSource !== "otherUser" ||
      !otherUserSubmitted ||
      !otherUserInput.trim()
    )
      return;
    const trimmed = otherUserInput.trim();
    const userCache = otherUserDraftsCache[trimmed];
    const cached = userCache?.[leagueYear];
    if (cached !== null && cached !== undefined) {
      setOtherUserDrafts(sortDraftsByStatusTypeName(cached));
      return;
    }
    setOtherUserDrafts([]);
    fetchOtherUserLeagues(trimmed, leagueYear);
  }, [
    leagueYear,
    draftSource,
    otherUserSubmitted,
    otherUserInput,
    isRankingsPage,
    otherUserDraftsCache,
    fetchOtherUserLeagues,
  ]);

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
      if (drafts.some((d) => d.draftId === draftId)) {
        continue;
      }

      try {
        const draftResponse = await fetch(
          `https://api.sleeper.app/v1/draft/${draftId}`,
        );
        if (!draftResponse.ok) {
          console.error(`Failed to fetch draft ${draftId}`);
          continue;
        }
        const draftData = await draftResponse.json();

        const picksResponse = await fetch(
          `https://api.sleeper.app/v1/draft/${draftId}/picks`,
        );
        if (!picksResponse.ok) {
          console.error(`Failed to fetch picks for draft ${draftId}`);
          continue;
        }
        const picksData = await picksResponse.json();

        const draftName = draftData.metadata?.name || `Draft ${draftId}`;
        let type = null,
          qb = null,
          ppr = null,
          tep = null;
        const status = draftData.status ?? null;

        if (draftData.league_id) {
          const leagueResponse = await fetch(
            `https://api.sleeper.app/v1/league/${draftData.league_id}`,
          );
          if (leagueResponse.ok) {
            const league = await leagueResponse.json();
            const info = getLeagueDisplayInfo(league);
            type = info.type;
            qb = info.qb;
            ppr = info.ppr;
            tep = info.tep;
          }
        }

        newDrafts.push({
          draftId,
          name: draftName,
          picks: picksData,
          type,
          qb,
          ppr,
          tep,
          status,
        });
      } catch (error) {
        console.error(`Error fetching draft ${draftId}:`, error);
      }
    }

    setDrafts([...drafts, ...newDrafts]);
    setDraftIdsInput("");
    setIsLoadingDrafts(false);
  };

  // Function to add draft from "My Leagues" or "Other user" table (receives full draft item)
  const handleAddDraftFromList = async (draftItem) => {
    const { draftId, name, type, qb, ppr, tep, status } = draftItem;
    if (drafts.some((d) => d.draftId === draftId)) {
      alert("This draft is already added");
      return;
    }

    setIsLoadingDrafts(true);
    try {
      const draftResponse = await fetch(
        `https://api.sleeper.app/v1/draft/${draftId}`,
      );
      if (!draftResponse.ok) {
        throw new Error(`Failed to fetch draft ${draftId}`);
      }
      const draftData = await draftResponse.json();

      const picksResponse = await fetch(
        `https://api.sleeper.app/v1/draft/${draftId}/picks`,
      );
      if (!picksResponse.ok) {
        throw new Error(`Failed to fetch picks for draft ${draftId}`);
      }
      const picksData = await picksResponse.json();

      const draftName = draftData.metadata?.name || name || `Draft ${draftId}`;

      setDrafts([
        ...drafts,
        {
          draftId,
          name: draftName,
          picks: picksData,
          type: type ?? null,
          qb: qb ?? null,
          ppr: ppr ?? null,
          tep: tep ?? null,
          status: status ?? null,
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
      // Pre-fetch player data so we can detect kickers before building the ADP map
      const allPlayerIds = [
        ...new Set(
          drafts.flatMap((d) =>
            d.picks.map((p) => p.player_id).filter(Boolean),
          ),
        ),
      ];
      const playerDataResponse = await fetch(`${BASE_URL}/getplayers/data`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerlist: allPlayerIds }),
      });
      const playerData = await playerDataResponse.json();

      // Build ADP map — kickers are grouped by pick slot (round.pick) instead of player_id
      const playerAdpMap = {}; // { key: { adps: [], count, isPickSlot, round?, pickWithinRound? } }

      drafts.forEach((draft) => {
        const teamsCount =
          draft.picks.filter((p) => p.round === 1).length || 12;

        const sortedPicks = [...draft.picks].sort((a, b) => {
          if (a.round !== b.round) return a.round - b.round;
          return (a.pick_no || 0) - (b.pick_no || 0);
        });

        sortedPicks.forEach((pick, index) => {
          const playerId = pick.player_id;
          if (!playerId) return;

          const position = playerData[playerId]?.position || "";
          let key;
          let isPickSlot = false;
          let round, pickWithinRound;

          if (position === "K") {
            // Group all kickers at the same pick slot together
            round = pick.round;
            pickWithinRound = pick.pick_no - (round - 1) * teamsCount;
            key = `PICK_${round}_${pickWithinRound}`;
            isPickSlot = true;
          } else {
            key = playerId;
          }

          if (!playerAdpMap[key]) {
            playerAdpMap[key] = { adps: [], count: 0, isPickSlot };
            if (isPickSlot) {
              playerAdpMap[key].round = round;
              playerAdpMap[key].pickWithinRound = pickWithinRound;
            }
          }
          const adp = pick.pick_no || index + 1;
          playerAdpMap[key].adps.push(adp);
          playerAdpMap[key].count++;
        });
      });

      // Calculate average ADP for each entry
      const playerAverages = Object.entries(playerAdpMap).map(
        ([key, data]) => {
          const avgAdp =
            data.adps.reduce((sum, adp) => sum + adp, 0) / data.adps.length;
          return {
            playerId: key,
            avgAdp,
            draftCount: data.count,
            isPickSlot: data.isPickSlot,
            round: data.round,
            pickWithinRound: data.pickWithinRound,
          };
        },
      );

      // Sort by average ADP
      playerAverages.sort((a, b) => a.avgAdp - b.avgAdp);

      // Assign sequential pick slot names by rank order: 1.01, 1.02, ..., 1.12, 2.01, ...
      let pickSlotCounter = 0;
      playerAverages.forEach((playerAvg) => {
        if (playerAvg.isPickSlot) {
          pickSlotCounter++;
          const major = Math.ceil(pickSlotCounter / 12);
          const minor = ((pickSlotCounter - 1) % 12) + 1;
          playerAvg.pickSlotName = `Pick ${major}.${String(minor).padStart(2, "0")}`;
        }
      });

      // Build rankings array
      const rankings = playerAverages.map((playerAvg, index) => {
        let name, position, team, bye;

        if (playerAvg.isPickSlot) {
          name = playerAvg.pickSlotName;
          position = "K";
          team = "";
          bye = "";
        } else {
          const playerInfo = playerData[playerAvg.playerId] || {};
          name =
            playerInfo.name ||
            `${playerInfo.first_name || ""} ${playerInfo.last_name || ""}`.trim() ||
            `Player ${playerAvg.playerId}`;
          position = playerInfo.position || "UNK";
          team = playerInfo.team || playerInfo.team_abbr || "";
          bye = playerInfo.bye || "";
        }

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
              className="preset-option"
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

          <div className="year-toggle-section">
            <label className="year-toggle-label">Year</label>
            <div className="year-toggle">
              <button
                type="button"
                className={`year-btn ${leagueYear === 2025 ? "active" : ""}`}
                onClick={() => setLeagueYear(2025)}
              >
                2025
              </button>
              <button
                type="button"
                className={`year-btn ${leagueYear === 2026 ? "active" : ""}`}
                onClick={() => setLeagueYear(2026)}
              >
                2026
              </button>
            </div>
          </div>

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
            <label>
              <input
                type="radio"
                name="draftSource"
                value="otherUser"
                checked={draftSource === "otherUser"}
                onChange={(e) => setDraftSource(e.target.value)}
              />
              Other user
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
          ) : draftSource === "otherUser" ? (
            <div className="other-user-container">
              <div className="other-user-input-row">
                <input
                  type="text"
                  className="draft-ids-input other-user-input"
                  placeholder="Sleeper username"
                  value={otherUserInput}
                  onChange={(e) => {
                    setOtherUserInput(e.target.value);
                    setOtherUserSubmitted(false);
                  }}
                  onKeyPress={(e) => {
                    if (e.key === "Enter") {
                      setOtherUserSubmitted(true);
                    }
                  }}
                />
                <button
                  className="modern-button"
                  onClick={() => setOtherUserSubmitted(true)}
                  disabled={isLoadingOtherUser}
                >
                  {isLoadingOtherUser ? "Loading..." : "Submit"}
                </button>
              </div>
              {isLoadingOtherUser ? (
                <p>Loading leagues for {otherUserInput.trim()}...</p>
              ) : otherUserDrafts.length === 0 ? (
                <p>
                  {otherUserSubmitted
                    ? `No drafts found for this user in ${leagueYear}`
                    : `Enter a username and click Submit to load their leagues for ${leagueYear}`}
                </p>
              ) : (
                <div className="leagues-table-wrapper">
                  <table className="leagues-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Type</th>
                        <th>QB</th>
                        <th>PPR</th>
                        <th>TEP</th>
                        <th>Stats</th>
                      </tr>
                    </thead>
                    <tbody>
                      {otherUserDrafts.map((draft) => (
                        <tr
                          key={draft.draftId}
                          onClick={() =>
                            !isLoadingDrafts && handleAddDraftFromList(draft)
                          }
                          className={isLoadingDrafts ? "disabled" : "clickable"}
                        >
                          <td className="col-name">{draft.name}</td>
                          <td className={getTypeClassName(draft.type)}>
                            {draft.type ?? "—"}
                          </td>
                          <td>{draft.qb ?? "—"}</td>
                          <td>{draft.ppr != null ? Number(draft.ppr) : "—"}</td>
                          <td>{draft.tep != null ? Number(draft.tep) : "—"}</td>
                          <td
                            className={`stats-cell stats-${draft.status || "other"}`}
                          >
                            {formatStatusLabel(draft.status)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <div className="my-leagues-container">
              {isLoadingMyLeagues ? (
                <p>Loading your leagues...</p>
              ) : myDrafts.length === 0 ? (
                <p>No drafts found in your leagues for {leagueYear}</p>
              ) : (
                <div className="leagues-table-wrapper">
                  <table className="leagues-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Type</th>
                        <th>QB</th>
                        <th>PPR</th>
                        <th>TEP</th>
                        <th>Stats</th>
                      </tr>
                    </thead>
                    <tbody>
                      {myDrafts.map((draft) => (
                        <tr
                          key={draft.draftId}
                          onClick={() =>
                            !isLoadingDrafts && handleAddDraftFromList(draft)
                          }
                          className={isLoadingDrafts ? "disabled" : "clickable"}
                        >
                          <td className="col-name">{draft.name}</td>
                          <td className={getTypeClassName(draft.type)}>
                            {draft.type ?? "—"}
                          </td>
                          <td>{draft.qb ?? "—"}</td>
                          <td>{draft.ppr != null ? Number(draft.ppr) : "—"}</td>
                          <td>{draft.tep != null ? Number(draft.tep) : "—"}</td>
                          <td
                            className={`stats-cell stats-${draft.status || "other"}`}
                          >
                            {formatStatusLabel(draft.status)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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
              <h4>Selected leagues</h4>
              <div className="leagues-table-wrapper selected-leagues-table">
                <table className="leagues-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Type</th>
                      <th>QB</th>
                      <th>PPR</th>
                      <th>TEP</th>
                      <th>Stats</th>
                      <th className="col-remove"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortDraftsByStatusTypeName(drafts).map((draft) => (
                      <tr key={draft.draftId}>
                        <td className="col-name">{draft.name}</td>
                        <td className={getTypeClassName(draft.type)}>
                          {draft.type ?? "—"}
                        </td>
                        <td>{draft.qb ?? "—"}</td>
                        <td>{draft.ppr != null ? Number(draft.ppr) : "—"}</td>
                        <td>{draft.tep != null ? Number(draft.tep) : "—"}</td>
                        <td
                          className={`stats-cell stats-${draft.status || "other"}`}
                        >
                          {formatStatusLabel(draft.status)}
                        </td>
                        <td className="col-remove">
                          <button
                            type="button"
                            className="remove-draft-button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveDraft(draft.draftId);
                            }}
                            title="Remove draft"
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default DraftSetup;

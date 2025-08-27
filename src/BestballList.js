import React, { useEffect, useState, useCallback, useContext, useMemo } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faExternalLinkAlt,
  faTrophy,
  faTableCells,
} from "@fortawesome/free-solid-svg-icons";
import { useParams } from "react-router-dom";
import "./BestballList.css";
import DraftModal from "./DraftModal";
import { ThemeContext } from "./ThemeContext";

// Add a mock flag
const mock = false; // Set to true for mock data, false for production

// Define the base URL based on the mock flag
const BASE_URL = mock
  ? "http://localhost:5000"
  : "https://shaggy-latashia-carnade-2ea2054a.koyeb.app";

function BestballList() {
  const { userName } = useParams();
  const { theme } = useContext(ThemeContext);
  const [userId, setUserId] = useState(null);
  const [leagues, setLeagues] = useState([]);
  const [expandedLeagueIds, setExpandedLeagueIds] = useState(new Set());
  const [activeTab, setActiveTab] = useState("Results");
  const [portfolioData, setPortfolioData] = useState([]);
  const [selectedPosition, setSelectedPosition] = useState(null);
  const [selectedDraft, setSelectedDraft] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Add state for league counts
  const [oneQBDrafts, setOneQBDrafts] = useState(0);
  const [twoQBDrafts, setTwoQBDrafts] = useState(0);
  const [totalDrafts, setTotalDrafts] = useState(0);

  // Add state for sorting
  const [sortConfig, setSortConfig] = useState({
    key: "totalCount",
    direction: "descending",
  });

  const [showNon12TeamDrafts, setShowNon12TeamDrafts] = useState(false);
  const [show1QB, setShow1QB] = useState(true);
  const [show2QB, setShow2QB] = useState(true);

  const LEAGUE_YEAR = 2025;

  const handleToggle = (leagueId) => {
    setExpandedLeagueIds((prevIds) => {
      const newIds = new Set(prevIds);
      if (newIds.has(leagueId)) {
        newIds.delete(leagueId);
      } else {
        newIds.add(leagueId);
      }
      return newIds;
    });
  };

  const fetchBestballPlayerData = useCallback(
    async (
      playerIds,
      playerCountMap,
      oneQBCountMap,
      twoQBCountMap,
      totalDrafts,
      oneQBDrafts,
      twoQBDrafts
    ) => {
      const requests = {
        playerlist: playerIds,
      };

      try {
        const response = await fetch(`${BASE_URL}/getplayers/data`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requests),
        });

        const data = await response.json();

        // Update the `name` field to combine `first_name` and `last_name`
        const playerData = Object.entries(data).map(([playerId, player]) => {
          const totalCount = playerCountMap[playerId] || 0;
          const oneQBCount = oneQBCountMap[playerId] || 0;
          const twoQBCount = twoQBCountMap[playerId] || 0;

          const totalPercentage =
            totalDrafts > 0 ? ((totalCount / totalDrafts) * 100).toFixed(0) : 0;
          const oneQBPercentage =
            oneQBDrafts > 0 ? ((oneQBCount / oneQBDrafts) * 100).toFixed(0) : 0;
          const twoQBPercentage =
            twoQBDrafts > 0 ? ((twoQBCount / twoQBDrafts) * 100).toFixed(0) : 0;

          return {
            name: `${player.first_name} ${player.last_name}`.trim(), // Combine first and last name
            position: player.position,
            totalCount,
            totalPercentage,
            oneQBCount,
            oneQBPercentage,
            twoQBCount,
            twoQBPercentage,
            pts_ppr: player.pts_ppr || null,
            pts_half_ppr: player.pts_half_ppr || null,
            pos_adp_2qb: player.adp_2qb_rank || null,
            pos_adp_ppr: player.adp_ppr_rank || null,
            pos_adp_half_ppr: player.adp_half_ppr_rank || null,
            pos_pts_ppr: player.pos_rank_ppr || null,
            pos_pts_half_ppr: player.pos_rank_half_ppr || null,
          };
        });

        setPortfolioData(playerData);
      } catch (error) {
        console.error("Error fetching bestball player data:", error);
      }
    },
    []
  );

  const fetchDraftPosition = async (draftId, userId) => {
    const cachedDraftData = localStorage.getItem(`draftData_${draftId}`);
    if (cachedDraftData) {
      return JSON.parse(cachedDraftData);
    }

    try {
      const response = await fetch(
        `https://api.sleeper.app/v1/draft/${draftId}`
      );
      const draftData = await response.json();

      // Extract draft positions for all users
      const draftPositions = Object.entries(draftData.draft_order).reduce(
        (acc, [userId, draftSlot]) => {
          acc[userId] = {
            draftSlot,
            rosterId: draftData.slot_to_roster_id[draftSlot],
          };
          return acc;
        },
        {}
      );

      // Cache the draft positions in localStorage
      localStorage.setItem(
        `draftData_${draftId}`,
        JSON.stringify(draftPositions)
      );

      return draftPositions;
    } catch (error) {
      console.error(`Error fetching draft data for draft ${draftId}:`, error);
      return null;
    }
  };

  const fetchLeagueData = useCallback(async () => {
    try {
      const userResponse = await fetch(
        `https://api.sleeper.app/v1/user/${userName}`
      );
      const userData = await userResponse.json();
      const userId = userData.user_id;
      setUserId(userId);

      const leaguesResponse = await fetch(
        `https://api.sleeper.app/v1/user/${userId}/leagues/nfl/${LEAGUE_YEAR}`
      );
      const leaguesData = await leaguesResponse.json();

      const filteredLeagues = leaguesData.filter(
        (league) =>
          league.settings.best_ball === 1 && league.status === "in_season"
      );

      // Update total drafts
      setTotalDrafts(filteredLeagues.length);

      let oneQBCount = 0;
      let twoQBCount = 0;

      const playerCountMap = {};
      const oneQBCountMap = {};
      const twoQBCountMap = {};

      const standingsPromises = filteredLeagues.map(async (league) => {
        const standingsResponse = await fetch(
          `https://api.sleeper.app/v1/league/${league.league_id}/rosters`
        );
        const standingsData = await standingsResponse.json();

        console.log(
          "Fetched standings data for league:",
          league.league_id,
          standingsData
        );

        const isTwoQBLeague = league.roster_positions.includes("SUPER_FLEX");

        if (isTwoQBLeague) {
          twoQBCount++;
        } else {
          oneQBCount++;
        }

        standingsData.forEach((roster) => {
          if (roster.owner_id === userId) {
            const players = roster.players || [];

            players.forEach((playerId) => {
              if (playerId !== 0) {
                playerCountMap[playerId] = (playerCountMap[playerId] || 0) + 1;

                if (isTwoQBLeague) {
                  twoQBCountMap[playerId] = (twoQBCountMap[playerId] || 0) + 1;
                } else {
                  oneQBCountMap[playerId] = (oneQBCountMap[playerId] || 0) + 1;
                }
              }
            });
          }
        });

        const sortedTeams = standingsData.sort(
          (a, b) => b.settings.fpts - a.settings.fpts
        );

        console.log("Sorted teams for league:", league.league_id, sortedTeams);

        sortedTeams.forEach((team, index) => {
          team.position = index + 1;
        });

        const userTeam = sortedTeams.find((team) => team.owner_id === userId);
        const userPosition = userTeam ? userTeam.position : null;

        console.log(
          "League ID:",
          league.league_id,
          "User Team:",
          userTeam,
          "User Position:",
          userPosition
        );

        console.log("League object before adding to leagues state:", {
          ...league,
          teams: sortedTeams,
          userPosition,
          userRosterSettings: userTeam ? userTeam.settings : {},
        });

        return {
          ...league,
          teams: sortedTeams,
          userPosition,
          userRosterSettings: userTeam ? userTeam.settings : {},
        };
      });

      const leaguesWithTeams = await Promise.all(standingsPromises);

      const sortedLeagues = leaguesWithTeams.sort(
        (a, b) => a.userPosition - b.userPosition
      );

      // Add draft position to the sorted league data
      const leaguesWithDraftPositions = await Promise.all(
        sortedLeagues.map(async (league) => {
          const draftPositions = await fetchDraftPosition(
            league.draft_id,
            userId
          );

          const userDraftPosition =
            draftPositions?.[userId]?.draftSlot || "N/A";
          return {
            ...league,
            draftPositions,
            userDraftPosition,
          };
        })
      );

      setLeagues(leaguesWithDraftPositions);
      console.log("Updated leagues state:", leaguesWithDraftPositions);

      // Add a log to inspect leagues state after setting it
      console.log("Leagues state after update:", leagues);

      setOneQBDrafts(oneQBCount);
      setTwoQBDrafts(twoQBCount);

      const playerIds = Object.keys(playerCountMap);
      fetchBestballPlayerData(
        playerIds,
        playerCountMap,
        oneQBCountMap,
        twoQBCountMap,
        filteredLeagues.length,
        oneQBCount,
        twoQBCount
      );

      console.log("Fetched league data:", sortedLeagues);
      console.log("Player count map:", playerCountMap);
    } catch (error) {
      console.error("Error fetching league data:", error);
    }
  }, [userName, LEAGUE_YEAR, fetchBestballPlayerData]);

  useEffect(() => {
    fetchLeagueData();
  }, [fetchLeagueData]);

  useEffect(() => {
    if (activeTab === "Portfolio") {
      localStorage.setItem(
        "FantasyHelperBestballPortfolio",
        JSON.stringify(portfolioData)
      );
      console.log("Portfolio data saved to localStorage:", portfolioData);
    }
  }, [activeTab, portfolioData]);

  const totalOneQBLeagues = oneQBDrafts;
  const totalTwoQBLeagues = twoQBDrafts;
  const totalLeagues = totalDrafts;

  // Sorting function
  const handleSort = (key, defaultDirection = "ascending") => {
    setSortConfig((prevConfig) => {
      const isSameKey = prevConfig.key === key;
      const newDirection = isSameKey
        ? prevConfig.direction === "ascending"
          ? "descending"
          : "ascending"
        : defaultDirection;
      console.log("Is same key:", isSameKey);
      console.log("Previous config:", prevConfig);
      console.log("New config:", { key, direction: newDirection });
      return { key, direction: newDirection };
    });
  };

  // Revert sorting logic to handle values as they are
  const sortedPortfolioData = [...portfolioData].sort((a, b) => {
    if (!sortConfig.key) return 0;

    const aValue = a[sortConfig.key] ?? -Infinity;
    const bValue = b[sortConfig.key] ?? -Infinity;

    if (sortConfig.direction === "ascending") {
      return aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
    } else {
      return aValue < bValue ? 1 : aValue > bValue ? -1 : 0;
    }
  });

  // Ensure diff column is properly calculated and sortable
  portfolioData.forEach((player) => {
    player.diff =
      player.pts_ppr && player.pos_pts_ppr && player.pos_adp_2qb
        ? player.pos_adp_2qb - player.pos_pts_ppr
        : null;
  });

  const getSortIcon = (key) => {
    if (sortConfig.key !== key) return "\u2195"; // Up-down arrow for unsorted
    return sortConfig.direction === "ascending" ? "\u2191" : "\u2193"; // Up or down arrow
  };

  const handleOpenModal = (league) => {
    console.log("Opening modal for league:", league);
    setSelectedDraft(league);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    console.log("Closing modal");
    setSelectedDraft(null);
    setIsModalOpen(false);
  };

  const getFilteredLeagues = () => {
    return leagues.filter((league) => {
      // Determine team count from the league object (prefer teams array if present)
      const teamCount =
        league.teams?.length ??
        league.roster_count ??
        league.settings?.team_count ??
        null;
      const is12Team = teamCount === 12;
      const is1QB = !league.roster_positions.includes("SUPER_FLEX");
      const is2QB = league.roster_positions.includes("SUPER_FLEX");

      // If the user does not want non-12-team drafts, exclude any league that is not 12 teams
      if (!showNon12TeamDrafts && !is12Team) return false;

      // Apply 1QB/2QB filters
      if (!show1QB && is1QB) return false;
      if (!show2QB && is2QB) return false;

      return true;
    });
  };

  const calculateMyData = (filteredLeagues) => {
    const draftPositionStats = {};

    filteredLeagues.forEach((league) => {
      const userDraftPosition = league.userDraftPosition;
      if (userDraftPosition === "N/A") return;

      if (!draftPositionStats[userDraftPosition]) {
        draftPositionStats[userDraftPosition] = {
          count: 0,
          totalPosition: 0,
          no1: 0,
        };
      }

      draftPositionStats[userDraftPosition].count += 1;
      draftPositionStats[userDraftPosition].totalPosition += userDraftPosition;
      if (userDraftPosition === 1) {
        draftPositionStats[userDraftPosition].no1 += 1;
      }
    });

    return Object.entries(draftPositionStats).map(([position, stats]) => ({
      position,
      count: stats.count,
      averagePosition: (stats.totalPosition / stats.count).toFixed(2),
      no1: stats.no1,
    }));
  };

  const calculateGeneralData = (filteredLeagues) => {
    const draftPositionStats = {};

    filteredLeagues.forEach((league) => {
      league.teams.forEach((team) => {
        const draftPosition = team.position;
        if (!draftPosition) return;

        if (!draftPositionStats[draftPosition]) {
          draftPositionStats[draftPosition] = {
            totalPosition: 0,
            count: 0,
            no1: 0,
          };
        }

        draftPositionStats[draftPosition].count += 1;
        draftPositionStats[draftPosition].totalPosition += draftPosition;
        if (draftPosition === 1) {
          draftPositionStats[draftPosition].no1 += 1;
        }
      });
    });

    return Object.entries(draftPositionStats).map(([position, stats]) => ({
      position,
      averagePosition: (stats.totalPosition / stats.count).toFixed(2),
      no1: stats.no1,
    }));
  };

  // Memoize the filtered data and calculations to update when filters change
  const filteredLeagues = useMemo(() => getFilteredLeagues(), [leagues, showNon12TeamDrafts, show1QB, show2QB]);
  const myData = useMemo(() => calculateMyData(filteredLeagues), [filteredLeagues]);
  const generalData = useMemo(() => calculateGeneralData(filteredLeagues), [filteredLeagues]);

  return (
    <div className="dashboard-container">
      <div className="header-container">
        <div className="draftname">
          <h1>Bestball Overview</h1>
          <span>{userName}</span>
        </div>
      </div>

      <div className="tab-container">
        <button
          className={`tab-button ${activeTab === "Results" ? "active" : ""}`}
          onClick={() => setActiveTab("Results")}
        >
          Results
        </button>
        <button
          className={`tab-button ${activeTab === "Portfolio" ? "active" : ""}`}
          onClick={() => setActiveTab("Portfolio")}
        >
          Portfolio
        </button>
        <button
          className={`tab-button ${activeTab === "Stats" ? "active" : ""}`}
          onClick={() => setActiveTab("Stats")}
        >
          Stats
        </button>
      </div>

      <div className="tab-content">
        {activeTab === "Results" && (
          <div className="bestball-grid">
            <div className="bestball-grid-header">League Name</div>
            <div className="bestball-grid-header">Draft Position</div>
            <div className="bestball-grid-header">Position</div>
            <div className="bestball-grid-header">Record</div>
            <div className="bestball-grid-header">Links</div>

            {leagues.length > 0 ? (
              leagues.map((league) => (
                <React.Fragment key={league.league_id}>
                  <div className="bestball-grid-item">
                    <span
                      className="toggle-button"
                      onClick={() => handleToggle(league.league_id)}
                    >
                      {expandedLeagueIds.has(league.league_id) ? "▼" : "►"}{" "}
                      {league.name}
                    </span>
                  </div>
                  <div className="bestball-grid-item">
                    {league.userDraftPosition || "-"}
                  </div>
                  <div className="bestball-grid-item">
                    {console.log("JSX League:", league)}
                    {console.log(
                      "Rendering league.userPosition:",
                      league.userPosition
                    )}
                    {league.userPosition || "-"}
                    <span> </span>
                    {league.userPosition === 1 && (
                      <FontAwesomeIcon
                        icon={faTrophy}
                        style={{ color: "#FFD700", marginRight: "5px" }}
                      />
                    )}
                    {league.userPosition === 2 && (
                      <FontAwesomeIcon
                        icon={faTrophy}
                        style={{ color: "lightgrey", marginRight: "5px" }}
                      />
                    )}
                    {league.userPosition === 3 && (
                      <FontAwesomeIcon
                        icon={faTrophy}
                        style={{ color: "#cd7f32", marginRight: "5px" }}
                      />
                    )}
                  </div>
                  <div className="bestball-grid-item">
                    {league.userRosterSettings?.wins || 0}-
                    {league.userRosterSettings?.losses || 0}-
                    {league.userRosterSettings?.ties || 0}
                  </div>
                  <div className="bestball-grid-item">
                    <a
                      href={`https://sleeper.app/leagues/${league.league_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ marginRight: "10px" }}
                    >
                      <FontAwesomeIcon icon={faExternalLinkAlt} />
                    </a>
                    {league.draft_id && (
                      <FontAwesomeIcon
                        icon={faTableCells}
                        className="league-action-icon"
                        onClick={() => handleOpenModal(league)}
                      />
                    )}
                  </div>
                  {expandedLeagueIds.has(league.league_id) && (
                    <div className="bestball-details">
                      <div className="team-grid">
                        <div className="team-grid-header">Position</div>
                        <div className="team-grid-header">Team Name</div>
                        <div className="team-grid-header">FPTS</div>
                        <div className="team-grid-header">Record</div>

                        {league.teams.map((team) => (
                          <React.Fragment key={team.roster_id}>
                            <div className="team-grid-item">
                              {team.position}
                            </div>
                            <div className="team-grid-item">
                              {team.owner_id === userId ? (
                                <span className="user-position">
                                  {userName}
                                </span>
                              ) : (
                                `Team ${team.position}`
                              )}
                            </div>
                            <div className="team-grid-item">
                              {team.settings.fpts}
                            </div>
                            <div className="team-grid-item">
                              {team.settings.wins}-{team.settings.losses}-
                              {team.settings.ties}
                            </div>
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                  )}
                </React.Fragment>
              ))
            ) : (
              <div className="bestball-grid-item">
                No bestball leagues found.
              </div>
            )}
          </div>
        )}

        {activeTab === "Portfolio" && (
          <div className="portfolio-container">
            <div className="portfolio-left-section">
              <div className="portfolio-summary-grid">
                <div className="portfolio-summary-header">1QB Leagues</div>
                <div className="portfolio-summary-header">2QB Leagues</div>
                <div className="portfolio-summary-header">Total Leagues</div>

                <div className="portfolio-summary-item">
                  {totalOneQBLeagues}
                </div>
                <div className="portfolio-summary-item">
                  {totalTwoQBLeagues}
                </div>
                <div className="portfolio-summary-item">{totalLeagues}</div>
              </div>

              <div className="filter-container">
                <span className="filter-label">Filter:</span>
                <div className="filter-buttons">
                  <button
                    className={`filter-button ${
                      selectedPosition === "QB" ? "qb-active" : ""
                    }`}
                    onClick={() =>
                      setSelectedPosition((prev) =>
                        prev === "QB" ? null : "QB"
                      )
                    }
                  >
                    QB
                  </button>
                  <button
                    className={`filter-button ${
                      selectedPosition === "RB" ? "rb-active" : ""
                    }`}
                    onClick={() =>
                      setSelectedPosition((prev) =>
                        prev === "RB" ? null : "RB"
                      )
                    }
                  >
                    RB
                  </button>
                  <button
                    className={`filter-button ${
                      selectedPosition === "WR" ? "wr-active" : ""
                    }`}
                    onClick={() =>
                      setSelectedPosition((prev) =>
                        prev === "WR" ? null : "WR"
                      )
                    }
                  >
                    WR
                  </button>
                  <button
                    className={`filter-button ${
                      selectedPosition === "TE" ? "te-active" : ""
                    }`}
                    onClick={() =>
                      setSelectedPosition((prev) =>
                        prev === "TE" ? null : "TE"
                      )
                    }
                  >
                    TE
                  </button>
                </div>
              </div>
            </div>

            <div className="portfolio-grid">
              {/* Header row with spacers */}
              <div
                className={`portfolio-grid-header ${
                  sortConfig.key === "name" ? "active" : ""
                }`}
                onClick={() => handleSort("name", "ascending")}
              >
                Player Name{" "}
                <span className="sort-icon">{getSortIcon("name")}</span>
              </div>
              <div className="portfolio-grid-spacer" />
              <div
                className={`portfolio-grid-header ${
                  sortConfig.key === "position" ? "active" : ""
                }`}
                onClick={() => handleSort("position", "ascending")}
              >
                POS <span className="sort-icon">{getSortIcon("position")}</span>
              </div>
              <div
                className={`portfolio-grid-header ${
                  sortConfig.key === "oneQBCount" ? "active" : ""
                }`}
                onClick={() => handleSort("oneQBCount", "descending")}
              >
                1QB{" "}
                <span className="sort-icon">{getSortIcon("oneQBCount")}</span>
              </div>
              <div
                className={`portfolio-grid-header ${
                  sortConfig.key === "twoQBCount" ? "active" : ""
                }`}
                onClick={() => handleSort("twoQBCount", "descending")}
              >
                2QB{" "}
                <span className="sort-icon">{getSortIcon("twoQBCount")}</span>
              </div>
              <div
                className={`portfolio-grid-header ${
                  sortConfig.key === "totalCount" ? "active" : ""
                }`}
                onClick={() => handleSort("totalCount", "descending")}
              >
                Total{" "}
                <span className="sort-icon">{getSortIcon("totalCount")}</span>
              </div>
              <div className="portfolio-grid-spacer" />
              <div
                className={`portfolio-grid-header ${
                  sortConfig.key === "pos_adp_2qb" ? "active" : ""
                }`}
                onClick={() => handleSort("pos_adp_2qb", "ascending")}
              >
                Drafted As{" "}
                <span className="sort-icon">{getSortIcon("pos_adp_2qb")}</span>
              </div>
              <div
                className={`portfolio-grid-header ${
                  sortConfig.key === "pos_pts_ppr" ? "active" : ""
                }`}
                onClick={() => handleSort("pos_pts_ppr", "ascending")}
              >
                Points As{" "}
                <span className="sort-icon">{getSortIcon("pos_pts_ppr")}</span>
              </div>
              <div
                className={`portfolio-grid-header ${
                  sortConfig.key === "pts_ppr" ? "active" : ""
                }`}
                onClick={() => handleSort("pts_ppr", "descending")}
              >
                Points{" "}
                <span className="sort-icon">{getSortIcon("pts_ppr")}</span>
              </div>
              <div
                className={`portfolio-grid-header ${
                  sortConfig.key === "diff" ? "active" : ""
                }`}
                onClick={() => handleSort("diff", "descending")}
              >
                Diff <span className="sort-icon">{getSortIcon("diff")}</span>
              </div>

              {/* Data rows with spacers */}
              {sortedPortfolioData
                .filter((player) =>
                  selectedPosition ? player.position === selectedPosition : true
                )
                .map((player) => (
                  <React.Fragment key={player.name}>
                    <div className="portfolio-grid-item">{player.name}</div>
                    <div className="portfolio-grid-spacer" />
                    <div className="portfolio-grid-item">{player.position}</div>
                    <div className="portfolio-grid-item">
                      <span className="count">{player.oneQBCount}</span>{" "}
                      <span className="percentage">
                        ({player.oneQBPercentage}%)
                      </span>
                    </div>
                    <div className="portfolio-grid-item">
                      <span className="count">{player.twoQBCount}</span>{" "}
                      <span className="percentage">
                        ({player.twoQBPercentage}%)
                      </span>
                    </div>
                    <div className="portfolio-grid-item">
                      <span className="count">{player.totalCount}</span>{" "}
                      <span className="percentage">
                        ({player.totalPercentage}%)
                      </span>
                    </div>
                    <div className="portfolio-grid-spacer" />
                    <div className="portfolio-grid-item">
                      {player.position}
                      {player.pos_adp_2qb ? player.pos_adp_2qb : ""}
                    </div>
                    <div className="portfolio-grid-item">
                      {player.pts_ppr
                        ? `${player.position}${player.pos_pts_ppr || ""}`
                        : "-"}
                    </div>
                    <div className="portfolio-grid-item">
                      {player.pts_ppr || "-"}
                    </div>
                    <div
                      className={`portfolio-grid-item diff-column ${
                        player.pts_ppr &&
                        player.pos_pts_ppr &&
                        player.pos_adp_2qb
                          ? player.pos_adp_2qb - player.pos_pts_ppr > 0
                            ? "positive-diff"
                            : player.pos_adp_2qb - player.pos_pts_ppr < 0
                            ? "negative-diff"
                            : "neutral-diff"
                          : "neutral-diff"
                      }`}
                    >
                      {player.pts_ppr &&
                      player.pos_pts_ppr &&
                      player.pos_adp_2qb
                        ? player.pos_adp_2qb - player.pos_pts_ppr
                        : "-"}
                    </div>
                  </React.Fragment>
                ))}
            </div>
          </div>
        )}

        {activeTab === "Stats" && (
          <div className="stats-container">
            <div className="stats-filters">
              <label>
                <input
                  type="checkbox"
                  checked={showNon12TeamDrafts}
                  onChange={() => setShowNon12TeamDrafts((prev) => !prev)}
                />
                Show non-12 team drafts
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={show1QB}
                  onChange={() => setShow1QB((prev) => !prev)}
                />
                1QB
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={show2QB}
                  onChange={() => setShow2QB((prev) => !prev)}
                />
                2QB
              </label>
            </div>

            <div className="stats-tables">
              <div className="my-data">
                <h3>My Data</h3>
                <table>
                  <thead>
                    <tr>
                      <th>Draft Position</th>
                      <th>Count</th>
                      <th>Average Position</th>
                      <th>No1</th>
                    </tr>
                  </thead>
                  <tbody>
                    {myData.length > 0 ? (
                      myData.map((row) => (
                        <tr key={row.position}>
                          <td>{row.position}</td>
                          <td>{row.count}</td>
                          <td>{row.averagePosition}</td>
                          <td>{row.no1}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="4">No data available</td>
                      </tr>
                    )}
                    {myData.length > 0 && (
                      <tr className="stats-summary-row">
                        <td><strong>Total</strong></td>
                        <td><strong>{myData.reduce((sum, row) => sum + row.count, 0)}</strong></td>
                        <td><strong>{(myData.reduce((sum, row) => sum + parseFloat(row.averagePosition) * row.count, 0) / myData.reduce((sum, row) => sum + row.count, 0)).toFixed(2)}</strong></td>
                        <td><strong>{myData.reduce((sum, row) => sum + row.no1, 0)}</strong></td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="general-data">
                <h3>General Data</h3>
                <table>
                  <thead>
                    <tr>
                      <th>Draft Position</th>
                      <th>Average Position</th>
                      <th>No1</th>
                    </tr>
                  </thead>
                  <tbody>
                    {generalData.map((row) => (
                      <tr key={row.position}>
                        <td>{row.position}</td>
                        <td>{row.averagePosition}</td>
                        <td>{row.no1}</td>
                      </tr>
                    ))}
                    {generalData.length > 0 && (
                      <tr className="stats-summary-row">
                        <td><strong>Total</strong></td>
                        <td><strong>{(generalData.reduce((sum, row) => sum + parseFloat(row.averagePosition), 0) / generalData.length).toFixed(2)}</strong></td>
                        <td><strong>{generalData.reduce((sum, row) => sum + row.no1, 0)}</strong></td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {isModalOpen && selectedDraft && (
        <DraftModal
          league={{
            ...selectedDraft,
            teams: selectedDraft.teams.length, // Convert teams array to number
          }}
          draftId={selectedDraft.draft_id}
          userId={userId}
          onClose={handleCloseModal}
        />
      )}

      <span hidden>{userId}</span>
    </div>
  );
}

export default BestballList;

import React, { useEffect, useState, useCallback } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faExternalLinkAlt, faTrophy } from "@fortawesome/free-solid-svg-icons";
import { useParams } from "react-router-dom";
import "./BestballList.css";

// Add a mock flag
const mock = false; // Set to true for mock data, false for production

// Define the base URL based on the mock flag
const BASE_URL = mock
  ? "http://localhost:5000"
  : "https://shaggy-latashia-carnade-2ea2054a.koyeb.app";

function BestballList() {
  const { userName } = useParams();
  const [userId, setUserId] = useState(null);
  const [leagues, setLeagues] = useState([]);
  const [expandedLeagueIds, setExpandedLeagueIds] = useState(new Set());
  const [activeTab, setActiveTab] = useState("Results"); // New state for active tab
  const [portfolioData, setPortfolioData] = useState([]); // New state for portfolio data
  const [selectedPosition, setSelectedPosition] = useState(null); // State for filtering by position
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
        playerlist: playerIds, // Input list of player IDs
      };

      try {
        const response = await fetch(`${BASE_URL}/getplayers/bestball`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requests),
        });

        const data = await response.json();

        // Access the players array from the data object
        const playerData = data.players.map((player) => {
          const totalCount = playerCountMap[player.id] || 0;
          const oneQBCount = oneQBCountMap[player.id] || 0;
          const twoQBCount = twoQBCountMap[player.id] || 0;

          // Calculate percentages
          const totalPercentage =
            totalDrafts > 0 ? ((totalCount / totalDrafts) * 100).toFixed(0) : 0;
          const oneQBPercentage =
            oneQBDrafts > 0 ? ((oneQBCount / oneQBDrafts) * 100).toFixed(0) : 0;
          const twoQBPercentage =
            twoQBDrafts > 0 ? ((twoQBCount / twoQBDrafts) * 100).toFixed(0) : 0;

          return {
            name: player.name,
            position: player.position, // Include the position field
            totalCount, // Total count as a separate value
            totalPercentage, // Total percentage as a separate value
            oneQBCount, // 1QB count as a separate value
            oneQBPercentage, // 1QB percentage as a separate value
            twoQBCount, // 2QB count as a separate value
            twoQBPercentage, // 2QB percentage as a separate value
          };
        });

        setPortfolioData(playerData); // Save the processed data to state
        console.log("Fetched player data:", playerData);
      } catch (error) {
        console.error("Error fetching bestball player data:", error);
      }
    },
    []
  );

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

      const totalDrafts = filteredLeagues.length; // Count total in_season drafts
      let oneQBDrafts = 0; // Count of 1QB drafts
      let twoQBDrafts = 0; // Count of 2QB drafts

      const playerCountMap = {}; // Dictionary to track total player counts
      const oneQBCountMap = {}; // Dictionary to track 1QB league counts
      const twoQBCountMap = {}; // Dictionary to track 2QB league counts

      const standingsPromises = filteredLeagues.map(async (league) => {
        const standingsResponse = await fetch(
          `https://api.sleeper.app/v1/league/${league.league_id}/rosters`
        );
        const standingsData = await standingsResponse.json();

        // Check if the league is a 2QB league
        const isTwoQBLeague = league.roster_positions.includes("SUPER_FLEX");

        // Increment the appropriate draft count
        if (isTwoQBLeague) {
          twoQBDrafts++;
        } else {
          oneQBDrafts++;
        }

        // Process each roster in the league
        standingsData.forEach((roster) => {
          // Only count players if the owner_id matches the userId
          if (roster.owner_id === userId) {
            const players = roster.players || []; // Get the players array

            // Increment the count for each player_id
            players.forEach((playerId) => {
              if (playerId !== 0) {
                // Update total count
                playerCountMap[playerId] = (playerCountMap[playerId] || 0) + 1;

                // Update 1QB or 2QB count
                if (isTwoQBLeague) {
                  twoQBCountMap[playerId] = (twoQBCountMap[playerId] || 0) + 1;
                } else {
                  oneQBCountMap[playerId] = (oneQBCountMap[playerId] || 0) + 1;
                }
              }
            });
          }
        });

        // Sort teams by FPTS in descending order
        const sortedTeams = standingsData.sort(
          (a, b) => b.settings.fpts - a.settings.fpts
        );

        // Assign positions based on the sorted order
        sortedTeams.forEach((team, index) => {
          team.position = index + 1; // 1-based index for position
        });

        // Find the user's team and assign the user's position
        const userTeam = sortedTeams.find((team) => team.owner_id === userId);
        const userPosition = userTeam ? userTeam.position : null;

        return {
          ...league,
          teams: sortedTeams,
          userPosition,
          userRosterSettings: userTeam ? userTeam.settings : {},
        };
      });

      const leaguesWithTeams = await Promise.all(standingsPromises);

      // Sort leagues by user position (lowest position at the top)
      const sortedLeagues = leaguesWithTeams.sort(
        (a, b) => a.userPosition - b.userPosition
      );

      setLeagues(sortedLeagues);

      // Fetch player data using playerCountMap
      const playerIds = Object.keys(playerCountMap); // Extract player IDs
      fetchBestballPlayerData(
        playerIds,
        playerCountMap,
        oneQBCountMap,
        twoQBCountMap,
        totalDrafts, // Pass total drafts for percentage calculation
        oneQBDrafts, // Pass 1QB drafts for percentage calculation
        twoQBDrafts // Pass 2QB drafts for percentage calculation
      );

      console.log("Fetched league data:", sortedLeagues);
      console.log("Player count map:", playerCountMap); // Log the player count map
    } catch (error) {
      console.error("Error fetching league data:", error);
    }
  }, [userName, LEAGUE_YEAR, fetchBestballPlayerData]);

  useEffect(() => {
    fetchLeagueData();
  }, [fetchLeagueData]);

  useEffect(() => {
    if (activeTab === "Portfolio") {
      // Save portfolio data to localStorage when the Portfolio tab is opened
      localStorage.setItem(
        "FantasyHelperBestballPortfolio",
        JSON.stringify(portfolioData)
      );
      console.log("Portfolio data saved to localStorage:", portfolioData);
    }
  }, [activeTab, portfolioData]);

  return (
    <div className="dashboard-container">
      <div className="header-container">
        <div className="draftname">
          <h1>Bestball Overview</h1>
          <span>{userName}</span>
        </div>
      </div>

      {/* Tab Buttons */}
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
      </div>

      {/* Tab Content */}
      <div className="tab-content">
        {activeTab === "Results" && (
          <div className="bestball-grid">
            <div className="league-grid-header">League Name</div>
            <div className="league-grid-header">Position</div>
            <div className="league-grid-header">Record</div>
            <div className="league-grid-header">Links</div>

            {leagues.length > 0 ? (
              leagues.map((league) => (
                <React.Fragment key={league.league_id}>
                  <div className="league-grid-item">
                    <span
                      className="toggle-button"
                      onClick={() => handleToggle(league.league_id)}
                    >
                      {expandedLeagueIds.has(league.league_id) ? "▼" : "►"}{" "}
                      {league.name}
                    </span>
                  </div>
                  <div className="league-grid-item">
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
                  <div className="league-grid-item">
                    {league.userRosterSettings?.wins || 0}-
                    {league.userRosterSettings?.losses || 0}-
                    {league.userRosterSettings?.ties || 0}
                  </div>
                  <div className="league-grid-item">
                    <a
                      href={`https://sleeper.app/leagues/${league.league_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <FontAwesomeIcon icon={faExternalLinkAlt} />
                    </a>
                  </div>
                  {expandedLeagueIds.has(league.league_id) && (
                    <div className="league-details">
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
              <div className="league-grid-item">No bestball leagues found.</div>
            )}
          </div>
        )}

        {activeTab === "Portfolio" && (
          <div className="filter-container">
            <span className="filter-label">Filter:</span>
            <div className="filter-buttons">
              <button
                className={`filter-button ${
                  selectedPosition === "QB" ? "qb-active" : ""
                }`}
                onClick={() =>
                  setSelectedPosition((prev) => (prev === "QB" ? null : "QB"))
                }
              >
                QB
              </button>
              <button
                className={`filter-button ${
                  selectedPosition === "RB" ? "rb-active" : ""
                }`}
                onClick={() =>
                  setSelectedPosition((prev) => (prev === "RB" ? null : "RB"))
                }
              >
                RB
              </button>
              <button
                className={`filter-button ${
                  selectedPosition === "WR" ? "wr-active" : ""
                }`}
                onClick={() =>
                  setSelectedPosition((prev) => (prev === "WR" ? null : "WR"))
                }
              >
                WR
              </button>
              <button
                className={`filter-button ${
                  selectedPosition === "TE" ? "te-active" : ""
                }`}
                onClick={() =>
                  setSelectedPosition((prev) => (prev === "TE" ? null : "TE"))
                }
              >
                TE
              </button>
            </div>
          </div>
        )}

        {activeTab === "Portfolio" && (
          <div className="portfolio-grid">
            <div className="portfolio-grid-header">Player Name</div>
            <div className="portfolio-grid-header">POS</div>
            <div className="portfolio-grid-header">1QB</div>
            <div className="portfolio-grid-header">2QB</div>
            <div className="portfolio-grid-header">Total</div>

            {portfolioData
              .filter((player) =>
                selectedPosition ? player.position === selectedPosition : true
              ) // Filter by position if a position is selected
              .slice() // Create a shallow copy to avoid mutating the original state
              .sort((a, b) => {
                // Primary sort: Total count (descending)
                if (b.totalCount !== a.totalCount) {
                  return b.totalCount - a.totalCount;
                }

                // Secondary sort: Player name (ascending)
                return a.name.localeCompare(b.name);
              })
              .map((player) => (
                <React.Fragment key={player.name}>
                  <div className="portfolio-grid-item">{player.name}</div>
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
                </React.Fragment>
              ))}
          </div>
        )}
      </div>

      <span hidden>{userId}</span>
    </div>
  );
}

export default BestballList;

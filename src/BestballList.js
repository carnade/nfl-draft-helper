import React, { useEffect, useState, useCallback } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faExternalLinkAlt, faTrophy } from "@fortawesome/free-solid-svg-icons";
import { useParams } from "react-router-dom";
import "./BestballList.css";

function BestballList() {
  const { userName } = useParams();
  const [userId, setUserId] = useState(null);
  const [leagues, setLeagues] = useState([]);
  const [expandedLeagueIds, setExpandedLeagueIds] = useState(new Set());
  const [activeTab, setActiveTab] = useState("Results"); // New state for active tab
  const [exposureData, setExposureData] = useState([]); // New state for exposure data
  const LEAGUE_YEAR = 2025;
  const mock = true; // Set to true for mock data

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
    async (playerIds, playerCountMap) => {
      const requests = {
        playerlist: playerIds, // Input list of player IDs
      };

      try {
        let response;
        if (mock) {
          //response = await fetch("/bestball_players_mock.json", {
          response = await fetch("http://localhost:5000/getplayers/bestball", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(requests),
          });
        } else {
          response = await fetch(
            "https://shaggy-latashia-carnade-2ea2054a.koyeb.app/getplayers/bestball",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify(requests),
            }
          );
        }
        const data = await response.json();

        // Map player names to their counts
        const playerData = data.map((player) => ({
          name: player.name,
          count: playerCountMap[player.id] || 0,
        }));

        setExposureData(playerData); // Save the processed data to state
      } catch (error) {
        console.error("Error fetching bestball player data:", error);
      }
    },
    [mock]
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
        (league) => league.settings.best_ball === 1
      );

      const playerCountMap = {}; // Dictionary to track player counts

      const standingsPromises = filteredLeagues.map(async (league) => {
        const standingsResponse = await fetch(
          `https://api.sleeper.app/v1/league/${league.league_id}/rosters`
        );
        const standingsData = await standingsResponse.json();

        // Process each roster in the league
        standingsData.forEach((roster) => {
          const players = roster.players || []; // Get the players array
BARA RÄKNA OM MITT LAG
          // Increment the count for each player_id
          players.forEach((playerId) => {
            if (playerId !== 0) {
              if (playerCountMap[playerId]) {
                playerCountMap[playerId]++;
              } else {
                playerCountMap[playerId] = 1;
              }
            }
          });
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
      fetchBestballPlayerData(playerIds, playerCountMap); // Pass playerCountMap for later use

      console.log("Fetched league data:", sortedLeagues);
      console.log("Player count map:", playerCountMap); // Log the player count map
    } catch (error) {
      console.error("Error fetching league data:", error);
    }
  }, [userName, LEAGUE_YEAR, fetchBestballPlayerData]);

  useEffect(() => {
    fetchLeagueData();
  }, [fetchLeagueData]);

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
          className={`tab-button ${activeTab === "Exposure" ? "active" : ""}`}
          onClick={() => setActiveTab("Exposure")}
        >
          Exposure
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

        {activeTab === "Exposure" && (
          <div className="exposure-grid">
            <div className="exposure-grid-header">Player Name</div>
            <div className="exposure-grid-header">1QB</div>
            <div className="exposure-grid-header">2QB</div>
            <div className="exposure-grid-header">Total</div>

            {exposureData.map((player) => (
              <React.Fragment key={player.name}>
                <div className="exposure-grid-item">{player.name}</div>
                <div className="exposure-grid-item">0</div>
                <div className="exposure-grid-item">0</div>
                <div className="exposure-grid-item">{player.count}</div>
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

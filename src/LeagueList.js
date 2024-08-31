import React, { useEffect, useState, useCallback } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faUserInjured,
  faQuestion,
  faExternalLinkAlt,
} from "@fortawesome/free-solid-svg-icons";
import { useNavigate } from "react-router-dom";

function LeagueList({ userName }) {
  const [userId, setUserId] = useState(null);
  const [leagues, setLeagues] = useState([]);
  const [expandedLeagueIds, setExpandedLeagueIds] = useState(new Set());
  const [playerData, setPlayerData] = useState({});
  const [injuryReport, setInjuryReport] = useState({});
  const [expandedTeams, setExpandedTeams] = useState(new Set());
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [highlightedLeagues, setHighlightedLeagues] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState("");

  const navigate = useNavigate();
  let searchTimeout;
  const mock = false;

  const handleBackClick = () => {
    navigate(-1); // Navigate to the previous page
  };

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

  const handleTeamToggle = (teamAbbreviation) => {
    setExpandedTeams((prevIds) => {
      const newIds = new Set(prevIds);
      if (newIds.has(teamAbbreviation)) {
        newIds.delete(teamAbbreviation);
      } else {
        newIds.add(teamAbbreviation);
      }
      return newIds;
    });
  };

  const handlePlayerClick = (player) => {
    const playerId = `${player.first_name}-${player.last_name}`;

    if (selectedPlayer === playerId) {
      setSelectedPlayer(null);
      setHighlightedLeagues(new Set());
    } else {
      setSelectedPlayer(playerId);
      highlightLeaguesWithPlayer(player.first_name, player.last_name);
    }
  };

  const highlightLeaguesWithPlayer = (firstName, lastName) => {
    const highlightedLeaguesSet = new Set();
    leagues.forEach((league) => {
      Object.keys(playerData[league.league_id]?.players || {}).forEach((p) => {
        const leaguePlayer = playerData[league.league_id]?.players[p];
        if (
          leaguePlayer?.first_name === firstName &&
          leaguePlayer?.last_name === lastName
        ) {
          highlightedLeaguesSet.add(league.league_id);
        }
      });
    });
    setHighlightedLeagues(highlightedLeaguesSet);
  };

  const handleSearchInputChange = (e) => {
    const query = e.target.value; // Allow spaces in the query
    setSearchQuery(query);

    clearTimeout(window.searchTimeout);

    if (query.trim().length < 3) {
      setSelectedPlayer(null);
      setHighlightedLeagues(new Set());
    } else {
      if (searchTimeout) {
        clearTimeout(searchTimeout); // Clear the previous timeout
      }
      window.searchTimeout = setTimeout(() => searchPlayer(query.trim()), 1000); // Delay search for 2 seconds
    }
  };

  const searchPlayer = (query) => {
    const searchTerms = query.toLowerCase().split(" ").filter(Boolean);
    const highlightedLeaguesSet = new Set();
    let foundPlayerId = null;

    leagues.forEach((league) => {
      Object.keys(playerData[league.league_id]?.players || {}).forEach(
        (playerId) => {
          const player = playerData[league.league_id]?.players[playerId];
          const playerName =
            `${player.first_name} ${player.last_name}`.toLowerCase();

          const matches = searchTerms.every((term) =>
            playerName.includes(term)
          );

          if (matches) {
            highlightedLeaguesSet.add(league.league_id);
            foundPlayerId = `${player.first_name}-${player.last_name}`; // Construct playerId properly with names
          }
        }
      );
    });

    if (foundPlayerId) {
      setHighlightedLeagues(highlightedLeaguesSet);
      setSelectedPlayer(foundPlayerId);
    } else {
      // If no player matches, clear highlights
      setSelectedPlayer(null);
      setHighlightedLeagues(new Set());
    }
  };

  const fetchPlayerData = useCallback(
    async (leagues) => {
      const requests = {
        username: userName,
        league: leagues.map((league) => {
          const leagueId = league.league_id;
          const playerlist = [
            ...league.userRoster.starters,
            ...league.userRoster.reserve,
            ...league.userRoster.taxi,
            ...league.userRoster.uniquePlayers,
          ];
          return {
            league_id: leagueId,
            playerlist,
          };
        }),
      };

      try {
        let response;
        if (mock) {
          response = await fetch("http://localhost:5000/getplayers", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(requests),
          });
        } else {
          response = await fetch(
            "https://silent-dew-3400.ploomberapp.io/getplayers",
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
        const playerDataMap = {};
        data.forEach((leagueData) => {
          playerDataMap[leagueData.league_id] = leagueData;
        });
        setPlayerData(playerDataMap);
      } catch (error) {
        console.error("Error fetching player data:", error);
      }
    },
    [userName, mock] // Add necessary dependencies here
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
        `https://api.sleeper.app/v1/user/${userId}/leagues/nfl/2024`
      );
      const leaguesData = await leaguesResponse.json();

      const filteredLeagues = leaguesData.filter(
        (league) => league.settings.best_ball === 0
      );

      const leagueDetailsPromises = filteredLeagues.map(async (league) => {
        const leagueId = league.league_id;

        const rostersResponse = await fetch(
          `https://api.sleeper.app/v1/league/${leagueId}/rosters`
        );
        const rostersData = await rostersResponse.json();

        const userRoster = rostersData.find(
          (roster) => roster.owner_id === userId
        );

        if (!userRoster) {
          return null;
        }

        const starters = userRoster.starters || [];
        const reserve = userRoster.reserve || [];
        const taxi = userRoster.taxi || [];
        const players = userRoster.players || [];

        const uniquePlayers = players.filter(
          (player) =>
            !starters.includes(player) &&
            !reserve.includes(player) &&
            !taxi.includes(player)
        );

        return {
          ...league,
          userRoster: {
            starters,
            uniquePlayers,
            reserve,
            taxi,
            settings: userRoster.settings,
          },
        };
      });

      const leagueDetails = await Promise.all(leagueDetailsPromises);
      const filteredLeagueDetails = leagueDetails.filter(
        (league) => league !== null
      );

      setLeagues(filteredLeagueDetails);
      await fetchPlayerData(filteredLeagueDetails);
    } catch (error) {
      console.error("Error fetching league data:", error);
    }
  }, [userName, fetchPlayerData]);

  const fetchInjuryReport = useCallback(async () => {
    try {
      let response;
      if (mock) {
        response = await fetch("/injury_report.json");
      } else {
        response = await fetch("https://silent-dew-3400.ploomberapp.io/teams", {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        });
      }
      const data = await response.json();
      setInjuryReport(data);
    } catch (error) {
      console.error("Error fetching injury report:", error);
    }
  }, [mock]);

  useEffect(() => {
    fetchLeagueData();
    fetchInjuryReport();
  }, [fetchLeagueData, fetchInjuryReport]);

  const renderPlayerInfo = (playerId, leagueId) => {
    const player = playerData[leagueId]?.players[playerId];

    if (!player) return null;

    const { first_name, last_name } = player;

    return (
      <div>
        {first_name} {last_name}
      </div>
    );
  };

  const renderInjuryStatus = (playerId, leagueId) => {
    const player = playerData[leagueId]?.players[playerId];
    if (!player) return null;

    const { injury_status } = player;
    let injuryClass = "";

    if (injury_status) {
      injuryClass =
        injury_status === "Questionable" ? "injury-questionable" : "injury";
    }

    return <div className={injuryClass}>{injury_status}</div>;
  };

  const renderPlayerLinks = (player, leagueId) => {
    const yahooId = playerData[leagueId]?.players[player]?.yahoo_id;
    const rotowireId = playerData[leagueId]?.players[player]?.rotowire_id;
    const firstName = playerData[leagueId]?.players[player]?.first_name;
    const lastName = playerData[leagueId]?.players[player]?.last_name;

    return (
      <>
        <span
          style={{
            display: "inline-block",
            marginRight: "5px",
            filter: yahooId ? "none" : "grayscale(100%)",
            pointerEvents: yahooId ? "auto" : "none",
          }}
        >
          <a
            href={
              yahooId ? `https://sports.yahoo.com/nfl/players/${yahooId}` : "#"
            }
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: yahooId ? "inline" : "none" }}
          >
            <img
              src="/yahoo.png"
              alt="Yahoo"
              style={{ width: "20px", height: "20px" }}
            />
          </a>
          {!yahooId && (
            <img
              src="/yahoo.png"
              alt="Yahoo"
              style={{
                width: "20px",
                height: "20px",
                filter: "grayscale(100%)",
              }}
            />
          )}
        </span>
        <span
          style={{
            display: "inline-block",
            filter: rotowireId ? "none" : "grayscale(100%)",
            pointerEvents: rotowireId ? "auto" : "none",
          }}
        >
          <a
            href={
              rotowireId
                ? `https://www.rotowire.com/football/player/${firstName}-${lastName}-${rotowireId}`
                : "#"
            }
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: rotowireId ? "inline" : "none" }}
          >
            <img
              src="/rotowire.png"
              alt="Rotowire"
              style={{ width: "20px", height: "20px", marginRight: "5px" }}
            />
          </a>
          {!rotowireId && (
            <img
              src="/rotowire.png"
              alt="Rotowire"
              style={{
                width: "20px",
                height: "20px",
                filter: "grayscale(100%)",
              }}
            />
          )}
        </span>
      </>
    );
  };

  const sortPlayersByPosition = (playerIds, leagueId) => {
    const positionOrder = { QB: 1, RB: 2, WR: 3, TE: 4, DEF: 5 };
    return playerIds.sort((a, b) => {
      const posA = playerData[leagueId]?.players[a]?.position || "ZZZ";
      const posB = playerData[leagueId]?.players[b]?.position || "ZZZ";
      return (positionOrder[posA] || 99) - (positionOrder[posB] || 99);
    });
  };

  const countInjuriesForReport = (teamInjuries) => {
    let redCount = 0;
    let orangeCount = 0;

    teamInjuries.forEach((player) => {
      const injuryStatus = player?.injury_status;
      if (injuryStatus) {
        if (injuryStatus === "Questionable") {
          orangeCount += 1;
        } else {
          redCount += 1;
        }
      }
    });

    return { redCount, orangeCount };
  };

  const countInjuries = (starters, leagueId) => {
    let redCount = 0;
    let orangeCount = 0;

    starters.forEach((playerId) => {
      const injuryStatus =
        playerData[leagueId]?.players[playerId]?.injury_status;
      if (injuryStatus) {
        if (injuryStatus === "Questionable") {
          orangeCount += 1;
        } else {
          redCount += 1;
        }
      }
    });

    return { redCount, orangeCount };
  };

  const teamFullName = (abbreviation) => {
    const teams = {
      ARI: "Arizona Cardinals",
      ATL: "Atlanta Falcons",
      BAL: "Baltimore Ravens",
      BUF: "Buffalo Bills",
      CAR: "Carolina Panthers",
      CHI: "Chicago Bears",
      CIN: "Cincinnati Bengals",
      CLE: "Cleveland Browns",
      DAL: "Dallas Cowboys",
      DEN: "Denver Broncos",
      DET: "Detroit Lions",
      GB: "Green Bay Packers",
      HOU: "Houston Texans",
      IND: "Indianapolis Colts",
      JAX: "Jacksonville Jaguars",
      KC: "Kansas City Chiefs",
      LAC: "Los Angeles Chargers",
      LAR: "Los Angeles Rams",
      LV: "Las Vegas Raiders",
      MIA: "Miami Dolphins",
      MIN: "Minnesota Vikings",
      NE: "New England Patriots",
      NO: "New Orleans Saints",
      NYG: "New York Giants",
      NYJ: "New York Jets",
      PHI: "Philadelphia Eagles",
      PIT: "Pittsburgh Steelers",
      SEA: "Seattle Seahawks",
      SF: "San Francisco 49ers",
      TB: "Tampa Bay Buccaneers",
      TEN: "Tennessee Titans",
      WAS: "Washington Commanders",
    };
    return teams[abbreviation] || abbreviation;
  };

  return (
    <div className="dashboard-container">
      <div className="header-container">
        <div className="draftname">
          <h1>Leagues Overview</h1>
          <span>{userName}</span>
        </div>
        <div className="button-container">
          <button onClick={handleBackClick} className="back-button">
            <FontAwesomeIcon icon={faArrowLeft} /> Back
          </button>
        </div>
      </div>

      <div className="search-container">
        <label className="search-label">Find a player</label>
        <input
          type="text"
          className="injury-report-search"
          placeholder="Player name"
          value={searchQuery}
          onChange={handleSearchInputChange}
        />
      </div>

      <div className="main-content">
        <div className="league-list-container">
          <div className="league-grid">
            <div className="league-grid-header">League Name</div>
            <div className="league-grid-header">Record</div>
            <div className="league-grid-header">FPTS</div>
            <div className="league-grid-header">Used Waiver Budget</div>
            <div className="league-grid-header">Injuries on starters</div>
            <div className="league-grid-header">Links</div>

            {leagues.length > 0 ? (
              leagues.map((league, index) => {
                const { redCount, orangeCount } = countInjuries(
                  league.userRoster?.starters || [],
                  league.league_id
                );
                return (
                  <React.Fragment key={index}>
                    <div
                      className={`league-grid-item league-name ${
                        highlightedLeagues.has(league.league_id)
                          ? "highlighted-league"
                          : ""
                      }`}
                    >
                      <span
                        className="toggle-button"
                        onClick={() => handleToggle(league.league_id)}
                      >
                        {expandedLeagueIds.has(league.league_id) ? "▼" : "►"}{" "}
                      </span>
                      {league.name}
                    </div>

                    <div className="league-grid-item">
                      {league.userRoster?.settings?.wins}-
                      {league.userRoster?.settings?.losses}-
                      {league.userRoster?.settings?.ties}
                    </div>
                    <div className="league-grid-item">
                      {league.userRoster?.settings?.fpts}
                    </div>
                    <div className="league-grid-item">
                      {league.userRoster?.settings?.waiver_budget_used}/
                      {league.settings.waiver_budget}
                    </div>
                    <div className="league-grid-item">
                      {redCount > 0 && (
                        <>
                          <FontAwesomeIcon
                            icon={faUserInjured}
                            style={{ color: "red" }}
                          />{" "}
                          {redCount}{" "}
                        </>
                      )}
                      {orangeCount > 0 && (
                        <>
                          <FontAwesomeIcon
                            icon={faQuestion}
                            style={{ color: "orange" }}
                          />{" "}
                          {orangeCount}
                        </>
                      )}
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
                        {["starters", "uniquePlayers", "reserve", "taxi"].map(
                          (group, idx) =>
                            (league.userRoster[group] || []).length > 0 && (
                              <div key={idx} className="roster-group">
                                <div className="roster-grid">
                                  <div className="roster-grid-item roster-header">
                                    {group === "uniquePlayers"
                                      ? "Bench"
                                      : group.charAt(0).toUpperCase() +
                                        group.slice(1)}
                                  </div>
                                  <div className="roster-grid-item roster-header">
                                    Position
                                  </div>
                                  <div className="roster-grid-item roster-header">
                                    Status
                                  </div>
                                  <div className="roster-grid-item roster-header">
                                    Links
                                  </div>
                                </div>
                                {sortPlayersByPosition(
                                  league.userRoster[group],
                                  league.league_id
                                )?.map((player, index) => {
                                  const playerInfo =
                                    playerData[league.league_id]?.players[
                                      player
                                    ];
                                  const playerId = `${playerInfo?.first_name}-${playerInfo?.last_name}`;

                                  return (
                                    <div key={index} className="roster-grid">
                                      <div
                                        className={`roster-grid-item ${
                                          selectedPlayer === playerId
                                            ? "selected-player"
                                            : ""
                                        }`}
                                      >
                                        {renderPlayerInfo(
                                          player,
                                          league.league_id
                                        )}
                                      </div>
                                      <div className="roster-grid-item">
                                        {playerInfo?.position || ""}
                                      </div>
                                      <div className="roster-grid-item">
                                        {renderInjuryStatus(
                                          player,
                                          league.league_id
                                        )}
                                      </div>
                                      <div className="roster-grid-item">
                                        {renderPlayerLinks(
                                          player,
                                          league.league_id
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )
                        )}
                      </div>
                    )}
                  </React.Fragment>
                );
              })
            ) : (
              <div className="league-grid-item">No leagues found.</div>
            )}
          </div>
        </div>
        <div className="injury-report-container">
          <h2>Injury Report</h2>
          <div className="injury-report-teams">
            {Object.keys(injuryReport).map((teamAbbreviation) => {
              const teamInjuries = injuryReport[teamAbbreviation];
              const { redCount, orangeCount } =
                countInjuriesForReport(teamInjuries);

              return (
                <div key={teamAbbreviation} className="injury-team">
                  <span
                    className="team-name"
                    onClick={() => handleTeamToggle(teamAbbreviation)}
                  >
                    {expandedTeams.has(teamAbbreviation) ? "▼" : "►"}{" "}
                    {teamFullName(teamAbbreviation)}
                  </span>
                  <div className="team-injury-icons">
                    {redCount > 0 && (
                      <span className="injury-icon">
                        <FontAwesomeIcon
                          icon={faUserInjured}
                          style={{ color: "red" }}
                        />{" "}
                        {redCount}
                      </span>
                    )}
                    {orangeCount > 0 && (
                      <span className="injury-icon">
                        <FontAwesomeIcon
                          icon={faQuestion}
                          style={{ color: "orange" }}
                        />{" "}
                        {orangeCount}
                      </span>
                    )}
                  </div>
                  {expandedTeams.has(teamAbbreviation) && (
                    <div className="team-injury-list">
                      {teamInjuries.map((player, index) => (
                        <div
                          key={index}
                          className={`injury-player ${
                            selectedPlayer ===
                            `${player.first_name}-${player.last_name}`
                              ? "selected-player"
                              : ""
                          }`}
                          onClick={() => handlePlayerClick(player)}
                        >
                          {player.first_name} {player.last_name}
                          <span
                            className={`injury-status ${player.injury_status}`}
                          >
                            {player.injury_status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <span hidden>{userId}</span>
    </div>
  );
}

export default LeagueList;

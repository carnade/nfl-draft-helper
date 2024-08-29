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
  const navigate = useNavigate();

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

  const fetchPlayerData = async (leagues) => {
    const requests = leagues.map((league) => {
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
    });

    try {
      const response = await fetch("https://silent-dew-3400.ploomberapp.io/getplayers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requests),
      });
      const data = await response.json();
      const playerDataMap = {};
      data.forEach((leagueData) => {
        playerDataMap[leagueData.league_id] = leagueData;
      });
      setPlayerData(playerDataMap);
    } catch (error) {
      console.error("Error fetching player data:", error);
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

        // Find the roster for the current user
        const userRoster = rostersData.find(
          (roster) => roster.owner_id === userId
        );

        if (!userRoster) {
          return null; // If no matching roster is found, skip this league
        }

        // Ensure that the arrays are initialized to empty arrays if they are null/undefined
        const starters = userRoster.starters || [];
        const reserve = userRoster.reserve || [];
        const taxi = userRoster.taxi || [];
        const players = userRoster.players || [];

        // Remove players that are also in starters, reserve, or taxi
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
      ); // Filter out any null entries

      setLeagues(filteredLeagueDetails);

      // Fetch player data for the leagues
      await fetchPlayerData(filteredLeagueDetails);
    } catch (error) {
      console.error("Error fetching league data:", error);
    }
  }, [userName]);

  useEffect(() => {
    fetchLeagueData();
  }, [fetchLeagueData]);

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
            display: 'inline-block',
            marginRight: '5px',
            filter: yahooId ? 'none' : 'grayscale(100%)',
            pointerEvents: yahooId ? 'auto' : 'none'
          }}
        >
          <a
            href={yahooId ? `https://sports.yahoo.com/nfl/players/${yahooId}` : '#'}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: yahooId ? 'inline' : 'none' }}
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
              style={{ width: "20px", height: "20px", filter: 'grayscale(100%)' }}
            />
          )}
        </span>
        <span
          style={{
            display: 'inline-block',
            filter: rotowireId ? 'none' : 'grayscale(100%)',
            pointerEvents: rotowireId ? 'auto' : 'none'
          }}
        >
          <a
            href={rotowireId ? `https://www.rotowire.com/football/player/${firstName}-${lastName}-${rotowireId}` : '#'}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: rotowireId ? 'inline' : 'none' }}
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
              style={{ width: "20px", height: "20px", filter: 'grayscale(100%)' }}
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

  const countInjuries = (starters, leagueId) => {
    let redCount = 0;
    let orangeCount = 0;

    starters.forEach((playerId) => {
      const injuryStatus = playerData[leagueId]?.players[playerId]?.injury_status;
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

  return (
    <div className="league-container">
      <button onClick={handleBackClick} className="back-button">
        <FontAwesomeIcon icon={faArrowLeft} /> Back
      </button>
      <div className="league-header">
        <h1>Leagues Overview (W.I.P)</h1>
        <span>{userName}</span>
      </div>
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
                <div className="league-grid-item league-name">
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
                            )?.map((player, index) => (
                              <div key={index} className="roster-grid">
                                <div className="roster-grid-item">
                                  {renderPlayerInfo(player, league.league_id)}
                                </div>
                                <div className="roster-grid-item">
                                  {playerData[league.league_id]?.players[player]
                                    ?.position || ""}
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
                            ))}
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
      <span hidden>{userId}</span>
    </div>
  );
}

export default LeagueList;

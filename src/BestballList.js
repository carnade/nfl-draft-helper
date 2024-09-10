import React, { useEffect, useState, useCallback } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faExternalLinkAlt,
  faTrophy,
} from "@fortawesome/free-solid-svg-icons";
import { useNavigate, useParams } from "react-router-dom";

function BestballList() {
  const { userName } = useParams();
  const [userId, setUserId] = useState(null);
  const [leagues, setLeagues] = useState([]);
  const [expandedLeagueIds, setExpandedLeagueIds] = useState(new Set());

  const navigate = useNavigate();

  const handleBackClick = () => {
    navigate(-1); // Navigate back to the start page
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
        (league) => league.settings.best_ball === 1
      );

      const standingsPromises = filteredLeagues.map(async (league) => {
        const standingsResponse = await fetch(
          `https://api.sleeper.app/v1/league/${league.league_id}/rosters`
        );
        const standingsData = await standingsResponse.json();

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
    } catch (error) {
      console.error("Error fetching league data:", error);
    }
  }, [userName]);

  useEffect(() => {
    fetchLeagueData();
  }, [fetchLeagueData]);

  return (
    <div className="dashboard-container">
      <div className="header-container">
        <h1>Bestball Leagues</h1>
        <button onClick={handleBackClick} className="back-button">
          <FontAwesomeIcon icon={faArrowLeft} /> Back
        </button>
      </div>
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
                        <div className="team-grid-item">{team.position}</div>
                        <div className="team-grid-item">
                          {team.owner_id === userId ? (
                            <span className="user-position">{userName}</span>
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
      <span hidden>{userId}</span>
    </div>
  );
}

export default BestballList;

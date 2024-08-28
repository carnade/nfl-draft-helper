import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

function LeagueList({ userName }) {
  const [userId, setUserId] = useState(null);
  const [leagues, setLeagues] = useState([]);
  const [expandedLeagueIds, setExpandedLeagueIds] = useState(new Set());
  const navigate = useNavigate();

  const handleBackClick = () => {
    navigate(-1); // Go back to the previous page
  };

  useEffect(() => {
    const fetchLeagues = async () => {
      try {
        // Fetch user data to get user_id
        const userResponse = await fetch(
          `https://api.sleeper.app/v1/user/${userName}`
        );
        const userData = await userResponse.json();
        const userId = userData.user_id;
        setUserId(userId);

        // Fetch leagues for the user
        const leaguesResponse = await fetch(
          `https://api.sleeper.app/v1/user/${userId}/leagues/nfl/2024`
        );
        const leaguesData = await leaguesResponse.json();

        // Filter out best ball leagues and store the relevant leagues
        const relevantLeagues = leaguesData.filter(
          (league) => league.settings.best_ball === 0
        );

        const leagueDetailsPromises = relevantLeagues.map(async (league) => {
          const rostersResponse = await fetch(
            `https://api.sleeper.app/v1/league/${league.league_id}/rosters`
          );
          const rostersData = await rostersResponse.json();

          const userRoster = rostersData.find(
            (roster) => roster.owner_id === userId
          );

          return {
            ...league,
            userRoster,
          };
        });

        const leaguesWithDetails = await Promise.all(leagueDetailsPromises);
        setLeagues(leaguesWithDetails);
      } catch (error) {
        console.error("Error fetching leagues:", error);
      }
    };

    fetchLeagues();
  }, [userName]);

  const toggleLeagueExpansion = (leagueId) => {
    const newExpandedSet = new Set(expandedLeagueIds);
    if (newExpandedSet.has(leagueId)) {
      newExpandedSet.delete(leagueId);
    } else {
      newExpandedSet.add(leagueId);
    }
    setExpandedLeagueIds(newExpandedSet);
  };

  return (
    <div className="league-list">
      <button onClick={handleBackClick} className="back-button">
        Back
      </button>
      <h2>Your Leagues</h2>
      {leagues.map((league) => (
        <div key={league.league_id} className="league-item">
          <div
            className="league-header"
            onClick={() => toggleLeagueExpansion(league.league_id)}
          >
            <span
              className={`expand-icon ${
                expandedLeagueIds.has(league.league_id) ? "expanded" : ""
              }`}
            >
              {expandedLeagueIds.has(league.league_id) ? "v" : ">"}
            </span>
            {league.name}
            <span className="league-summary">
              {league.userRoster.settings.wins}-
              {league.userRoster.settings.losses}-
              {league.userRoster.settings.ties} | Fpts:{" "}
              {league.userRoster.settings.fpts} | Waiver:{" "}
              {league.userRoster.settings.waiver_budget_used}/
              {league.settings.waiver_budget}
            </span>
          </div>
          {expandedLeagueIds.has(league.league_id) && (
            <div className="league-details">
              <div>
                <strong>Starters</strong>
                <ul>
                  {league.userRoster.starters?.map((player) => (
                    <li key={player}>{player}</li>
                  ))}
                </ul>
              </div>
              <div>
                <strong>Players</strong>
                <ul>
                  {league.userRoster.players?.map((player) => (
                    <li key={player}>{player}</li>
                  ))}
                </ul>
              </div>
              <div>
                <strong>Reserve</strong>
                <ul>
                  {league.userRoster.reserve?.map((player) => (
                    <li key={player}>{player}</li>
                  ))}
                </ul>
              </div>
              <div>
                <strong>Taxi</strong>
                <ul>
                  {league.userRoster.taxi?.map((player) => (
                    <li key={player}>{player}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default LeagueList;

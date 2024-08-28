import React, { useEffect, useState } from "react";

function LeagueList({ userName }) {
  const [userId, setUserId] = useState(null);
  const [leagues, setLeagues] = useState([]);
  const [expandedLeagueIds, setExpandedLeagueIds] = useState(new Set());

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

  const fetchLeagueData = async () => {
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

        // Merge all players into one unique set to prevent duplicates
        const uniquePlayers = [
          ...new Set([
            ...rostersData[0].starters,
            ...rostersData[0].players,
            ...rostersData[0].reserve,
            ...rostersData[0].taxi,
          ]),
        ];

        return {
          ...league,
          rostersData: {
            ...rostersData[0],
            uniquePlayers,
          },
        };
      });

      const leagueDetails = await Promise.all(leagueDetailsPromises);

      setLeagues(leagueDetails);
    } catch (error) {
      console.error("Error fetching league data:", error);
    }
  };

  useEffect(() => {
    fetchLeagueData();
  }, [userName]);

  return (
    <div className="league-container">
      <div className="league-header">
        <h1>Leagues Overview</h1>
        <span>{userName}</span>
      </div>
      <div className="league-grid">
        <div className="league-grid-header">League Name</div>
        <div className="league-grid-header">Record</div>
        <div className="league-grid-header">FPTS</div>
        <div className="league-grid-header">Waiver Budget</div>
        <div className="league-grid-header">Actions</div>

        {leagues.length > 0 ? (
          leagues.map((league, index) => (
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
                {league.rostersData.settings.wins}-
                {league.rostersData.settings.losses}-
                {league.rostersData.settings.ties}
              </div>
              <div className="league-grid-item">
                {league.rostersData.settings.fpts}
              </div>
              <div className="league-grid-item">
                {league.rostersData.settings.waiver_budget_used}/
                {league.settings.waiver_budget}
              </div>
              <div className="league-grid-item">
                <button>View Details</button>
              </div>
              {expandedLeagueIds.has(league.league_id) && (
                <div className="league-details">
                  {["Starters", "Bench", "Reserves", "Taxi"].map(
                    (group, idx) => (
                      <div key={idx} className="roster-group">
                        {(league.rostersData[group.toLowerCase()] || [])
                          .length > 0 && (
                          <div className="roster-header">{group}</div>
                        )}
                        {(league.rostersData[group.toLowerCase()] || [])
                          .length > 0 && (
                          <div className="roster-grid">
                            <div className="roster-grid-header">Player</div>
                            <div className="roster-grid-header">Points</div>
                            <div className="roster-grid-header">Status</div>
                          </div>
                        )}
                        {(league.rostersData[group.toLowerCase()] || []).map(
                          (player, index) => (
                            <div key={index} className="roster-grid">
                              <div className="roster-grid-item">{player}</div>
                              <div className="roster-grid-item">123.4</div>
                              <div className="roster-grid-item">PUP</div>
                            </div>
                          )
                        )}
                      </div>
                    )
                  )}
                </div>
              )}
            </React.Fragment>
          ))
        ) : (
          <div className="league-grid-item">No leagues found.</div>
        )}
      </div>
    </div>
  );
}

export default LeagueList;

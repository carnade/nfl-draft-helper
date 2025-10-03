import React, { useState, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSearch, faTimes } from "@fortawesome/free-solid-svg-icons";
import "./TradeAnalyzer.css";

function TradeAnalyzer() {
  const [projectionsData, setProjectionsData] = useState([]);
  const [statsData, setStatsData] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Trade interface state
  const [team1Players, setTeam1Players] = useState([]);
  const [team2Players, setTeam2Players] = useState([]);
  const [team1Search, setTeam1Search] = useState("");
  const [team2Search, setTeam2Search] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [activeSearch, setActiveSearch] = useState(null); // 'team1' or 'team2'

  // TTL constants
  const TTL_HOURS = 12;
  const TTL_MS = TTL_HOURS * 60 * 60 * 1000;

  // Store data with TTL
  const storeWithTTL = (key, data) => {
    const item = {
      data: data,
      timestamp: Date.now(),
      ttl: TTL_MS
    };
    localStorage.setItem(key, JSON.stringify(item));
  };

  // Load data with TTL check
  const loadWithTTL = (key) => {
    try {
      const stored = localStorage.getItem(key);
      if (!stored) return null;
      
      const item = JSON.parse(stored);
      const now = Date.now();
      
      // Check if expired
      if (now - item.timestamp > item.ttl) {
        localStorage.removeItem(key);
        return null;
      }
      
      return item.data;
    } catch (error) {
      localStorage.removeItem(key);
      return null;
    }
  };

  // Fetch projections data from Sleeper API
  const fetchProjectionsData = async () => {
    try {
      const response = await fetch(
        'https://api.sleeper.com/projections/nfl/2025?season_type=regular&position[]=DEF&position[]=K&position[]=QB&position[]=RB&position[]=TE&position[]=WR&order_by=adp_ppr'
      );
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Store in localStorage with TTL
      storeWithTTL('sleeperProjections', data);
      setProjectionsData(data);
      
    } catch (err) {
      throw new Error(`Failed to fetch projections data: ${err.message}`);
    }
  };

  // Fetch stats data from Sleeper API
  const fetchStatsData = async () => {
    try {
      const response = await fetch(
        'https://api.sleeper.com/stats/nfl/2025?season_type=regular&position[]=DEF&position[]=K&position[]=QB&position[]=RB&position[]=TE&position[]=WR&order_by=adp_ppr'
      );
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Store in localStorage with TTL
      storeWithTTL('sleeperStats', data);
      setStatsData(data);
      
    } catch (err) {
      throw new Error(`Failed to fetch stats data: ${err.message}`);
    }
  };

  // Fetch both projections and stats data
  const fetchAllData = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      await Promise.all([fetchProjectionsData(), fetchStatsData()]);
    } catch (err) {
      setError(err.message);
      console.error('Error fetching data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Search players function
  const searchPlayers = (query, team) => {
    if (!query.trim() || projectionsData.length === 0) {
      setSearchResults([]);
      setActiveSearch(null);
      return;
    }

    const filtered = projectionsData.filter(player => {
      const fullName = `${player.player.first_name} ${player.player.last_name}`.toLowerCase();
      const position = player.player.position.toLowerCase();
      const team = player.player.team?.toLowerCase() || '';
      
      return fullName.includes(query.toLowerCase()) || 
             position.includes(query.toLowerCase()) ||
             team.includes(query.toLowerCase());
    }).slice(0, 10); // Limit to 10 results

    setSearchResults(filtered);
    setActiveSearch(team);
  };

  // Get player stats from both projections and actual stats
  const getPlayerStats = (playerId) => {
    const projection = projectionsData.find(p => p.player_id === playerId);
    const stat = statsData.find(s => s.player_id === playerId);
    
    const projPts = projection?.stats?.pts_ppr || 0;
    const projGp = projection?.stats?.gp || 1;
    const actualPts = stat?.stats?.pts_ppr || 0;
    const actualGp = stat?.stats?.gp || 1;
    
    return {
      projPtsPerGame: projGp > 0 ? (projPts / projGp).toFixed(1) : '0.0',
      actualPtsPerGame: actualGp > 0 ? (actualPts / actualGp).toFixed(1) : '0.0',
      projTotal: Math.round(projPts),
      actualTotal: Math.round(actualPts)
    };
  };

  // Add player to team
  const addPlayerToTeam = (player, team) => {
    const playerStats = getPlayerStats(player.player_id);
    
    const playerData = {
      id: player.player_id,
      name: `${player.player.first_name} ${player.player.last_name}`,
      position: player.player.position,
      team: player.player.team,
      age: player.player.years_exp ? (25 + player.player.years_exp) : 'N/A',
      rank: getPositionRank(player),
      stats: player.stats,
      ...playerStats
    };

    if (team === 'team1') {
      setTeam1Players(prev => [...prev, playerData]);
      setTeam1Search("");
    } else {
      setTeam2Players(prev => [...prev, playerData]);
      setTeam2Search("");
    }
    
    setSearchResults([]);
    setActiveSearch(null);
  };

  // Get position rank
  const getPositionRank = (player) => {
    const position = player.player.position;
    const adp = player.stats.adp_ppr;
    
    if (position === 'RB') return `RB${Math.round(adp)}`;
    if (position === 'WR') return `WR${Math.round(adp)}`;
    if (position === 'TE') return `TE${Math.round(adp)}`;
    if (position === 'QB') return `QB${Math.round(adp)}`;
    if (position === 'K') return `K${Math.round(adp)}`;
    if (position === 'DEF') return `DEF${Math.round(adp)}`;
    return `${position}${Math.round(adp)}`;
  };

  // Remove player from team
  const removePlayerFromTeam = (playerId, team) => {
    if (team === 'team1') {
      setTeam1Players(prev => prev.filter(p => p.id !== playerId));
    } else {
      setTeam2Players(prev => prev.filter(p => p.id !== playerId));
    }
  };

  // Calculate team totals (using projected totals for now)
  const calculateTeamTotal = (players) => {
    return players.reduce((total, player) => total + (player.projTotal || 0), 0);
  };

  // Load data on component mount
  useEffect(() => {
    const loadData = async () => {
      // Try to load from localStorage first
      const cachedProjections = loadWithTTL('sleeperProjections');
      const cachedStats = loadWithTTL('sleeperStats');
      
      if (cachedProjections && cachedStats) {
        setProjectionsData(cachedProjections);
        setStatsData(cachedStats);
        console.log('Loaded data from cache');
      } else {
        // No cached data or expired, fetch fresh data
        console.log('No valid cached data, fetching fresh data');
        await fetchAllData();
      }
    };

    loadData();
  }, []);

  return (
    <div className="trade-analyzer">
      <h1>Trade Analyzer</h1>
      
      {isLoading && (
        <div className="loading">
          <p>Loading player projections...</p>
        </div>
      )}
      
      {error && (
        <div className="error">
          <p>{error}</p>
          <button onClick={fetchAllData}>Retry</button>
        </div>
      )}
      
      {projectionsData.length > 0 && statsData.length > 0 && (
        <div className="trade-interface">
          <div className="trade-panels">
            {/* Team 1 Panel */}
            <div className="trade-panel">
              <div className="panel-header">
                <h3>Team 1 gets...</h3>
              </div>
              
              <div className="search-container">
                <div className="search-input-wrapper">
                  <FontAwesomeIcon icon={faSearch} className="search-icon" />
                  <input
                    type="text"
                    placeholder="Search for a player"
                    value={team1Search}
                    onChange={(e) => {
                      setTeam1Search(e.target.value);
                      searchPlayers(e.target.value, 'team1');
                    }}
                    className="search-input"
                  />
                </div>
                
                {activeSearch === 'team1' && searchResults.length > 0 && (
                  <div className="search-results">
                    {searchResults.map(player => (
                      <div
                        key={player.player_id}
                        className="search-result-item"
                        onClick={() => addPlayerToTeam(player, 'team1')}
                      >
                        <div className="player-name">
                          {player.player.first_name} {player.player.last_name}
                        </div>
                        <div className="player-details">
                          {player.player.position} • {player.player.team} • {player.player.years_exp ? (25 + player.player.years_exp) : 'N/A'} y.o.
                        </div>
                        <div className="player-value">
                          {(() => {
                            const playerStats = getPlayerStats(player.player_id);
                            return `Pts/g | Proj: ${playerStats.projPtsPerGame} Stats: ${playerStats.actualPtsPerGame}`;
                          })()}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              <div className="selected-players">
                {team1Players.map(player => (
                  <div key={player.id} className="player-card">
                    <div className="player-info">
                      <div className="player-name">{player.name}</div>
                      <div className="player-details">
                        {player.rank} • {player.team} • {player.age} y.o.
                      </div>
                    </div>
                    <div className="player-value">
                      Pts/g | Proj: {player.projPtsPerGame} Stats: {player.actualPtsPerGame}
                    </div>
                    <button
                      className="remove-player"
                      onClick={() => removePlayerFromTeam(player.id, 'team1')}
                    >
                      <FontAwesomeIcon icon={faTimes} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Team 2 Panel */}
            <div className="trade-panel">
              <div className="panel-header">
                <h3>Team 2 gets...</h3>
              </div>
              
              <div className="search-container">
                <div className="search-input-wrapper">
                  <FontAwesomeIcon icon={faSearch} className="search-icon" />
                  <input
                    type="text"
                    placeholder="Search for a player"
                    value={team2Search}
                    onChange={(e) => {
                      setTeam2Search(e.target.value);
                      searchPlayers(e.target.value, 'team2');
                    }}
                    className="search-input"
                  />
                </div>
                
                {activeSearch === 'team2' && searchResults.length > 0 && (
                  <div className="search-results">
                    {searchResults.map(player => (
                      <div
                        key={player.player_id}
                        className="search-result-item"
                        onClick={() => addPlayerToTeam(player, 'team2')}
                      >
                        <div className="player-name">
                          {player.player.first_name} {player.player.last_name}
                        </div>
                        <div className="player-details">
                          {player.player.position} • {player.player.team} • {player.player.years_exp ? (25 + player.player.years_exp) : 'N/A'} y.o.
                        </div>
                        <div className="player-value">
                          {(() => {
                            const playerStats = getPlayerStats(player.player_id);
                            return `Pts/g | Proj: ${playerStats.projPtsPerGame} Stats: ${playerStats.actualPtsPerGame}`;
                          })()}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              <div className="selected-players">
                {team2Players.map(player => (
                  <div key={player.id} className="player-card">
                    <div className="player-info">
                      <div className="player-name">{player.name}</div>
                      <div className="player-details">
                        {player.rank} • {player.team} • {player.age} y.o.
                      </div>
                    </div>
                    <div className="player-value">
                      Pts/g | Proj: {player.projPtsPerGame} Stats: {player.actualPtsPerGame}
                    </div>
                    <button
                      className="remove-player"
                      onClick={() => removePlayerFromTeam(player.id, 'team2')}
                    >
                      <FontAwesomeIcon icon={faTimes} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
          
          {/* Trade Analysis */}
          {team1Players.length > 0 || team2Players.length > 0 ? (
            <div className="trade-analysis">
              <h3>Trade Analysis</h3>
              <div className="analysis-content">
                <div className="team-analysis">
                  <div className="team-summary">
                    <strong>Team 1 Total:</strong> {calculateTeamTotal(team1Players)} points
                  </div>
                  <div className="team-summary">
                    <strong>Team 2 Total:</strong> {calculateTeamTotal(team2Players)} points
                  </div>
                  <div className="trade-difference">
                    <strong>Difference:</strong> {Math.abs(calculateTeamTotal(team1Players) - calculateTeamTotal(team2Players))} points
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

export default TradeAnalyzer;

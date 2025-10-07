import React, { useState, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSearch, faTimes, faSortUp, faSortDown, faSort } from "@fortawesome/free-solid-svg-icons";
import "./TradeAnalyzer.css";

// Session cache - persists across browser sessions using localStorage
const CACHE_KEY_PREFIX = 'tradeAnalyzerCache_';
const CACHE_EXPIRY_HOURS = 24; // Cache expires after 24 hours

// Store data in session cache with expiry
const storeInSession = (key, data) => {
  try {
    const cacheKey = `${CACHE_KEY_PREFIX}${key}`;
    const cacheData = {
      data: data,
      timestamp: Date.now()
    };
    localStorage.setItem(cacheKey, JSON.stringify(cacheData));
    return true;
  } catch (error) {
    console.error(`Failed to store ${key} in session cache:`, error);
    return false;
  }
};

// Load data from session cache with expiry check
const loadFromSession = (key) => {
  try {
    const cacheKey = `${CACHE_KEY_PREFIX}${key}`;
    const cached = localStorage.getItem(cacheKey);
    
    if (!cached) {
      return null;
    }
    
    const cacheData = JSON.parse(cached);
    const now = Date.now();
    const cacheAge = now - cacheData.timestamp;
    const cacheAgeHours = cacheAge / (1000 * 60 * 60);
    
    // Check if cache has expired
    if (cacheAgeHours > CACHE_EXPIRY_HOURS) {
      console.log(`Cache for ${key} expired (${cacheAgeHours.toFixed(1)} hours old), removing...`);
      localStorage.removeItem(cacheKey);
      return null;
    }
    
    console.log(`Cache for ${key} loaded (${cacheAgeHours.toFixed(1)} hours old)`);
    return cacheData.data;
  } catch (error) {
    console.error(`Failed to load ${key} from session cache:`, error);
    return null;
  }
};

function TradeAnalyzer({ userName, setUserName }) {
  const [projectionsData, setProjectionsData] = useState([]);
  const [statsData, setStatsData] = useState([]);
  const [picksData, setPicksData] = useState([]); // Picks data
  const [leaguesData, setLeaguesData] = useState([]);
  const [teamsData, setTeamsData] = useState({}); // Cache for teams data by league_id
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Trade interface state
  const [team1Players, setTeam1Players] = useState([]);
  const [team2Players, setTeam2Players] = useState([]);
  const [team1Search, setTeam1Search] = useState("");
  const [team2Search, setTeam2Search] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [activeSearch, setActiveSearch] = useState(null); // 'team1' or 'team2'
  const [tradePartner, setTradePartner] = useState("");
  const [rosterData, setRosterData] = useState({}); // Cache for roster data
  const [usernameMap, setUsernameMap] = useState({});
  const [userId, setUserId] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [playerDataCache, setPlayerDataCache] = useState({}); // Cache for additional player data

  // Resolve a username to a sleeper user_id using cached map or API
  const resolveUsernameToId = async (username) => {
    if (!username) return null;
    const lower = username.toLowerCase();
    
    // Check in current state
    for (const [id, name] of Object.entries(usernameMap || {})) {
      if (name && name.toLowerCase() === lower) {
        return id;
      }
    }

    try {
      const resp = await fetch(`https://api.sleeper.app/v1/user/${username}`);
      if (resp.ok) {
        const data = await resp.json();
        
        // Check if the response is valid and has a user_id
        if (data && data.user_id) {
          const id = data.user_id;
          const combined = {
            ...(usernameMap || {}),
            [id]: data.username || data.display_name,
          };
          setUsernameMap(combined);
          return id;
        } else {
          console.warn(`Invalid response for username "${username}":`, data);
          return null;
        }
      } else {
        console.warn(`Failed to fetch user "${username}": HTTP ${resp.status}`);
        return null;
      }
    } catch (e) {
      console.error("Error resolving username:", e);
      return null;
    }
  };

  // Fetch projections data from Sleeper API
  const fetchProjectionsData = async () => {
    try {
      console.log('📡 Fetching projections data from Sleeper API...');
      const response = await fetch(
        'https://api.sleeper.com/projections/nfl/2025?season_type=regular&position[]=DEF&position[]=K&position[]=QB&position[]=RB&position[]=TE&position[]=WR&order_by=adp_ppr'
      );
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('✅ Projections data fetched successfully');
      
      // Store in session cache
      storeInSession('projections', data);
      setProjectionsData(data);
      
    } catch (err) {
      throw new Error(`Failed to fetch projections data: ${err.message}`);
    }
  };

  // Fetch stats data from Sleeper API
  const fetchStatsData = async () => {
    try {
      console.log('📡 Fetching stats data from Sleeper API...');
      const response = await fetch(
        'https://api.sleeper.com/stats/nfl/2025?season_type=regular&position[]=DEF&position[]=K&position[]=QB&position[]=RB&position[]=TE&position[]=WR&order_by=adp_ppr'
      );
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('✅ Stats data fetched successfully');
      
      // Store in session cache
      storeInSession('stats', data);
      setStatsData(data);
      
    } catch (err) {
      throw new Error(`Failed to fetch stats data: ${err.message}`);
    }
  };

  // Fetch picks data from API
  const fetchPicksData = async () => {
    try {
      console.log('📡 Fetching picks data from API...');
      const response = await fetch(
        'https://shaggy-latashia-carnade-2ea2054a.koyeb.app/picks/data'
      );
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      // Convert object to array for easier searching
      const picksArray = Object.values(data);
      console.log('✅ Picks data fetched successfully');
      
      // Store in session cache
      storeInSession('picks', picksArray);
      setPicksData(picksArray);
      
    } catch (err) {
      throw new Error(`Failed to fetch picks data: ${err.message}`);
    }
  };

  // Fetch leagues data from Sleeper API
  const fetchLeaguesData = async () => {
    try {
      if (!userName) {
        console.log("No username provided, skipping leagues fetch");
        return;
      }
      
      // First resolve username to user ID
      const resolvedUserId = await resolveUsernameToId(userName);
      if (!resolvedUserId) {
        console.warn(`Could not resolve username "${userName}" to user ID. This might be an invalid username.`);
        // Clear leagues data when username is invalid
        setLeaguesData([]);
        setTeamsData({});
        setRosterData({});
        return;
      }
      
      setUserId(resolvedUserId);
      
      const response = await fetch(
        `https://api.sleeper.app/v1/user/${resolvedUserId}/leagues/nfl/2025`
      );
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const allLeagues = await response.json();
      
      // Filter out best ball leagues (only show dynasty and redraft)
      const filteredLeagues = allLeagues.filter(
        (league) =>
          league.settings.best_ball === 0 || league.settings.best_ball == null
      );
      
      // Store in session cache
      storeInSession('leagues', filteredLeagues);
      setLeaguesData(filteredLeagues);
      
      // Fetch teams and roster data for each league
      await Promise.all([
        fetchTeamsData(filteredLeagues),
        fetchRosterData(filteredLeagues)
      ]);
      
    } catch (err) {
      throw new Error(`Failed to fetch leagues data: ${err.message}`);
    }
  };

  // Fetch teams data for leagues
  const fetchTeamsData = async (leagues) => {
    try {
      const newTeamsData = {};
      
      for (const league of leagues) {
        try {
          const response = await fetch(
            `https://api.sleeper.app/v1/league/${league.league_id}/users`
          );
          if (!response.ok) continue;
          
          const teams = await response.json();
          // Only store essential team data to reduce size
          const optimizedTeams = teams.map(team => ({
            user_id: team.user_id,
            display_name: team.display_name,
            username: team.username,
            avatar: team.avatar
          }));
          newTeamsData[league.league_id] = optimizedTeams;
        } catch (e) {
          // ignore per-league errors
        }
      }
      
      setTeamsData(newTeamsData);
      // Cache teams data
      storeInSession('teams', newTeamsData);
    } catch (e) {
      console.error('Error fetching teams data:', e);
    }
  };

  // Fetch roster data for leagues
  const fetchRosterData = async (leagues) => {
    try {
      const newRosterData = {};
      
      for (const league of leagues) {
        try {
          const response = await fetch(
            `https://api.sleeper.app/v1/league/${league.league_id}/rosters`
          );
          if (!response.ok) continue;
          
          const rosters = await response.json();
          // Only store essential roster data to reduce size
          const optimizedRosters = rosters.map(roster => ({
            owner_id: roster.owner_id,
            players: roster.players,
            settings: {
              wins: roster.settings?.wins,
              losses: roster.settings?.losses,
              ties: roster.settings?.ties
            }
          }));
          newRosterData[league.league_id] = optimizedRosters;
        } catch (e) {
          // ignore per-league errors
        }
      }
      
      setRosterData(newRosterData);
      // Cache roster data
      storeInSession('rosters', newRosterData);
    } catch (e) {
      console.error('Error fetching roster data:', e);
    }
  };

  // Fetch all data (projections, stats, picks, and leagues)
  const fetchAllData = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const promises = [fetchProjectionsData(), fetchStatsData(), fetchPicksData()];
      if (userName) {
        promises.push(fetchLeaguesData());
      }
      await Promise.all(promises);
    } catch (err) {
      setError(err.message);
      console.error('Error fetching data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Search players and picks function
  const searchPlayers = (query, team) => {
    if (!query.trim() || (projectionsData.length === 0 && picksData.length === 0)) {
      setSearchResults([]);
      setActiveSearch(null);
      return;
    }

    // Search players
    const filteredPlayers = projectionsData.filter(player => {
      const fullName = `${player.player.first_name} ${player.player.last_name}`.toLowerCase();
      const position = player.player.position.toLowerCase();
      const team = player.player.team?.toLowerCase() || '';
      
      return fullName.includes(query.toLowerCase()) || 
             position.includes(query.toLowerCase()) ||
             team.includes(query.toLowerCase());
    });

    // Search picks
    const filteredPicks = picksData.filter(pick => {
      const pickName = pick['Player Name']?.toLowerCase() || '';
      const year = pick.Year?.toString() || '';
      const round = pick.Round?.toString() || '';
      const pickType = pick['Pick Type']?.toLowerCase() || '';
      
      return pickName.includes(query.toLowerCase()) ||
             year.includes(query.toLowerCase()) ||
             round.includes(query.toLowerCase()) ||
             pickType.includes(query.toLowerCase());
    });

    // Combine and limit to 10 results
    const combined = [...filteredPlayers, ...filteredPicks].slice(0, 10);

    setSearchResults(combined);
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

  // Fetch additional player data
  const fetchPlayerData = async (playerId) => {
    try {
      // Check cache first
      if (playerDataCache[playerId]) {
        return playerDataCache[playerId];
      }

      console.log(`📡 Fetching additional data for player ${playerId}...`);
      const response = await fetch(`https://shaggy-latashia-carnade-2ea2054a.koyeb.app/getplayers/data`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          playerlist: [playerId]
        }),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      const playerData = data[playerId];
      
      if (playerData) {
        // Cache the data
        setPlayerDataCache(prev => ({
          ...prev,
          [playerId]: playerData
        }));
        console.log(`✅ Additional data fetched for player ${playerId}`);
        return playerData;
      } else {
        console.warn(`No additional data found for player ${playerId}`);
        return null;
      }
    } catch (error) {
      console.error(`Error fetching additional data for player ${playerId}:`, error);
      return null;
    }
  };

  // Add player or pick to team
  const addPlayerToTeam = async (item, team) => {
    let itemData;
    
    // Check if it's a pick (has 'Pick ID' field) or a player
    if (item['Pick ID']) {
      // It's a pick
      itemData = {
        id: item['Pick ID'],
        name: item['Player Name'],
        position: 'PICK',
        team: item.Year?.toString() || '',
        age: item['Pick Type'] || '',
        rank: `${item.Round}`,
        isPick: true,
        additionalData: {
          'FC Value': item['FantasyCalc SF Value'] || 0,
          'KTC Value': item['SFValue'] || 0
        },
        projPtsPerGame: '0.0',
        actualPtsPerGame: '0.0',
        projTotal: 0,
        actualTotal: 0
      };
    } else {
      // It's a player
      const playerStats = getPlayerStats(item.player_id);
      
      // Fetch additional player data
      const additionalData = await fetchPlayerData(item.player_id);
      
      itemData = {
        id: item.player_id,
        name: `${item.player.first_name} ${item.player.last_name}`,
        position: item.player.position,
        team: item.player.team,
        age: additionalData?.age || item.player.age || 'N/A',
        rank: getPositionRank(item),
        stats: item.stats,
        additionalData: additionalData,
        isPick: false,
        ...playerStats
      };
    }

    if (team === 'team1') {
      setTeam1Players(prev => [...prev, itemData]);
      setTeam1Search("");
    } else {
      setTeam2Players(prev => [...prev, itemData]);
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

  // Calculate total KTC value for a team
  const calculateKTCTotal = (players) => {
    return players.reduce((total, player) => {
      const ktcValue = player.additionalData?.['KTC Value'] || 0;
      return total + ktcValue;
    }, 0);
  };

  // Calculate total FantasyCalc value for a team
  const calculateFCTotal = (players) => {
    return players.reduce((total, player) => {
      const fcValue = player.additionalData?.['FC Value'] || 0;
      return total + fcValue;
    }, 0);
  };

  // Calculate total projected points per game for a team (excluding picks)
  const calculateTotalProjPtsPerGame = (players) => {
    const realPlayers = players.filter(p => !p.isPick);
    if (realPlayers.length === 0) return 0;
    const total = realPlayers.reduce((sum, player) => {
      return sum + parseFloat(player.projPtsPerGame || 0);
    }, 0);
    return total.toFixed(1);
  };

  // Calculate total 2025 points per game for a team (excluding picks)
  const calculateTotal2025PtsPerGame = (players) => {
    const realPlayers = players.filter(p => !p.isPick);
    if (realPlayers.length === 0) return 0;
    const total = realPlayers.reduce((sum, player) => {
      return sum + parseFloat(player.actualPtsPerGame || 0);
    }, 0);
    return total.toFixed(1);
  };

  // Calculate average age for a team (excluding picks)
  const calculateAvgAge = (players) => {
    const realPlayers = players.filter(p => !p.isPick && p.age && p.age !== 'N/A');
    if (realPlayers.length === 0) return 'N/A';
    const total = realPlayers.reduce((sum, player) => {
      return sum + parseFloat(player.age);
    }, 0);
    return (total / realPlayers.length).toFixed(1);
  };

  // Get team captain info for a player
  const getTeamCaptainInfo = (playerId) => {
    if (!leaguesData.length || !rosterData) return [];
    
    const captainInfo = [];
    
    leaguesData.forEach(league => {
      const rosters = rosterData[league.league_id] || [];
      
      // Find which team has this player
      const teamWithPlayer = rosters.find(roster => 
        roster.players && roster.players.includes(playerId)
      );
      
      if (teamWithPlayer) {
        captainInfo.push({
          leagueName: league.name || 'League',
          captainName: 'Team Owner', // Would need to resolve owner_id to username
          record: `${teamWithPlayer.settings?.wins || 0}-${teamWithPlayer.settings?.losses || 0}-${teamWithPlayer.settings?.ties || 0}`
        });
      }
    });
    
    return captainInfo;
  };

  // Load data on component mount
  useEffect(() => {
    const loadData = async () => {
      // Try to load from session cache first
      const cachedProjections = loadFromSession('projections');
      const cachedStats = loadFromSession('stats');
      const cachedPicks = loadFromSession('picks');
      const cachedLeagues = loadFromSession('leagues');
      const cachedTeams = loadFromSession('teams');
      const cachedRosters = loadFromSession('rosters');
      
      console.log('🔍 Cache check:', {
        projections: !!cachedProjections,
        stats: !!cachedStats,
        picks: !!cachedPicks,
        leagues: !!cachedLeagues,
        teams: !!cachedTeams,
        rosters: !!cachedRosters
      });
      
      if (cachedProjections && cachedStats && cachedPicks) {
        setProjectionsData(cachedProjections);
        setStatsData(cachedStats);
        setPicksData(cachedPicks);
        if (cachedLeagues) {
          setLeaguesData(cachedLeagues);
        }
        if (cachedTeams) {
          setTeamsData(cachedTeams);
        }
        if (cachedRosters) {
          setRosterData(cachedRosters);
        }
        console.log('✅ Loaded data from session cache - No network requests made');
        console.log('💡 To see API calls, refresh the page or clear browser cache');
      } else {
        // No cached data, fetch fresh data
        console.log('🔄 No cached data, fetching fresh data from APIs');
        console.log('📡 Check Network tab to see API requests');
        await fetchAllData();
      }
    };

    loadData();
  }, []);

  // Fetch leagues when userName changes
  useEffect(() => {
    if (userName) {
      fetchLeaguesData();
    }
  }, [userName]);

  // Get team name by owner ID
  const getTeamName = (leagueId, ownerId) => {
    const teams = teamsData[leagueId] || [];
    const team = teams.find(t => t.user_id === ownerId);
    return team?.display_name || team?.username || 'Unknown Team';
  };

  // Truncate text in the middle
  const truncateMiddle = (text, maxLength = 20) => {
    if (!text || text.length <= maxLength) return text;
    
    const start = Math.floor((maxLength - 3) / 2);
    const end = Math.ceil((maxLength - 3) / 2);
    
    return text.substring(0, start) + '...' + text.substring(text.length - end);
  };

  // Handle sorting
  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  // Get sort icon
  const getSortIcon = (key) => {
    if (sortConfig.key !== key) {
      return faSort;
    }
    return sortConfig.direction === 'asc' ? faSortUp : faSortDown;
  };

  // Sort players by league data
  const getSortedPlayersByLeague = () => {
    if (!sortConfig.key) return getPlayersByLeague();

    return getPlayersByLeague().sort((a, b) => {
      let aValue, bValue;

      if (sortConfig.key === 'record') {
        // Parse record strings like "5-3-1" to calculate win percentage
        const parseRecord = (record) => {
          if (!record || record === '') return 0;
          const [wins, losses, ties] = record.split('-').map(Number);
          const totalGames = wins + losses + ties;
          return totalGames > 0 ? wins / totalGames : 0;
        };

        // Use the first player's record for sorting
        const aRecord = a.players[0]?.roster ? 
          `${a.players[0].roster.settings?.wins || 0}-${a.players[0].roster.settings?.losses || 0}-${a.players[0].roster.settings?.ties || 0}` : '';
        const bRecord = b.players[0]?.roster ? 
          `${b.players[0].roster.settings?.wins || 0}-${b.players[0].roster.settings?.losses || 0}-${b.players[0].roster.settings?.ties || 0}` : '';
        
        aValue = parseRecord(aRecord);
        bValue = parseRecord(bRecord);
      } else if (sortConfig.key === 'name') {
        aValue = a.league.name || '';
        bValue = b.league.name || '';
      }

      if (aValue < bValue) {
        return sortConfig.direction === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  };

  // Get team record for a league
  const getTeamRecord = (leagueId) => {
    const rosters = rosterData[leagueId] || [];
    const hasTradePartnerPlayers = team2Players.length > 0;
    
    if (hasTradePartnerPlayers && team2Players.length > 0) {
      const firstPlayer = team2Players[0];
      const firstPlayerRoster = rosters.find(r => 
        r.players && r.players.includes(firstPlayer.id)
      );
      
      if (firstPlayerRoster) {
        return `${firstPlayerRoster.settings?.wins || 0}-${firstPlayerRoster.settings?.losses || 0}-${firstPlayerRoster.settings?.ties || 0}`;
      }
    }
    return '';
  };

  // Get all players grouped by league
  const getPlayersByLeague = () => {
    if (team2Players.length === 0) return [];
    
    const playersByLeague = {};
    
    team2Players.forEach((player, index) => {
      // Find which league this player belongs to
      leaguesData.forEach(league => {
        const rosters = rosterData[league.league_id] || [];
        const playerRoster = rosters.find(r => 
          r.players && r.players.includes(player.id)
        );
        
        if (playerRoster) {
          if (!playersByLeague[league.league_id]) {
            playersByLeague[league.league_id] = {
              league: league,
              players: []
            };
          }
          playersByLeague[league.league_id].players.push({
            player: player,
            playerNumber: index + 1,
            roster: playerRoster
          });
        }
      });
    });
    
    // Add owner matching analysis to each league group
    return Object.values(playersByLeague).map(leagueGroup => {
      const owners = leagueGroup.players.map(p => p.roster.owner_id);
      const uniqueOwners = [...new Set(owners)];
      // Only mark as same owner if there are multiple players AND all have the same owner
      const allSameOwner = leagueGroup.players.length > 1 && uniqueOwners.length === 1;
      
      return {
        ...leagueGroup,
        allSameOwner,
        ownerMatches: leagueGroup.players.map(playerData => {
          const playerOwner = playerData.roster.owner_id;
          const otherOwners = leagueGroup.players.filter(p => p.player.id !== playerData.player.id).map(p => p.roster.owner_id);
          const hasMatchingOwner = otherOwners.includes(playerOwner);
          return hasMatchingOwner;
        })
      };
    });
  };

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
          <div className="trade-main-container">
            <div className="trade-content-wrapper">
              <div className="trade-panels-section">
                <div className="trade-panels">
                  {/* Team 1 Panel */}
                  <div className="trade-panel">
                    <div className="panel-header">
                      <h3>{userName ? `${userName.charAt(0).toUpperCase() + userName.slice(1)} gets...` : 'Username gets...'}</h3>
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
                          {searchResults.map(item => {
                            const isPick = !!item['Pick ID'];
                            return (
                              <div
                                key={isPick ? item['Pick ID'] : item.player_id}
                                className="search-result-item"
                                onClick={() => addPlayerToTeam(item, 'team1')}
                              >
                                <div className="player-name">
                                  {isPick ? item['Player Name'] : `${item.player.first_name} ${item.player.last_name}`}
                                </div>
                                <div className="player-details">
                                  {isPick ? 
                                    `${item['Pick Type']} • Round ${item.Round} • ${item.Year}` :
                                    `${item.player.position} • ${item.player.team}${item.player.age ? ` • ${item.player.age} y.o.` : ''}`
                                  }
                                </div>
                                <div className="player-value">
                                  {isPick ? 
                                    `FC: ${Math.round(item['FantasyCalc SF Value'] || 0)} | KTC: ${Math.round(item['SFValue'] || 0)}` :
                                    (() => {
                                      const playerStats = getPlayerStats(item.player_id);
                                      return `Pts/g | Proj: ${playerStats.projPtsPerGame} Stats: ${playerStats.actualPtsPerGame}`;
                                    })()
                                  }
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    
                    <div className="selected-players">
                      {team1Players.map(player => (
                        <div key={player.id} className="trade-player-card">
                          <div className="player-info">
                            <div className="player-name">{player.name}</div>
                            <div className="player-details">
                              {player.isPick ? 
                                `${player.age} • Round ${player.rank} • ${player.team}` :
                                player.additionalData && !player.isPick ? 
                                  `Ovr${player.additionalData.rank_ppr || 'N/A'} • ${player.position}${player.additionalData.pos_rank_ppr || 'N/A'} • ${player.team} • ${player.age} y.o.` :
                                  `${player.rank} • ${player.team} • ${player.age} y.o.`
                              }
                            </div>
                          </div>
                          <div className="player-value">
                            {player.isPick ? (
                              <>
                                <div className="value-row">
                                  <span className="value-label">KeepTradeCut</span>
                                  <span className="value-ktc">{Math.round(player.additionalData?.['KTC Value'] || 0)}</span>
                                </div>
                                <div className="value-row">
                                  <span className="value-label">FantasyCalc</span>
                                  <span className="value-fc">{Math.round(player.additionalData?.['FC Value'] || 0)}</span>
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="value-row">
                                  <span className="value-label">Pts/g</span>
                                  <span className="value-separator">|</span>
                                  <span className="value-label">Proj:</span>
                                  <span className="value-proj">{player.projPtsPerGame}</span>
                                  <span className="value-label">2025:</span>
                                  <span className={`value-stats ${parseFloat(player.actualPtsPerGame) > parseFloat(player.projPtsPerGame) ? 'stats-better' : 'stats-worse'}`}>
                                    {player.actualPtsPerGame}
                                  </span>
                                </div>
                                {player.additionalData && (
                                  <>
                                    <div className="value-row">
                                      <span className="value-label">KeepTradeCut</span>
                                      <span className="value-ktc">{player.additionalData['KTC Value'] ? Math.round(player.additionalData['KTC Value']) : 'N/A'}</span>
                                    </div>
                                    <div className="value-row">
                                      <span className="value-label">FantasyCalc</span>
                                      <span className="value-fc">{player.additionalData['FC Value'] ? Math.round(player.additionalData['FC Value']) : 'N/A'}</span>
                                    </div>
                                  </>
                                )}
                              </>
                            )}
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
                      <h3>{tradePartner ? `${tradePartner.charAt(0).toUpperCase() + tradePartner.slice(1)} gets...` : 'Trade Partner gets...'}</h3>
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
                          {searchResults.map(item => {
                            const isPick = !!item['Pick ID'];
                            return (
                              <div
                                key={isPick ? item['Pick ID'] : item.player_id}
                                className="search-result-item"
                                onClick={() => addPlayerToTeam(item, 'team2')}
                              >
                                <div className="player-name">
                                  {isPick ? item['Player Name'] : `${item.player.first_name} ${item.player.last_name}`}
                                </div>
                                <div className="player-details">
                                  {isPick ? 
                                    `${item['Pick Type']} • Round ${item.Round} • ${item.Year}` :
                                    `${item.player.position} • ${item.player.team}${item.player.age ? ` • ${item.player.age} y.o.` : ''}`
                                  }
                                </div>
                                <div className="player-value">
                                  {isPick ? 
                                    `FC: ${Math.round(item['FantasyCalc SF Value'] || 0)} | KTC: ${Math.round(item['SFValue'] || 0)}` :
                                    (() => {
                                      const playerStats = getPlayerStats(item.player_id);
                                      return `Pts/g | Proj: ${playerStats.projPtsPerGame} Stats: ${playerStats.actualPtsPerGame}`;
                                    })()
                                  }
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    
                    <div className="selected-players">
                      {team2Players.map(player => (
                        <div key={player.id} className="trade-player-card">
                          <div className="player-info">
                            <div className="player-name">{player.name}</div>
                            <div className="player-details">
                              {player.isPick ? 
                                `${player.age} • Round ${player.rank} • ${player.team}` :
                                player.additionalData && !player.isPick ? 
                                  `Ovr${player.additionalData.rank_ppr || 'N/A'} • ${player.position}${player.additionalData.pos_rank_ppr || 'N/A'} • ${player.team} • ${player.age} y.o.` :
                                  `${player.rank} • ${player.team} • ${player.age} y.o.`
                              }
                            </div>
                          </div>
                          <div className="player-value">
                            {player.isPick ? (
                              <>
                                <div className="value-row">
                                  <span className="value-label">KeepTradeCut</span>
                                  <span className="value-ktc">{Math.round(player.additionalData?.['KTC Value'] || 0)}</span>
                                </div>
                                <div className="value-row">
                                  <span className="value-label">FantasyCalc</span>
                                  <span className="value-fc">{Math.round(player.additionalData?.['FC Value'] || 0)}</span>
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="value-row">
                                  <span className="value-label">Pts/g</span>
                                  <span className="value-separator">|</span>
                                  <span className="value-label">Proj:</span>
                                  <span className="value-proj">{player.projPtsPerGame}</span>
                                  <span className="value-label">2025:</span>
                                  <span className={`value-stats ${parseFloat(player.actualPtsPerGame) > parseFloat(player.projPtsPerGame) ? 'stats-better' : 'stats-worse'}`}>
                                    {player.actualPtsPerGame}
                                  </span>
                                </div>
                                {player.additionalData && (
                                  <>
                                    <div className="value-row">
                                      <span className="value-label">KeepTradeCut</span>
                                      <span className="value-ktc">{player.additionalData['KTC Value'] ? Math.round(player.additionalData['KTC Value']) : 'N/A'}</span>
                                    </div>
                                    <div className="value-row">
                                      <span className="value-label">FantasyCalc</span>
                                      <span className="value-fc">{player.additionalData['FC Value'] ? Math.round(player.additionalData['FC Value']) : 'N/A'}</span>
                                    </div>
                                  </>
                                )}
                              </>
                            )}
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

                {/* Trade Analysis Section - Only spans width of trade panels */}
                {team1Players.length > 0 || team2Players.length > 0 ? (
                  <div className="trade-analysis-container">
                    <div className="trade-analysis">
                      <h3>Trade Analysis</h3>
                      <div className="analysis-content-new">
                        {/* Rankings Section */}
                        <div className="analysis-section">
                          <h4 className="section-heading">Rankings</h4>
                          
                          {/* KTC Row */}
                          <div className="comparison-row">
                            <div className="team-value">
                              {Math.round(calculateKTCTotal(team1Players))}
                            </div>
                            <div className="diff-value">
                              {(() => {
                                const team1KTC = calculateKTCTotal(team1Players);
                                const team2KTC = calculateKTCTotal(team2Players);
                                const diff = Math.abs(team1KTC - team2KTC);
                                const arrow = team1KTC > team2KTC ? '←' : team1KTC < team2KTC ? '→' : '=';
                                return (
                                  <div className="diff-content">
                                    <div className="diff-label">KTC</div>
                                    <div className="diff-arrow">{arrow}</div>
                                    <div className="diff-number">{Math.round(diff)}</div>
                                  </div>
                                );
                              })()}
                            </div>
                            <div className="team-value">
                              {Math.round(calculateKTCTotal(team2Players))}
                            </div>
                          </div>

                          {/* FantasyCalc Row */}
                          <div className="comparison-row">
                            <div className="team-value">
                              {Math.round(calculateFCTotal(team1Players))}
                            </div>
                            <div className="diff-value">
                              {(() => {
                                const team1FC = calculateFCTotal(team1Players);
                                const team2FC = calculateFCTotal(team2Players);
                                const diff = Math.abs(team1FC - team2FC);
                                const arrow = team1FC > team2FC ? '←' : team1FC < team2FC ? '→' : '=';
                                return (
                                  <div className="diff-content">
                                    <div className="diff-label">FantasyCalc</div>
                                    <div className="diff-arrow">{arrow}</div>
                                    <div className="diff-number">{Math.round(diff)}</div>
                                  </div>
                                );
                              })()}
                            </div>
                            <div className="team-value">
                              {Math.round(calculateFCTotal(team2Players))}
                            </div>
                          </div>
                        </div>

                        {/* Player Info Section */}
                        <div className="analysis-section">
                          <h4 className="section-heading">Player Info</h4>
                          
                          {/* Projected Points per Game Row */}
                          <div className="comparison-row">
                            <div className="team-value">
                              {calculateTotalProjPtsPerGame(team1Players)}
                            </div>
                            <div className="diff-value">
                              {(() => {
                                const team1PPG = parseFloat(calculateTotalProjPtsPerGame(team1Players));
                                const team2PPG = parseFloat(calculateTotalProjPtsPerGame(team2Players));
                                const diff = Math.abs(team1PPG - team2PPG);
                                const arrow = team1PPG > team2PPG ? '←' : team1PPG < team2PPG ? '→' : '=';
                                return (
                                  <div className="diff-content">
                                    <div className="diff-label">Proj Pts/Game</div>
                                    <div className="diff-arrow">{arrow}</div>
                                    <div className="diff-number">{diff.toFixed(1)}</div>
                                  </div>
                                );
                              })()}
                            </div>
                            <div className="team-value">
                              {calculateTotalProjPtsPerGame(team2Players)}
                            </div>
                          </div>

                          {/* 2025 Points per Game Row */}
                          <div className="comparison-row">
                            <div className="team-value">
                              {calculateTotal2025PtsPerGame(team1Players)}
                            </div>
                            <div className="diff-value">
                              {(() => {
                                const team1PPG = parseFloat(calculateTotal2025PtsPerGame(team1Players));
                                const team2PPG = parseFloat(calculateTotal2025PtsPerGame(team2Players));
                                const diff = Math.abs(team1PPG - team2PPG);
                                const arrow = team1PPG > team2PPG ? '←' : team1PPG < team2PPG ? '→' : '=';
                                return (
                                  <div className="diff-content">
                                    <div className="diff-label">2025 Pts/Game</div>
                                    <div className="diff-arrow">{arrow}</div>
                                    <div className="diff-number">{diff.toFixed(1)}</div>
                                  </div>
                                );
                              })()}
                            </div>
                            <div className="team-value">
                              {calculateTotal2025PtsPerGame(team2Players)}
                            </div>
                          </div>

                          {/* Average Age Row */}
                          <div className="comparison-row">
                            <div className="team-value">
                              {calculateAvgAge(team1Players)}
                            </div>
                            <div className="diff-value">
                              {(() => {
                                const team1Age = calculateAvgAge(team1Players);
                                const team2Age = calculateAvgAge(team2Players);
                                if (team1Age === 'N/A' || team2Age === 'N/A') {
                                  return (
                                    <div className="diff-content">
                                      <div className="diff-label">Avg Age</div>
                                      <div className="diff-arrow">=</div>
                                      <div className="diff-number">N/A</div>
                                    </div>
                                  );
                                }
                                const diff = Math.abs(parseFloat(team1Age) - parseFloat(team2Age));
                                const arrow = parseFloat(team1Age) < parseFloat(team2Age) ? '←' : parseFloat(team1Age) > parseFloat(team2Age) ? '→' : '=';
                                return (
                                  <div className="diff-content">
                                    <div className="diff-label">Avg Age</div>
                                    <div className="diff-arrow">{arrow}</div>
                                    <div className="diff-number">{diff.toFixed(1)}</div>
                                  </div>
                                );
                              })()}
                            </div>
                            <div className="team-value">
                              {calculateAvgAge(team2Players)}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              {/* League Info Column */}
              <div className="league-info-column">
                <div className="league-info-header">
                  <h3>League Info</h3>
                </div>
                <div className="trade-league-grid">
                  <div className="trade-league-header">
                    <div className={`trade-league-name-header sortable ${sortConfig.key === 'name' ? 'active' : ''}`} onClick={() => handleSort('name')}>
                      League Name
                      <FontAwesomeIcon icon={getSortIcon('name')} className="sort-icon" />
                    </div>
                    <div className="trade-league-player-header">#</div>
                    <div className="trade-league-owner-header">Team Owner</div>
                    <div className={`trade-league-record-header sortable ${sortConfig.key === 'record' ? 'active' : ''}`} onClick={() => handleSort('record')}>
                      Record
                      <FontAwesomeIcon icon={getSortIcon('record')} className="sort-icon" />
                    </div>
                  </div>
                  {getSortedPlayersByLeague().map((leagueGroup, groupIndex) => (
                    <React.Fragment key={leagueGroup.league.league_id}>
                      {leagueGroup.players.map((playerData, playerIndex) => (
                        <div key={`${leagueGroup.league.league_id}-${playerData.player.id}`} className="trade-league-row">
                          {playerIndex === 0 && (
                            <div className={`trade-league-name ${leagueGroup.allSameOwner ? 'same-owner-league' : ''}`} title={leagueGroup.league.name}>
                              {truncateMiddle(leagueGroup.league.name, 25)}
                            </div>
                          )}
                          {playerIndex > 0 && <div className="trade-league-name"></div>}
                          <div className="trade-league-player">{playerData.playerNumber}</div>
                          <div className={`trade-league-owner ${leagueGroup.ownerMatches[playerIndex] ? 'same-owner' : ''}`}>
                            {getTeamName(leagueGroup.league.league_id, playerData.roster.owner_id)}
                          </div>
                          <div className={`trade-league-record ${leagueGroup.ownerMatches[playerIndex] ? 'same-owner' : ''}`}>
                            {`${playerData.roster.settings?.wins || 0}-${playerData.roster.settings?.losses || 0}-${playerData.roster.settings?.ties || 0}`}
                          </div>
                        </div>
                      ))}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TradeAnalyzer;

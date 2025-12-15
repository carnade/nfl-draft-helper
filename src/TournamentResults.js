import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import './TournamentResults.css';

// Add a mock flag
const mock = false; // Set to true for localhost, false for production

// Define the base URL based on the mock flag
const BASE_URL = mock
  ? "http://localhost:5000"
  : "https://shaggy-latashia-carnade-2ea2054a.koyeb.app";

function TournamentResults() {
  const { tournamentId } = useParams();
  const navigate = useNavigate();
  const [tournamentData, setTournamentData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [leagueInfo, setLeagueInfo] = useState({}); // league_id -> { startingPositions, rosters }
  const [playerToRosterMap, setPlayerToRosterMap] = useState({}); // league_id -> { player_id -> roster_id }
  const [matchupData, setMatchupData] = useState({}); // league_id -> matchup data
  const [playerPositions, setPlayerPositions] = useState({}); // player_id -> position

  // Fetch tournament data and process league information
  useEffect(() => {
    const loadTournamentData = async () => {
      setLoading(true);
      setError('');
      try {
        // Fetch tournament data from API
        const response = await fetch(`${BASE_URL}/tournament/${tournamentId}`);
        
        if (!response.ok) {
          throw new Error('Failed to fetch tournament data');
        }
        
        const apiTournamentData = await response.json();
        
        // API response: { id, week, name, games: [...], created_at }
        const tournamentWeek = apiTournamentData.week;
        const games = apiTournamentData.games;

        // Get unique league IDs (ensure they're strings to avoid precision loss)
        const uniqueLeagues = new Set();
        games.forEach(game => {
          const league1 = String(game.player1.league);
          const league2 = String(game.player2.league);
          uniqueLeagues.add(league1);
          uniqueLeagues.add(league2);
        });

        // Fetch league info and rosters for each unique league first
        const leagueInfoMap = {};
        const playerRosterMap = {};
        const matchupDataMap = {}; // Build locally first, then set state once

        for (const leagueId of uniqueLeagues) {
          try {
            // Step 1: Fetch league info to get roster_positions
            const leagueResponse = await fetch(`https://api.sleeper.app/v1/league/${leagueId}`);
            if (!leagueResponse.ok) {
              throw new Error(`Failed to fetch league ${leagueId}`);
            }
            const leagueData = await leagueResponse.json();
            
            // Count starting positions (everything that's not "BN")
            const startingPositions = leagueData.roster_positions.filter(pos => pos !== 'BN').length;
            
            leagueInfoMap[leagueId] = {
              startingPositions,
              rosterPositions: leagueData.roster_positions
            };

            // Step 2: Fetch rosters to map player_id to roster_id
            const rostersResponse = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/rosters`);
            if (!rostersResponse.ok) {
              throw new Error(`Failed to fetch rosters for league ${leagueId}`);
            }
            const rostersData = await rostersResponse.json();
            
            // Create map: player_id -> roster_id (and owner_id for each roster)
            const playerMap = {};
            const rosterOwnerMap = {}; // roster_id -> owner_id
            
            rostersData.forEach(roster => {
              rosterOwnerMap[roster.roster_id] = roster.owner_id;
              // Map all players in this roster
              if (roster.players && Array.isArray(roster.players)) {
                roster.players.forEach(playerId => {
                  playerMap[playerId] = roster.roster_id;
                });
              }
            });
            
            playerRosterMap[leagueId] = {
              playerToRoster: playerMap,
              rosterToOwner: rosterOwnerMap
            };

            // Step 3: Fetch matchups using week from tournament data
            const matchupsResponse = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/matchups/${tournamentWeek}`);
            if (!matchupsResponse.ok) {
              throw new Error(`Failed to fetch matchups for league ${leagueId} week ${tournamentWeek}`);
            }
            const matchupsData = await matchupsResponse.json();
            
            // Store matchup data in local map (will set state once after loop)
            matchupDataMap[leagueId] = matchupsData;

          } catch (leagueError) {
            console.error(`Error processing league ${leagueId}:`, leagueError);
          }
        }

        // Collect player IDs only from rosters that belong to teams in the tournament
        // We need to find the rosters for each tournament participant and collect their players
        const allPlayerIds = new Set();
        
        // For each game, find the roster for each player and collect their player IDs
        games.forEach(game => {
          // Player 1
          const league1Id = String(game.player1.league);
          const owner1Id = String(game.player1.playerid);
          const rosterMap1 = playerRosterMap[league1Id];
          if (rosterMap1 && rosterMap1.rosterToOwner) {
            // Find roster_id that matches this owner_id
            const rosterId1 = Object.keys(rosterMap1.rosterToOwner).find(
              rosterId => String(rosterMap1.rosterToOwner[rosterId]) === owner1Id
            );
            if (rosterId1 && rosterMap1.playerToRoster) {
              // Get all players from this roster
              Object.entries(rosterMap1.playerToRoster).forEach(([playerId, rosterId]) => {
                if (String(rosterId) === rosterId1) {
                  allPlayerIds.add(playerId);
                }
              });
            }
          }
          
          // Player 2
          const league2Id = String(game.player2.league);
          const owner2Id = String(game.player2.playerid);
          const rosterMap2 = playerRosterMap[league2Id];
          if (rosterMap2 && rosterMap2.rosterToOwner) {
            // Find roster_id that matches this owner_id
            const rosterId2 = Object.keys(rosterMap2.rosterToOwner).find(
              rosterId => String(rosterMap2.rosterToOwner[rosterId]) === owner2Id
            );
            if (rosterId2 && rosterMap2.playerToRoster) {
              // Get all players from this roster
              Object.entries(rosterMap2.playerToRoster).forEach(([playerId, rosterId]) => {
                if (String(rosterId) === rosterId2) {
                  allPlayerIds.add(playerId);
                }
              });
            }
          }
        });

        // Fetch player positions from bestball endpoint only for players on tournament teams
        const playerIdsArray = Array.from(allPlayerIds);
        let positionMap = {}; // Initialize outside so it's available after the if block
        if (playerIdsArray.length > 0) {
          try {
            console.log('Fetching player positions for', playerIdsArray.length, 'players:', playerIdsArray.slice(0, 5), '...');
            const positionsResponse = await fetch(`${BASE_URL}/getplayers/bestball`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ playerlist: playerIdsArray })
            });
            
            console.log('Positions response status:', positionsResponse.status, positionsResponse.ok);
            
            if (positionsResponse.ok) {
              const positionsData = await positionsResponse.json();
              console.log('Raw positions response:', positionsData);
              console.log('Response type:', typeof positionsData, 'is array:', Array.isArray(positionsData));
              
              // Handle different response formats
              // Format 1: { playerId: { position: ... }, ... } - object with player IDs as keys
              // Format 2: { players: [{ id: ..., position: ... }] } - array in players property
              // Format 3: [{ id: ..., position: ... }] - direct array
              
              let playersToProcess = [];
              
              if (Array.isArray(positionsData)) {
                // Direct array
                playersToProcess = positionsData;
              } else if (positionsData.players && Array.isArray(positionsData.players)) {
                // Array in players property
                playersToProcess = positionsData.players;
              } else {
                // Object format - convert to array of entries
                playersToProcess = Object.entries(positionsData).map(([key, value]) => {
                  // If value is an object with an id, use it; otherwise key is the id
                  if (value && typeof value === 'object') {
                    return { id: key, ...value };
                  }
                  return { id: key, ...value };
                });
              }
              
              console.log('Processed playersToProcess (first 3):', playersToProcess.slice(0, 3));
              
              // Map player_id -> position
              playersToProcess.forEach(player => {
                const playerId = player.id || player.sleeper_id || player.player_id;
                const position = player.position || player.pos || 
                               (Array.isArray(player.fantasy_positions) ? player.fantasy_positions[0] : undefined);
                
                if (playerId && position) {
                  positionMap[playerId] = position;
                } else {
                  console.log('Missing position/id for player:', player);
                }
              });
              
              console.log('Player positions loaded:', positionMap, 'count:', Object.keys(positionMap).length);
            } else {
              const errorText = await positionsResponse.text();
              console.error('Positions response error:', positionsResponse.status, errorText);
            }
          } catch (error) {
            console.error('Error fetching player positions:', error);
          }
        } else {
          console.log('No player IDs to fetch positions for');
        }

        // Set all state at once after all data is fetched
        setLeagueInfo(leagueInfoMap);
        setPlayerToRosterMap(playerRosterMap);
        setMatchupData(matchupDataMap);
        setPlayerPositions(positionMap);
        
        console.log('All data loaded:', {
          leagueInfo: leagueInfoMap,
          playerToRosterMap: playerRosterMap,
          matchupData: matchupDataMap,
          playerPositionsCount: Object.keys(positionMap).length,
          playerCount: playerIdsArray.length
        });

        setTournamentData({
          id: apiTournamentData.id,
          name: apiTournamentData.name || 'Tournament',
          week: tournamentWeek,
          games: games
        });
      } catch (error) {
        console.error('Error loading tournament data:', error);
        setError('Failed to load tournament data');
      } finally {
        setLoading(false);
      }
    };

    loadTournamentData();
  }, [tournamentId]);

  // Calculate optimal lineup points for a player based on their roster
  const getPlayerPoints = (player) => {
    const leagueId = String(player.league);
    const ownerId = String(player.playerid); // This is the owner_id, not a player_id
    
    console.log('getPlayerPoints called for:', { leagueId, ownerId, player });
    
    // Get roster_id for this owner
    const leagueRosterMap = playerToRosterMap[leagueId];
    if (!leagueRosterMap || !leagueRosterMap.rosterToOwner) {
      console.log('No leagueRosterMap for leagueId:', leagueId, 'playerToRosterMap:', playerToRosterMap);
      return 0;
    }
    
    // Find roster_id by matching owner_id
    const rosterId = Object.keys(leagueRosterMap.rosterToOwner).find(
      rid => String(leagueRosterMap.rosterToOwner[rid]) === ownerId
    );
    
    console.log('Found rosterId:', rosterId, 'for ownerId:', ownerId, 'rosterToOwner map:', leagueRosterMap.rosterToOwner);
    
    if (!rosterId) {
      console.log('No rosterId found for ownerId:', ownerId);
      return 0;
    }
    
    // Get league info (roster positions)
    const leagueData = leagueInfo[leagueId];
    if (!leagueData || !leagueData.rosterPositions) {
      console.log('No leagueData for leagueId:', leagueId, 'leagueInfo:', leagueInfo);
      return 0;
    }
    
    // Get matchup data for this league
    const matchups = matchupData[leagueId];
    if (!matchups || !Array.isArray(matchups)) {
      console.log('No matchups for leagueId:', leagueId, 'matchupData:', matchupData);
      return 0;
    }
    
    // Find the matchup for this roster
    const rosterMatchup = matchups.find(m => String(m.roster_id) === String(rosterId));
    console.log('Found rosterMatchup:', rosterMatchup, 'looking for roster_id:', rosterId);
    
    if (!rosterMatchup || !rosterMatchup.players_points) {
      console.log('No rosterMatchup or players_points for rosterId:', rosterId);
      return 0;
    }
    
    // Get all player points for this roster
    const playerPointsMap = rosterMatchup.players_points; // player_id -> points
    
    // Get roster positions (e.g., ["QB", "RB", "RB", "WR", "WR", "WR", "TE", "FLEX", "FLEX", "FLEX", "SUPER_FLEX", "BN", ...])
    const rosterPositions = leagueData.rosterPositions;
    const startingPositions = rosterPositions.filter(pos => pos !== 'BN');
    
    // Get all players for this roster with their points and positions
    const rosterPlayers = Object.entries(playerPointsMap)
      .map(([pid, points]) => {
        const position = playerPositions[pid];
        return {
          playerId: pid,
          points: points || 0,
          position: position || 'UNKNOWN'
        };
      })
      .filter(p => p.points > 0); // Only players with points
    
    // Group players by position
    const playersByPosition = {
      QB: [],
      RB: [],
      WR: [],
      TE: [],
      DST: [],
      K: []
    };
    
    rosterPlayers.forEach(player => {
      const pos = player.position;
      if (playersByPosition[pos]) {
        playersByPosition[pos].push(player);
      }
    });
    
    // Sort each position by points (descending)
    Object.keys(playersByPosition).forEach(pos => {
      playersByPosition[pos].sort((a, b) => b.points - a.points);
    });
    
    // Build optimal lineup
    let totalPoints = 0;
    const usedPlayers = new Set();
    
    // Track position requirements
    const positionCounts = {};
    startingPositions.forEach(pos => {
      if (pos !== 'BN') {
        positionCounts[pos] = (positionCounts[pos] || 0) + 1;
      }
    });
    
    // Fill required positions first
    Object.entries(positionCounts).forEach(([pos, count]) => {
      if (pos === 'FLEX' || pos === 'SUPER_FLEX') {
        return; // Handle flex positions separately
      }
      
      const availablePlayers = playersByPosition[pos] || [];
      for (let i = 0; i < count && i < availablePlayers.length; i++) {
        const player = availablePlayers[i];
        if (!usedPlayers.has(player.playerId)) {
          totalPoints += player.points;
          usedPlayers.add(player.playerId);
        }
      }
    });
    
    // Fill FLEX positions (RB, WR, or TE)
    const flexCount = positionCounts['FLEX'] || 0;
    const flexEligible = [
      ...playersByPosition.RB,
      ...playersByPosition.WR,
      ...playersByPosition.TE
    ]
      .filter(p => !usedPlayers.has(p.playerId))
      .sort((a, b) => b.points - a.points);
    
    for (let i = 0; i < flexCount && i < flexEligible.length; i++) {
      totalPoints += flexEligible[i].points;
      usedPlayers.add(flexEligible[i].playerId);
    }
    
    // Fill SUPER_FLEX positions (QB, RB, WR, or TE)
    const superFlexCount = positionCounts['SUPER_FLEX'] || 0;
    const superFlexEligible = [
      ...playersByPosition.QB,
      ...playersByPosition.RB,
      ...playersByPosition.WR,
      ...playersByPosition.TE
    ]
      .filter(p => !usedPlayers.has(p.playerId))
      .sort((a, b) => b.points - a.points);
    
    for (let i = 0; i < superFlexCount && i < superFlexEligible.length; i++) {
      totalPoints += superFlexEligible[i].points;
      usedPlayers.add(superFlexEligible[i].playerId);
    }
    
    console.log('Final totalPoints:', totalPoints, 'for player:', player);
    return Math.round(totalPoints * 100) / 100; // Round to 2 decimal places
  };

  if (loading) {
    return (
      <div className="tournament-results-container">
        <div className="tournament-results-loading">Loading tournament results...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="tournament-results-container">
        <div className="tournament-results-error">{error}</div>
      </div>
    );
  }

  if (!tournamentData) {
    return (
      <div className="tournament-results-container">
        <div className="tournament-results-error">Tournament not found</div>
      </div>
    );
  }

  return (
    <div className="tournament-results-container">
      <div className="tournament-results-header">
        <button
          className="tournament-back-btn"
          onClick={() => navigate('/tournaments')}
        >
          ← Back
        </button>
        <h1 className="tournament-results-title">{tournamentData.name}</h1>
      </div>

      <div className="tournament-results-content">
        <div className="tournament-matchups">
          {tournamentData.games.map((game, index) => {
            // Only calculate points if we have the essential data loaded
            // Note: playerPositions might be empty, but we can still calculate (will use 'UNKNOWN' as fallback)
            const hasEssentialData = Object.keys(leagueInfo).length > 0 && 
                                     Object.keys(playerToRosterMap).length > 0 && 
                                     Object.keys(matchupData).length > 0;
            
            const player1Points = hasEssentialData ? getPlayerPoints(game.player1) : 0;
            const player2Points = hasEssentialData ? getPlayerPoints(game.player2) : 0;
            
            console.log('Rendering game:', index, 'hasEssentialData:', hasEssentialData, 
                       'playerPositions count:', Object.keys(playerPositions).length,
                       'player1Points:', player1Points, 'player2Points:', player2Points);

            return (
              <div key={index} className="tournament-matchup-row">
                <div className="tournament-matchup-grid">
                  {/* Player 1: League_name #position username points */}
                  <span className="tournament-league-name">{game.player1.league_name}</span>
                  <span className="tournament-position">#{game.player1.leagie_position}</span>
                  <span className="tournament-player-name">{game.player1.playername}</span>
                  <span className="tournament-player-points">{player1Points}</span>
                  
                  <span className="tournament-matchup-separator">vs</span>
                  
                  {/* Player 2: points username #position leaguename */}
                  <span className="tournament-player-points">{player2Points}</span>
                  <span className="tournament-player-name">{game.player2.playername}</span>
                  <span className="tournament-position">#{game.player2.leagie_position}</span>
                  <span className="tournament-league-name">{game.player2.league_name}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default TournamentResults;


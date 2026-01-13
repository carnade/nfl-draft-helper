import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import './TournamentResults.css';

// Add a mock flag
const mock = true; // Set to true for localhost, false for production

// Define the base URL based on the mock flag
const BASE_URL = mock
  ? "http://localhost:5000"
  : "https://shaggy-latashia-carnade-2ea2054a.koyeb.app";

function TournamentResults() {
  const { tournamentId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [tournamentData, setTournamentData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [leagueInfo, setLeagueInfo] = useState({}); // league_id -> { startingPositions, rosters }
  const [playerToRosterMap, setPlayerToRosterMap] = useState({}); // league_id -> { player_id -> roster_id }
  const [matchupData, setMatchupData] = useState({}); // league_id -> matchup data
  const [playerPositions, setPlayerPositions] = useState({}); // player_id -> position
  const [playerMetadata, setPlayerMetadata] = useState({}); // player_id -> { name, position }
  const [expandedRows, setExpandedRows] = useState(new Set()); // Track expanded rows

  // Get week from query param or tournament data
  const getEffectiveWeek = useCallback((tournamentWeek) => {
    const weekParam = searchParams.get('week');
    return weekParam ? parseInt(weekParam, 10) : tournamentWeek;
  }, [searchParams]);

  // Fetch matchup data for all leagues
  const fetchMatchupData = useCallback(async (uniqueLeagues, effectiveWeek, playerRosterMap, leagueInfoMap) => {
    const matchupDataMap = {};
    
    for (const leagueId of uniqueLeagues) {
      try {
        // Step 3: Fetch matchups using effective week
        const matchupsResponse = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/matchups/${effectiveWeek}`);
        if (!matchupsResponse.ok) {
          throw new Error(`Failed to fetch matchups for league ${leagueId} week ${effectiveWeek}`);
        }
        const matchupsData = await matchupsResponse.json();
        
        // Store matchup data in local map (will set state once after loop)
        matchupDataMap[leagueId] = matchupsData;
      } catch (error) {
        console.error(`Error fetching matchups for league ${leagueId}:`, error);
      }
    }
    
    return matchupDataMap;
  }, []);

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
        const effectiveWeek = getEffectiveWeek(tournamentWeek);
        const tournamentType = apiTournamentData.type || 'h2h';
        const games = apiTournamentData.games || [];
        const players = apiTournamentData.players || [];

        // Get unique league IDs (ensure they're strings to avoid precision loss)
        const uniqueLeagues = new Set();
        if (tournamentType === 'h2h') {
          games.forEach(game => {
            const league1 = String(game.player1.league);
            const league2 = String(game.player2.league);
            uniqueLeagues.add(league1);
            uniqueLeagues.add(league2);
          });
        } else {
          // PTS mode: collect leagues from players array
          players.forEach(player => {
            uniqueLeagues.add(String(player.league));
          });
        }

        // Fetch league info and rosters for each unique league first
        const leagueInfoMap = {};
        const playerRosterMap = {};

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

          } catch (leagueError) {
            console.error(`Error processing league ${leagueId}:`, leagueError);
          }
        }

        // Collect player IDs only from rosters that belong to teams in the tournament
        // We need to find the rosters for each tournament participant and collect their players
        const allPlayerIds = new Set();
        
        if (tournamentType === 'h2h') {
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
        } else {
          // PTS mode: collect player IDs from players array
          players.forEach(player => {
            const leagueId = String(player.league);
            const ownerId = String(player.playerid);
            const rosterMap = playerRosterMap[leagueId];
            if (rosterMap && rosterMap.rosterToOwner) {
              // Find roster_id that matches this owner_id
              const rosterId = Object.keys(rosterMap.rosterToOwner).find(
                rosterId => String(rosterMap.rosterToOwner[rosterId]) === ownerId
              );
              if (rosterId && rosterMap.playerToRoster) {
                // Get all players from this roster
                Object.entries(rosterMap.playerToRoster).forEach(([playerId, mappedRosterId]) => {
                  if (String(mappedRosterId) === rosterId) {
                    allPlayerIds.add(playerId);
                  }
                });
              }
            }
          });
        }

        // Fetch matchup data using the helper function
        const matchupDataMap = await fetchMatchupData(
          uniqueLeagues,
          effectiveWeek,
          playerRosterMap,
          leagueInfoMap
        );

        // Fetch player positions from bestball endpoint only for players on tournament teams
        const playerIdsArray = Array.from(allPlayerIds);
        let positionMap = {}; // Initialize outside so it's available after the if block
        let metadataMap = {}; // Store player metadata (name, position)
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
              
              // Map player_id -> position and metadata
              playersToProcess.forEach(player => {
                const playerId = player.id || player.sleeper_id || player.player_id;
                const position = player.position || player.pos || 
                               (Array.isArray(player.fantasy_positions) ? player.fantasy_positions[0] : undefined);
                const name = player.name || [player.first_name, player.last_name].filter(Boolean).join(' ').trim() || `Player ${playerId}`;
                
                if (playerId) {
                  positionMap[playerId] = position;
                  metadataMap[playerId] = { name, position };
                } else {
                  console.log('Missing id for player:', player);
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
        setPlayerMetadata(metadataMap);
        
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
          effectiveWeek: effectiveWeek,
          type: apiTournamentData.type || 'h2h',
          games: apiTournamentData.games || [],
          players: apiTournamentData.players || []
        });
      } catch (error) {
        console.error('Error loading tournament data:', error);
        setError('Failed to load tournament data');
      } finally {
        setLoading(false);
      }
    };

    loadTournamentData();
  }, [tournamentId, getEffectiveWeek, fetchMatchupData]);

  // Calculate optimal lineup points for a player based on their roster
  // NOTE: This function is kept for potential future use, but currently we use getPlayerPointsSimple
  // eslint-disable-next-line no-unused-vars
  const getPlayerPointsOld = (player) => {
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
    
    // Get all player points for this roster, but only include starters (exclude reserve and taxi)
    const allPlayerPointsMap = rosterMatchup.players_points; // player_id -> points
    const starters = rosterMatchup.starters || [];
    const startersSet = new Set(starters.map(id => String(id)));
    
    // Filter to only include players that are in starters array
    const playerPointsMap = {};
    Object.entries(allPlayerPointsMap).forEach(([pid, points]) => {
      if (startersSet.has(String(pid))) {
        playerPointsMap[pid] = points;
      }
    });
    
    // Get roster positions (e.g., ["QB", "RB", "RB", "WR", "WR", "WR", "TE", "FLEX", "FLEX", "FLEX", "SUPER_FLEX", "BN", ...])
    const rosterPositions = leagueData.rosterPositions;
    const startingPositions = rosterPositions.filter(pos => pos !== 'BN');
    
    // Get all players for this roster with their points and positions (only starters)
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

  // Simplified version: just use the points field from matchup data directly
  // This is the active function that replaces the complex optimal lineup calculation
  const getPlayerPoints = (player) => {
    const leagueId = String(player.league);
    const ownerId = String(player.playerid); // This is the owner_id, not a player_id
    
    // Get roster_id for this owner
    const leagueRosterMap = playerToRosterMap[leagueId];
    if (!leagueRosterMap || !leagueRosterMap.rosterToOwner) {
      return 0;
    }
    
    // Find roster_id by matching owner_id
    const rosterId = Object.keys(leagueRosterMap.rosterToOwner).find(
      rid => String(leagueRosterMap.rosterToOwner[rid]) === ownerId
    );
    
    if (!rosterId) {
      return 0;
    }
    
    // Get matchup data for this league
    const matchups = matchupData[leagueId];
    if (!matchups || !Array.isArray(matchups)) {
      return 0;
    }
    
    // Find the matchup for this roster
    const rosterMatchup = matchups.find(m => String(m.roster_id) === String(rosterId));
    
    if (!rosterMatchup || rosterMatchup.points === undefined) {
      return 0;
    }
    
    // Use the points field directly from matchup data
    return Math.round(rosterMatchup.points * 100) / 100; // Round to 2 decimal places
  };

  // Get optimal lineup and bench players for display
  const getOptimalLineup = (player) => {
    const leagueId = String(player.league);
    const ownerId = String(player.playerid);
    
    // Get roster_id for this owner
    const leagueRosterMap = playerToRosterMap[leagueId];
    if (!leagueRosterMap || !leagueRosterMap.rosterToOwner) {
      return { lineup: [], bench: [], totalPoints: 0 };
    }
    
    // Find roster_id by matching owner_id
    const rosterId = Object.keys(leagueRosterMap.rosterToOwner).find(
      rid => String(leagueRosterMap.rosterToOwner[rid]) === ownerId
    );
    
    if (!rosterId) {
      return { lineup: [], bench: [], totalPoints: 0 };
    }
    
    // Get league info (roster positions)
    const leagueData = leagueInfo[leagueId];
    if (!leagueData || !leagueData.rosterPositions) {
      return { lineup: [], bench: [], totalPoints: 0 };
    }
    
    // Get matchup data for this league
    const matchups = matchupData[leagueId];
    if (!matchups || !Array.isArray(matchups)) {
      return { lineup: [], bench: [], totalPoints: 0 };
    }
    
    // Find the matchup for this roster
    const rosterMatchup = matchups.find(m => String(m.roster_id) === String(rosterId));
    
    if (!rosterMatchup || !rosterMatchup.players_points) {
      return { lineup: [], bench: [], totalPoints: 0 };
    }
    
    // Get all player points for this roster
    const allPlayerPointsMap = rosterMatchup.players_points;
    const starters = rosterMatchup.starters || [];
    const startersSet = new Set(starters.map(id => String(id)));
    
    // Get roster positions
    const rosterPositions = leagueData.rosterPositions;
    const startingPositions = rosterPositions.filter(pos => pos !== 'BN');
    
    // Get all players for this roster with their points and positions (starters only for optimal lineup)
    const starterPlayers = Object.entries(allPlayerPointsMap)
      .filter(([pid]) => startersSet.has(String(pid))) // Only include starters
      .map(([pid, points]) => {
        const position = playerPositions[pid] || 'UNKNOWN';
        return {
          playerId: pid,
          points: points || 0,
          position: position
        };
      });
    
    // Get bench players (players NOT in starters array)
    const benchPlayersList = Object.entries(allPlayerPointsMap)
      .filter(([pid]) => !startersSet.has(String(pid))) // Only include non-starters
      .map(([pid, points]) => {
        const position = playerPositions[pid] || 'UNKNOWN';
        return {
          playerId: pid,
          points: points || 0,
          position: position
        };
      });
    
    // Group starter players by position for optimal lineup calculation
    const playersByPosition = {
      QB: [],
      RB: [],
      WR: [],
      TE: [],
      DST: [],
      K: []
    };
    
    starterPlayers.forEach(player => {
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
    const lineupPlayers = [];
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
          lineupPlayers.push({ ...player, slot: pos });
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
      lineupPlayers.push({ ...flexEligible[i], slot: 'FLEX' });
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
      lineupPlayers.push({ ...superFlexEligible[i], slot: 'SUPER_FLEX' });
      usedPlayers.add(superFlexEligible[i].playerId);
    }
    
    // Bench players are all players NOT in starters array, sorted by points
    const benchPlayers = benchPlayersList.sort((a, b) => b.points - a.points);
    
    const totalPoints = lineupPlayers.reduce((sum, p) => sum + p.points, 0);
    
    return { 
      lineup: lineupPlayers, 
      bench: benchPlayers, 
      totalPoints: Math.round(totalPoints * 100) / 100 
    };
  };

  // Position color helper (same as DFS)
  const getPositionColor = (position) => {
    const colors = {
      QB: 'rgba(239, 116, 161, 0.8)',
      RB: 'rgba(143, 242, 202, 0.8)',
      WR: 'rgba(86, 201, 248, 0.8)',
      TE: 'rgba(254, 174, 88, 0.8)',
      FLX: 'rgb(235, 88, 254, 0.8)',
      FLEX: 'rgb(235, 88, 254, 0.8)',
      SUPER_FLEX: 'rgb(235, 88, 254, 0.8)',
      DST: 'rgb(239, 91, 47, 0.8)',
      K: 'rgba(143, 242, 202, 0.8)'
    };
    return colors[position] || '#ccc';
  };

  // Position label helper
  const getPositionLabel = (slot) => {
    if (slot === 'RB1' || slot === 'RB2') return 'RB';
    if (slot === 'WR1' || slot === 'WR2' || slot === 'WR3') return 'WR';
    return slot;
  };

  // Get player name from player ID
  const getPlayerName = (playerId) => {
    return playerMetadata[playerId]?.name || `Player ${playerId}`;
  };

  const toggleRowExpansion = (rowId) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(rowId)) {
        newSet.delete(rowId);
      } else {
        newSet.add(rowId);
      }
      return newSet;
    });
  };

  // Render position badge with split color for special positions
  const renderPositionBadge = (slot, actualPosition) => {
    const label = slot === 'BN' ? 'BN' : getPositionLabel(slot);
    
    // FLEX and SUPER_FLEX: half pink (FLX color), half actual position color
    if ((slot === 'FLEX' || slot === 'SUPER_FLEX') && actualPosition && actualPosition !== 'UNKNOWN') {
      const flexColor = 'rgb(235, 88, 254, 0.8)'; // Pink FLX color
      const positionColor = getPositionColor(actualPosition);
      return (
        <div 
          className="position-badge position-badge-split"
          style={{ 
            background: `linear-gradient(to right, ${flexColor} 50%, ${positionColor} 50%)`
          }}
        >
          {label}
        </div>
      );
    }
    
    // BN: half grey, half actual position color
    if (slot === 'BN' && actualPosition && actualPosition !== 'UNKNOWN') {
      const positionColor = getPositionColor(actualPosition);
      return (
        <div 
          className="position-badge position-badge-split"
          style={{ 
            background: `linear-gradient(to right, #6c757d 50%, ${positionColor} 50%)`
          }}
        >
          {label}
        </div>
      );
    }
    
    // Regular badge for non-special positions
    const color = slot === 'BN' ? '#6c757d' : getPositionColor(slot || actualPosition);
    return (
      <div 
        className="position-badge"
        style={{ backgroundColor: color }}
      >
        {label}
      </div>
    );
  };

  // Render team view (lineup + bench) similar to DFS team table
  const renderTeamView = (lineupData) => {
    const { lineup, bench, totalPoints } = lineupData;
    
    return (
      <div className="tournament-team-table-wrapper">
        <div className="tournament-team-section">
          <table className="tournament-team-table">
            <thead>
              <tr>
                <th>Position</th>
                <th>Player</th>
                <th>Points</th>
              </tr>
            </thead>
            <tbody>
              {lineup.map((player, idx) => (
                <tr key={idx}>
                  <td>
                    {renderPositionBadge(player.slot, player.position)}
                  </td>
                  <td className="player-name-cell">
                    {getPlayerName(player.playerId)}
                  </td>
                  <td className="fpts-cell">
                    {player.points.toFixed(1)}
                  </td>
                </tr>
              ))}
              <tr className="total-row">
                <td colSpan="2"><strong>Total</strong></td>
                <td className="fpts-cell">
                  <strong>{totalPoints.toFixed(1)}</strong>
                </td>
              </tr>
              {bench.length > 0 && (
                <>
                  <tr className="bench-separator">
                    <td colSpan="3"></td>
                  </tr>
                  {bench.map((player, idx) => (
                    <tr key={`bench-${idx}`}>
                      <td>
                        {renderPositionBadge('BN', player.position)}
                      </td>
                      <td className="player-name-cell">
                        {getPlayerName(player.playerId)}
                      </td>
                      <td className="fpts-cell">
                        {player.points.toFixed(1)}
                      </td>
                    </tr>
                  ))}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
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

  const handleRefresh = async () => {
    if (!tournamentData) return;
    
    setRefreshing(true);
    setError('');
    
    try {
      const effectiveWeek = getEffectiveWeek(tournamentData.week);
      
      // Get unique league IDs
      const uniqueLeagues = new Set();
      if (tournamentData.type === 'h2h') {
        tournamentData.games.forEach(game => {
          uniqueLeagues.add(String(game.player1.league));
          uniqueLeagues.add(String(game.player2.league));
        });
      } else {
        tournamentData.players.forEach(player => {
          uniqueLeagues.add(String(player.league));
        });
      }
      
      // Re-fetch matchup data only
      const matchupDataMap = await fetchMatchupData(
        uniqueLeagues,
        effectiveWeek,
        playerToRosterMap,
        leagueInfo
      );
      
      setMatchupData(matchupDataMap);
      
      // Update effective week in tournament data
      setTournamentData(prev => ({
        ...prev,
        effectiveWeek: effectiveWeek
      }));
    } catch (error) {
      console.error('Error refreshing matchup data:', error);
      setError('Failed to refresh matchup data');
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="tournament-results-container">
      <div className="tournament-results-header">
        <button
          className="tournament-back-btn"
          onClick={() => navigate('/tournaments')}
        >
          ← Back
        </button>
        <div className="tournament-results-title-wrapper">
          <h1 className="tournament-results-title">{tournamentData.name}</h1>
          <div className="tournament-results-week">
            Week {tournamentData.week}
            {tournamentData.effectiveWeek !== tournamentData.week && (
              <span className="tournament-results-week-override">
                {' '}(Showing Week {tournamentData.effectiveWeek})
              </span>
            )}
          </div>
        </div>
        <button
          className="tournament-refresh-btn"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <div className="tournament-results-content">
        {tournamentData.type === 'h2h' ? (
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

              const rowId = `h2h-${index}`;
              const isExpanded = expandedRows.has(rowId);
              const player1Lineup = hasEssentialData ? getOptimalLineup(game.player1) : { lineup: [], bench: [], totalPoints: 0 };
              const player2Lineup = hasEssentialData ? getOptimalLineup(game.player2) : { lineup: [], bench: [], totalPoints: 0 };

              return (
                <div key={index} className="tournament-matchup-row">
                  <div 
                    className="tournament-matchup-grid tournament-matchup-clickable"
                    onClick={() => toggleRowExpansion(rowId)}
                    style={{ cursor: 'pointer' }}
                  >
                    <span className="tournament-expand-icon">
                      {isExpanded ? '▼' : '▶'}
                    </span>
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
                  {isExpanded && (
                    <div className="tournament-team-views-h2h">
                      <div className="tournament-team-view">
                        <h3>{game.player1.playername}</h3>
                        {renderTeamView(player1Lineup)}
                      </div>
                      <div className="tournament-team-view">
                        <h3>{game.player2.playername}</h3>
                        {renderTeamView(player2Lineup)}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="tournament-players-list">
            {(() => {
              // Calculate points for all players and sort by points (highest first)
              const hasEssentialData = Object.keys(leagueInfo).length > 0 && 
                                       Object.keys(playerToRosterMap).length > 0 && 
                                       Object.keys(matchupData).length > 0;
              
              const playersWithPoints = tournamentData.players.map(player => ({
                ...player,
                points: hasEssentialData ? getPlayerPoints(player) : 0
              })).sort((a, b) => b.points - a.points);
              
              return playersWithPoints.map((player, index) => {
                const rowId = `pts-${index}`;
                const isExpanded = expandedRows.has(rowId);
                const playerLineup = hasEssentialData ? getOptimalLineup(player) : { lineup: [], bench: [], totalPoints: 0 };

                return (
                  <div key={index} className="tournament-player-row">
                    <div 
                      className="tournament-player-grid tournament-player-clickable"
                      onClick={() => toggleRowExpansion(rowId)}
                      style={{ cursor: 'pointer' }}
                    >
                      <span className="tournament-expand-icon">
                        {isExpanded ? '▼' : '▶'}
                      </span>
                      <span className="tournament-league-name">{player.league_name}</span>
                      <span className="tournament-position">#{player.leagie_position}</span>
                      <span className="tournament-player-name">{player.playername}</span>
                      <span className="tournament-colon">:</span>
                      <span className="tournament-player-points">{player.points}</span>
                    </div>
                    {isExpanded && (
                      <div className="tournament-team-view-pts">
                        {renderTeamView(playerLineup)}
                      </div>
                    )}
                  </div>
                );
              });
            })()}
          </div>
        )}
      </div>
    </div>
  );
}

export default TournamentResults;


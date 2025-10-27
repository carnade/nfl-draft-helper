import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import LZString from 'lz-string';
import './DFSResults.css';

function DFSResults() {
  const navigate = useNavigate();
  const [inputData, setInputData] = useState('');
  const [compressedData, setCompressedData] = useState('');
  const [shareableUrl, setShareableUrl] = useState('');
  const [currentWeek, setCurrentWeek] = useState(null);
  const [selectedWeek, setSelectedWeek] = useState(null);
  const [fantasyPoints, setFantasyPoints] = useState({});
  const [playerNames, setPlayerNames] = useState({});
  const [dfsSalaryData, setDfsSalaryData] = useState({});
  const [loadedFromUrl, setLoadedFromUrl] = useState(false);
  const [loadingPoints, setLoadingPoints] = useState(false);
  const [visibleRanks, setVisibleRanks] = useState(new Set());

  const handleProceed = async () => {
    try {
      // Clean up input data
      const lines = inputData.trim().split('\n').filter(line => line.trim());
      
      // Decode each lineup code and extract the raw data
      const decodedLineups = lines.map(line => {
        const [username, encoded] = line.split(':');
        // Decode the base64 to get the raw player data
        const decoded = atob(encoded);
        return `${username}:${decoded}`;
      });
      
      // Join all decoded lineups
      const combined = decodedLineups.join('|');
      
      // Now compress the decoded data using LZ-String
      const compressed = LZString.compressToEncodedURIComponent(combined);
      
      setCompressedData(compressed);
      
      // Generate shareable URL using hash fragment with week
      const baseUrl = window.location.origin + window.location.pathname;
      const url = `${baseUrl}#${selectedWeek}|${compressed}`;
      setShareableUrl(url);
      
      // Now fetch fantasy points and player names
      if (selectedWeek) {
        setLoadingPoints(true);
        
        // Get all unique sleeper IDs from lineups
        const lineupData = parseLineups();
        const allSleeperIds = new Set();
        lineupData.forEach(lineup => {
          lineup.players.forEach(player => {
            allSleeperIds.add(player.sleeperId);
          });
        });
        
        // Fetch both fantasy points and DFS salary data
        const [fantasyData, salaryData] = await Promise.all([
          fetch(`https://shaggy-latashia-carnade-2ea2054a.koyeb.app/fantasy-points/week/${selectedWeek}`).then(res => res.json()),
          fetch(`https://shaggy-latashia-carnade-2ea2054a.koyeb.app/dfs-salaries/week/${selectedWeek}`).then(res => res.json())
        ]);
        
        console.log('Fantasy points fetched:', fantasyData);
        console.log('DFS salary data fetched:', salaryData);
        
        // Only fetch names for players not in fantasy points data
        const unknownSleeperIds = Array.from(allSleeperIds).filter(id => !fantasyData[id]);
        console.log('Unknown sleeper IDs:', unknownSleeperIds);
        
        const nameData = unknownSleeperIds.length > 0 ? await fetchPlayerNames(unknownSleeperIds) : {};
        console.log('Fetched name data:', nameData);
        
        setFantasyPoints(fantasyData);
        setPlayerNames(nameData);
        setDfsSalaryData(salaryData);
        setLoadingPoints(false);
        
        // If loaded from URL, start the reveal animation
        if (loadedFromUrl && inputData) {
          startRevealAnimation();
        }
      }
    } catch (error) {
      setCompressedData('Error: Invalid data format - ' + error.message);
      setShareableUrl('');
      setLoadingPoints(false);
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(shareableUrl).then(() => {
      console.log('Link copied to clipboard!');
      // Could add visual feedback
    });
  };

  useEffect(() => {
    // Check if data is in URL hash
    const hash = window.location.hash.substring(1); // Remove the #
    if (hash) {
      try {
        // Split week and compressed data
        const [weekStr, compressedData] = hash.split('|');
        const urlWeek = parseInt(weekStr);
        
        console.log('URL parsing:', { hash, weekStr, urlWeek, compressedData: compressedData?.substring(0, 50) + '...' });
        
        // Set the week from URL
        if (urlWeek && !isNaN(urlWeek)) {
          console.log('Setting selectedWeek from URL:', urlWeek);
          setSelectedWeek(urlWeek);
        }
        
        // Decompress the data
        const decompressed = LZString.decompressFromEncodedURIComponent(compressedData);
        if (decompressed) {
          // Split back into individual lineups
          const lineups = decompressed.split('|');
          
          // Re-encode each lineup to base64 format for inputData
          const formattedLineups = lineups.map(lineup => {
            const [username, rawData] = lineup.split(':');
            const encoded = btoa(rawData);
            return `${username}:${encoded}`;
          });
          
          setInputData(formattedLineups.join('\n'));
          setLoadedFromUrl(true);
          
          // Auto-process the data
          const combined = decompressed;
          const compressed = LZString.compressToEncodedURIComponent(combined);
          setCompressedData(compressed);
          
          // Don't generate a new URL since we're already viewing from one
          setShareableUrl('');
          
          // Auto-fetch fantasy points and player names for loaded data
          // We need to wait for selectedWeek to be set, so we'll do this in a separate useEffect
        }
      } catch (error) {
        console.error('Error loading data from URL:', error);
      }
    }
    
    // Get current week from cache or fetch it (only if not loading from URL)
    const cachedWeek = sessionStorage.getItem('nfl_current_week');
    if (cachedWeek) {
      const week = parseInt(cachedWeek);
      setCurrentWeek(week);
      // Only set selectedWeek if not loading from URL
      if (!window.location.hash) {
        setSelectedWeek(week - 1); // Default to previous week
      }
    } else {
      // Fetch if not cached
      fetch('https://api.sleeper.app/v1/state/nfl')
        .then(res => res.json())
        .then(data => {
          setCurrentWeek(data.week);
          // Only set selectedWeek if not loading from URL
          if (!window.location.hash) {
            setSelectedWeek(data.week - 1); // Default to previous week
          }
        })
        .catch(err => console.error('Error fetching week:', err));
    }
  }, []);

  // Auto-fetch data when loaded from URL and selectedWeek is available
  useEffect(() => {
    if (loadedFromUrl && selectedWeek && compressedData) {
      const fetchDataForUrl = async () => {
        setLoadingPoints(true);
        
        // Get all unique sleeper IDs from lineups
        const lineupData = parseLineups();
        const allSleeperIds = new Set();
        lineupData.forEach(lineup => {
          lineup.players.forEach(player => {
            allSleeperIds.add(player.sleeperId);
          });
        });
        
        try {
          // Fetch both fantasy points and DFS salary data
          const [fantasyData, salaryData] = await Promise.all([
            fetch(`https://shaggy-latashia-carnade-2ea2054a.koyeb.app/fantasy-points/week/${selectedWeek}`).then(res => res.json()),
            fetch(`https://shaggy-latashia-carnade-2ea2054a.koyeb.app/dfs-salaries/week/${selectedWeek}`).then(res => res.json())
          ]);
          
          console.log('Fantasy points fetched (from URL):', fantasyData);
          console.log('DFS salary data fetched (from URL):', salaryData);
          
          // Only fetch names for players not in fantasy points data
          const unknownSleeperIds = Array.from(allSleeperIds).filter(id => !fantasyData[id]);
          console.log('Unknown sleeper IDs (from URL):', unknownSleeperIds);
          
          const nameData = unknownSleeperIds.length > 0 ? await fetchPlayerNames(unknownSleeperIds) : {};
          console.log('Fetched name data (from URL):', nameData);
          
          setFantasyPoints(fantasyData);
          setPlayerNames(nameData);
          setDfsSalaryData(salaryData);
          setLoadingPoints(false);
          
          // Start the reveal animation
          startRevealAnimation();
        } catch (error) {
          console.error('Error fetching data from URL:', error);
          setLoadingPoints(false);
        }
      };
      
      fetchDataForUrl();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedFromUrl, selectedWeek, compressedData]);

  // Fetch player names for all sleeper IDs in lineups
  const fetchPlayerNames = async (sleeperIds) => {
    console.log('fetchPlayerNames called with:', sleeperIds);
    try {
      const response = await fetch('https://shaggy-latashia-carnade-2ea2054a.koyeb.app/getplayers/bestball', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          playerlist: sleeperIds
        })
      });

      console.log('fetchPlayerNames response status:', response.status);

      if (!response.ok) {
        throw new Error('Failed to fetch player names');
      }

      const playerData = await response.json();
      console.log('fetchPlayerNames raw response:', playerData);
      const nameMap = {};
      
      // Create a mapping of sleeper_id to player name
      // The API returns {players: Array(30)}, so we need to access the players array
      const players = playerData.players || Object.values(playerData);
      players.forEach(player => {
        if (player.id) {
          nameMap[player.id] = player.name;
        }
      });
      console.log('fetchPlayerNames final nameMap:', nameMap);
      return nameMap;
    } catch (error) {
      console.error('Error fetching player names:', error);
      return {};
    }
  };

  // This useEffect is removed - all fetching now happens in handleProceed

  const startRevealAnimation = () => {
    const lineupData = parseLineups();
    const totalLineups = lineupData.length;
    
    // Check if there are any "Not played" players (excluding OUT players)
    const hasNotPlayedPlayers = lineupData.some(lineup => 
      lineup.players.some(player => {
        const playerInfo = fantasyPoints[player.sleeperId];
        if (playerInfo) return false; // Player has fantasy points, they played
        
        // Check if player is OUT
        const dfsPlayerKey = `${player.sleeperId}_W${selectedWeek}`;
        const dfsPlayer = dfsSalaryData[dfsPlayerKey];
        const isOut = dfsPlayer?.injury_status === 'O';
        
        // Only consider it "not played" if they're not OUT
        return !isOut;
      })
    );
    
    // If there are "Not played" players, show all results immediately
    if (hasNotPlayedPlayers) {
      console.log('Not all players have played yet, showing all results immediately');
      const allVisible = new Set();
      for (let i = 1; i <= totalLineups; i++) {
        allVisible.add(i);
      }
      setVisibleRanks(allVisible);
      return;
    }
    
    console.log('All players have played, starting slowroll animation');
    
    // Initially show ranks 4 and beyond, show ghosts for 1-3
    const initialVisible = new Set();
    for (let i = 4; i <= totalLineups; i++) {
      initialVisible.add(i);
    }
    // Add negative numbers to indicate ghost state
    if (totalLineups >= 1) initialVisible.add(-1);
    if (totalLineups >= 2) initialVisible.add(-2);
    if (totalLineups >= 3) initialVisible.add(-3);
    
    setVisibleRanks(initialVisible);
    
    // Reveal rank 3 after 4 seconds
    if (totalLineups >= 3) {
      setTimeout(() => {
        setVisibleRanks(prev => {
          const next = new Set(prev);
          next.delete(-3);
          next.add(3);
          return next;
        });
        
        // Reveal rank 2 after another 2 seconds
        if (totalLineups >= 2) {
          setTimeout(() => {
            setVisibleRanks(prev => {
              const next = new Set(prev);
              next.delete(-2);
              next.add(2);
              return next;
            });
            
            // Reveal rank 1 after another 2 seconds
            setTimeout(() => {
              setVisibleRanks(prev => {
                const next = new Set(prev);
                next.delete(-1);
                next.add(1);
                return next;
              });
            }, 2000);
          }, 2000);
        } else {
          // If only 2 lineups, reveal rank 1 next
          setTimeout(() => {
            setVisibleRanks(prev => {
              const next = new Set(prev);
              next.delete(-1);
              next.add(1);
              return next;
            });
          }, 2000);
        }
      }, 4000);
    } else if (totalLineups === 2) {
      // If only 2 lineups, reveal rank 2 then rank 1
      setTimeout(() => {
        setVisibleRanks(prev => {
          const next = new Set(prev);
          next.delete(-2);
          next.add(2);
          return next;
        });
        setTimeout(() => {
          setVisibleRanks(prev => {
            const next = new Set(prev);
            next.delete(-1);
            next.add(1);
            return next;
          });
        }, 2000);
      }, 4000);
    } else if (totalLineups === 1) {
      // If only 1 lineup, reveal rank 1
      setTimeout(() => {
        setVisibleRanks(prev => {
          const next = new Set(prev);
          next.delete(-1);
          next.add(1);
          return next;
        });
      }, 4000);
    }
  };

  const getPositionColor = (position) => {
    const colors = {
      QB: 'rgba(239, 116, 161, 0.8)',
      RB: 'rgba(143, 242, 202, 0.8)',
      WR: 'rgba(86, 201, 248, 0.8)',
      TE: 'rgba(254, 174, 88, 0.8)',
      FLX: 'rgb(235, 88, 254, 0.8)',
      DST: 'rgb(239, 91, 47, 0.8)'
    };
    return colors[position] || '#ccc';
  };

  const parseLineups = () => {
    try {
      const lines = inputData.trim().split('\n').filter(line => line.trim());
      
      return lines.map(line => {
        const [username, encoded] = line.split(':');
        const decoded = atob(encoded);
        const playerPairs = decoded.split(',');
        
        const players = playerPairs.map(pair => {
          const [sleeperId, salary] = pair.split('-');
          return { sleeperId, salary: parseInt(salary) };
        });
        
        return { username, players };
      });
    } catch (error) {
      console.error('Error parsing lineups:', error);
      return [];
    }
  };

  const getPlayerInfo = (sleeperId) => {
    const fantasyInfo = fantasyPoints[sleeperId];
    const playerName = playerNames[sleeperId];
    
    console.log(`getPlayerInfo for ${sleeperId}:`, {
      fantasyInfo,
      playerName,
      playerNames,
      finalName: playerName || fantasyInfo?.name || 'Unknown'
    });
    
    return {
      ...fantasyInfo,
      name: playerName || fantasyInfo?.name || 'Unknown'
    };
  };

  // Get fantasy points display text
  const getFantasyPointsDisplay = (sleeperId) => {
    const playerInfo = fantasyPoints[sleeperId];
    
    // Check if player is OUT (from DFS salary data)
    const dfsPlayerKey = `${sleeperId}_W${selectedWeek}`;
    const dfsPlayer = dfsSalaryData[dfsPlayerKey];
    
    if (!playerInfo) {
      // If player is marked as OUT in injury status, show "OUT"
      if (dfsPlayer?.injury_status === 'O') {
        return 'OUT';
      }
      return 'Not played';
    }
    return playerInfo.fantasy_points?.toFixed(1) || '0.0';
  };

  const calculateTotalPoints = (players) => {
    return players.reduce((sum, player) => {
      const info = getPlayerInfo(player.sleeperId);
      return sum + (info?.fantasy_points || 0);
    }, 0);
  };

  const getStatsData = () => {
    const lineups = parseLineups();
    
    // Track chosen players from lineups
    const chosenStats = {
      QB: {},
      RB: {},
      WR: {},
      TE: {},
      DST: {}
    };
    
    // Track best chosen players (by value from lineups)
    const bestChosenStats = {
      QB: {},
      RB: {},
      WR: {},
      TE: {},
      DST: {}
    };
    
    // Track best not chosen players (by value from DFS data)
    const bestNotChosenStats = {
      QB: {},
      RB: {},
      WR: {},
      TE: {},
      DST: {}
    };

    // First, count chosen players from lineups
    lineups.forEach(lineup => {
      lineup.players.forEach(player => {
        const playerInfo = getPlayerInfo(player.sleeperId);
        if (!playerInfo) return;

        const position = playerInfo.position;
        if (!chosenStats[position]) return;

        const playerKey = `${playerInfo.name} (${playerInfo.team})`;
        
        // Count chosen players
        if (!chosenStats[position][playerKey]) {
          chosenStats[position][playerKey] = {
            name: playerInfo.name,
            team: playerInfo.team,
            count: 0,
            totalSalary: 0,
            totalPoints: 0
          };
        }
        chosenStats[position][playerKey].count++;
        chosenStats[position][playerKey].totalSalary += player.salary;
        chosenStats[position][playerKey].totalPoints += playerInfo.fantasy_points || 0;
        
        // Calculate value for best chosen players
        const value = (playerInfo.fantasy_points || 0) / (player.salary / 1000);
        if (!bestChosenStats[position][playerKey]) {
          bestChosenStats[position][playerKey] = {
            name: playerInfo.name,
            team: playerInfo.team,
            value: 0,
            count: 0,
            totalSalary: 0,
            totalPoints: 0
          };
        }
        bestChosenStats[position][playerKey].value = Math.max(
          bestChosenStats[position][playerKey].value, 
          value
        );
        bestChosenStats[position][playerKey].count++;
        bestChosenStats[position][playerKey].totalSalary += player.salary;
        bestChosenStats[position][playerKey].totalPoints += playerInfo.fantasy_points || 0;
      });
    });
    
    // Also count players from DFS salary data who weren't chosen (for complete count)
    Object.values(dfsSalaryData).forEach(dfsPlayer => {
      const position = dfsPlayer.position;
      if (!chosenStats[position]) return;
      
      const playerKey = `${dfsPlayer.name} (${dfsPlayer.team})`;
      
      // Only add if not already counted from lineups
      if (!chosenStats[position][playerKey]) {
        chosenStats[position][playerKey] = {
          name: dfsPlayer.name,
          team: dfsPlayer.team,
          count: 0,
          totalSalary: dfsPlayer.salary,
          totalPoints: 0
        };
      }
    });
    
    // Then, calculate value scores for players NOT chosen in lineups
    const chosenSleeperIds = new Set();
    lineups.forEach(lineup => {
      lineup.players.forEach(player => {
        chosenSleeperIds.add(player.sleeperId);
      });
    });
    
    Object.values(fantasyPoints).forEach(playerInfo => {
      const position = playerInfo.position;
      if (!bestNotChosenStats[position]) return;
      
      // Only include players NOT in lineups
      if (chosenSleeperIds.has(playerInfo.sleeper_id)) return;
      
      // Skip players without fantasy points or with 0 points
      if (!playerInfo.fantasy_points || playerInfo.fantasy_points === 0) return;
      
      const playerKey = `${playerInfo.name} (${playerInfo.team})`;
      
      // Find salary from DFS salary data
      const dfsPlayerKey = `${playerInfo.sleeper_id}_W${selectedWeek}`;
      const salary = dfsSalaryData[dfsPlayerKey]?.salary;
      
      if (salary) {
        const value = playerInfo.fantasy_points / (salary / 1000);
        
        if (!bestNotChosenStats[position][playerKey]) {
          bestNotChosenStats[position][playerKey] = {
            name: playerInfo.name,
            team: playerInfo.team,
            value: 0,
            count: 0, // Not chosen
            totalSalary: salary,
            totalPoints: playerInfo.fantasy_points
          };
        }
        
        bestNotChosenStats[position][playerKey].value = value;
      }
    });

    // Sort and get top 5 for each position
    const result = {};
    Object.keys(chosenStats).forEach(position => {
      const chosen = Object.values(chosenStats[position])
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
      
      const bestChosen = Object.values(bestChosenStats[position])
        .sort((a, b) => b.value - a.value)
        .slice(0, 5);
      
      const bestNotChosen = Object.values(bestNotChosenStats[position])
        .sort((a, b) => b.value - a.value)
        .slice(0, 5);

      result[position] = { chosen, bestChosen, bestNotChosen };
    });

    return result;
  };

  return (
    <div className="dfs-results-container">
      <div className="dfs-results-header">
        <button className="back-button" onClick={() => navigate('/dfs')}>
          ← Back to DFS
        </button>
        <h1>DFS Results</h1>
      </div>

      {!loadedFromUrl && (
        <div className="dfs-results-content">
          {!compressedData && (
            <>
            <div className="input-section">
              <label htmlFor="lineup-data">Paste Lineup Data:</label>
              <textarea
                id="lineup-data"
                className="lineup-input"
                placeholder={'Paste lineup codes here (one per line)\nExample:\ncarnade:MTE1NTktNDgwMC...\ncarnade2:MTE1NjAtNTgwMC...'}
                value={inputData}
                onChange={(e) => setInputData(e.target.value)}
                rows={10}
              />
            </div>

            {currentWeek && (
              <div className="week-toggle-section">
                <label>Select Week:</label>
                <div className="week-toggle">
                  <button
                    className={`week-btn ${selectedWeek === currentWeek - 1 ? 'active' : ''}`}
                    onClick={() => setSelectedWeek(currentWeek - 1)}
                  >
                    {currentWeek - 1}
                  </button>
                  <button
                    className={`week-btn ${selectedWeek === currentWeek ? 'active' : ''}`}
                    onClick={() => setSelectedWeek(currentWeek)}
                  >
                    {currentWeek}
                  </button>
                </div>
              </div>
            )}

            <button className="proceed-button" onClick={handleProceed}>
              Proceed
            </button>
          </>
        )}

        {compressedData && shareableUrl && !loadedFromUrl && (
          <div className="shareable-link-section">
            <h3>Shareable Link:</h3>
            <div className="link-container">
              <input 
                type="text" 
                value={shareableUrl} 
                readOnly 
                className="link-input"
              />
              <button className="copy-link-btn" onClick={copyLink} title="Copy link">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
              </button>
            </div>
            <p className="link-info">
              Share this link to view the results. Data is stored in the URL (no server storage).
            </p>
          </div>
        )}
        </div>
      )}

      {compressedData && inputData && (
        <div className="results-grid-section">
          {loadingPoints ? (
            <div className="loading-message">Loading fantasy points for Week {selectedWeek}...</div>
          ) : Object.keys(fantasyPoints).length === 0 ? (
            <div className="error-message">No fantasy points data available for Week {selectedWeek}</div>
          ) : (
            <>
              <h2>Results - Week {selectedWeek}</h2>
          
          {parseLineups()
            .map(lineup => ({
              ...lineup,
              totalPoints: calculateTotalPoints(lineup.players)
            }))
              .sort((a, b) => b.totalPoints - a.totalPoints)
              .map((lineup, idx) => {
                const rank = idx + 1;
                const isVisible = loadedFromUrl ? visibleRanks.has(rank) : true;
                const isGhost = loadedFromUrl && visibleRanks.has(-rank);
                
                // Show ghost placeholder for top 3 ranks before reveal
                if (isGhost && rank <= 3) {
                  return (
                    <div key={`ghost-${idx}`} className="lineup-grid ghost-grid visible">
                      <div className="grid-header rank-header">Rank</div>
                      <div className="grid-header manager-header">Manager</div>
                      <div className="grid-header">QB</div>
                      <div className="grid-header">RB</div>
                      <div className="grid-header">RB</div>
                      <div className="grid-header">WR</div>
                      <div className="grid-header">WR</div>
                      <div className="grid-header">WR</div>
                      <div className="grid-header">TE</div>
                      <div className="grid-header">FLEX</div>
                      <div className="grid-header">DST</div>
                      <div className="grid-header total-header">Total Points</div>

                      <div className="grid-value rank-value ghost-rank">{rank}</div>
                      <div className="grid-value manager-value ghost-text">???</div>
                      {[...Array(9)].map((_, i) => (
                        <div key={i} className="ghost-player-card"></div>
                      ))}
                      <div className="total-points-cell ghost-total">???</div>
                    </div>
                  );
                }
                
                return (
                  <div 
                    key={idx} 
                    className={`lineup-grid ${isVisible ? 'visible' : 'hidden'}`}
                  >
                  <div className="grid-header rank-header">Rank</div>
                  <div className="grid-header manager-header">Manager</div>
                  <div className="grid-header">QB</div>
                  <div className="grid-header">RB</div>
                  <div className="grid-header">RB</div>
                  <div className="grid-header">WR</div>
                  <div className="grid-header">WR</div>
                  <div className="grid-header">WR</div>
                  <div className="grid-header">TE</div>
                  <div className="grid-header">FLEX</div>
                  <div className="grid-header">DST</div>
                  <div className="grid-header total-header">Total Points</div>

                  <div className={`grid-value rank-value rank-${rank}`}>{rank}</div>
                  <div className="grid-value manager-value">{lineup.username}</div>
                  
                  {lineup.players.map((player, pIdx) => {
                    const info = getPlayerInfo(player.sleeperId);
                    const position = info?.position || 'FLX';
                    
                      return (() => {
                        const pointsDisplay = getFantasyPointsDisplay(player.sleeperId);
                        const isOut = pointsDisplay === 'OUT';
                        return (
                          <div
                            key={pIdx} 
                            className="dfs-results-player-card"
                            style={{ backgroundColor: isOut ? 'rgba(220, 53, 69, 0.8)' : getPositionColor(position) }}
                          >
                            <div className="dfs-results-player-card-left">
                              <div className="dfs-results-player-card-name">{info?.name || 'Unknown'}</div>
                              <div className="dfs-results-player-card-salary">${player.salary.toLocaleString()}</div>
                            </div>
                            <div className={`dfs-results-player-card-points ${pointsDisplay === 'OUT' ? 'out-status' : ''}`}>
                              {pointsDisplay}
                            </div>
                          </div>
                        );
                      })();
                  })}
                  
                  <div className="total-points-cell">
                    {lineup.totalPoints.toFixed(1)}
                  </div>
                </div>
              );
            })}
            </>
          )}
        </div>
      )}

      {compressedData && inputData && Object.keys(fantasyPoints).length > 0 && (
        <div className="stats-section">
          <h2>Position Statistics</h2>
          <div className="stats-container">
            <div className="stats-area">
              <h3>Most Chosen Players</h3>
              <div className="position-stats">
                {Object.entries(getStatsData()).map(([position, data]) => (
                  <div key={`chosen-${position}`} className="position-table">
                    <h4>{position}</h4>
                    <table>
                      <thead>
                        <tr>
                          <th>Player</th>
                          <th>Count</th>
                          <th>Avg Salary</th>
                          <th>Avg Points</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.chosen.map((player, idx) => (
                          <tr key={idx}>
                            <td>{player.name}</td>
                            <td>{player.count}</td>
                            <td>${player.count > 0 ? Math.round(player.totalSalary / player.count).toLocaleString() : player.totalSalary.toLocaleString()}</td>
                            <td>{player.count > 0 ? (player.totalPoints / player.count).toFixed(1) : '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            </div>

            <div className="stats-area">
              <h3>Best Chosen Players FPTS / $1000 Salary</h3>
              <div className="position-stats">
                {Object.entries(getStatsData()).map(([position, data]) => (
                  <div key={`bestChosen-${position}`} className="position-table">
                    <h4>{position}</h4>
                    <table>
                      <thead>
                        <tr>
                          <th>Player</th>
                          <th>Value Score</th>
                          <th>Count</th>
                          <th>Avg Salary</th>
                          <th>Avg Points</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.bestChosen.map((player, idx) => (
                          <tr key={idx}>
                            <td>{player.name}</td>
                            <td>{player.value.toFixed(2)}</td>
                            <td>{player.count}</td>
                            <td>${player.count > 0 ? Math.round(player.totalSalary / player.count).toLocaleString() : player.totalSalary.toLocaleString()}</td>
                            <td>{player.count > 0 ? (player.totalPoints / player.count).toFixed(1) : '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            </div>

            <div className="stats-area">
              <h3>Best Missed Plays FPTS / $1000 Salary</h3>
              <div className="position-stats">
                {Object.entries(getStatsData()).map(([position, data]) => (
                  <div key={`value-${position}`} className="position-table">
                    <h4>{position}</h4>
                    <table>
                      <thead>
                        <tr>
                          <th>Player</th>
                          <th>Value Score</th>
                          <th>Salary</th>
                          <th>Points</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.bestNotChosen.map((player, idx) => (
                          <tr key={idx}>
                            <td>{player.name}</td>
                            <td>{player.value.toFixed(2)}</td>
                            <td>${player.totalSalary.toLocaleString()}</td>
                            <td>{player.totalPoints.toFixed(1)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DFSResults;


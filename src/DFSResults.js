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
  const [lineups, setLineups] = useState([]);
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
      
      // Generate shareable URL using hash fragment
      const baseUrl = window.location.origin + window.location.pathname;
      const url = `${baseUrl}#${compressed}`;
      setShareableUrl(url);
    } catch (error) {
      setCompressedData('Error: Invalid data format - ' + error.message);
      setShareableUrl('');
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
        // Decompress the data
        const decompressed = LZString.decompressFromEncodedURIComponent(hash);
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
        }
      } catch (error) {
        console.error('Error loading data from URL:', error);
      }
    }
    
    // Get current week from cache or fetch it
    const cachedWeek = sessionStorage.getItem('nfl_current_week');
    if (cachedWeek) {
      const week = parseInt(cachedWeek);
      setCurrentWeek(week);
      setSelectedWeek(week - 1); // Default to previous week
    } else {
      // Fetch if not cached
      fetch('https://api.sleeper.app/v1/state/nfl')
        .then(res => res.json())
        .then(data => {
          setCurrentWeek(data.week);
          setSelectedWeek(data.week - 1); // Default to previous week
        })
        .catch(err => console.error('Error fetching week:', err));
    }
  }, []);

  useEffect(() => {
    // Fetch fantasy points when week changes
    if (selectedWeek) {
      setLoadingPoints(true);
      fetch(`https://shaggy-latashia-carnade-2ea2054a.koyeb.app/fantasy-points/week/${selectedWeek}`)
        .then(res => res.json())
        .then(data => {
          setFantasyPoints(data);
          setLoadingPoints(false);
          
          // If loaded from URL, start the reveal animation
          if (loadedFromUrl && inputData) {
            startRevealAnimation();
          }
        })
        .catch(err => {
          console.error('Error fetching fantasy points:', err);
          setLoadingPoints(false);
        });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWeek]);

  const startRevealAnimation = () => {
    const lineupData = parseLineups();
    const totalLineups = lineupData.length;
    
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
    return fantasyPoints[sleeperId] || null;
  };

  const calculateTotalPoints = (players) => {
    return players.reduce((sum, player) => {
      const info = getPlayerInfo(player.sleeperId);
      return sum + (info?.fantasy_points || 0);
    }, 0);
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
                    
                      return (
                        <div 
                          key={pIdx} 
                          className="dfs-results-player-card"
                          style={{ backgroundColor: getPositionColor(position) }}
                        >
                          <div className="dfs-results-player-card-left">
                            <div className="dfs-results-player-card-name">{info?.name || 'Unknown'}</div>
                            <div className="dfs-results-player-card-salary">${player.salary.toLocaleString()}</div>
                          </div>
                          <div className="dfs-results-player-card-points">
                            {info?.fantasy_points?.toFixed(1) || '0.0'}
                          </div>
                        </div>
                      );
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
    </div>
  );
}

export default DFSResults;


import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import LZString from 'lz-string';
import './DFSResults.css';

// Add a mock flag
const mock = true; // Set to true for mock data, false for production

// Define the base URL based on the mock flag
const BASE_URL = mock
  ? "http://localhost:5000"
  : "https://shaggy-latashia-carnade-2ea2054a.koyeb.app";

function DFSResults() {
  const navigate = useNavigate();
  const { name: tinyUrlNameParam } = useParams();
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
  const [loadingTinyUrl, setLoadingTinyUrl] = useState(false);
  const [visibleRanks, setVisibleRanks] = useState(new Set());
  const [tinyUrlName, setTinyUrlName] = useState('');
  const [tinyUrl, setTinyUrl] = useState('');
  const [creatingTinyUrl, setCreatingTinyUrl] = useState(false);
  const [tinyUrlError, setTinyUrlError] = useState('');
  const [tinyUrlCount, setTinyUrlCount] = useState(null);

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
      
      console.log('Generated URL:', {
        baseUrl,
        selectedWeek,
        compressedLength: compressed.length,
        compressedStart: compressed.substring(0, 50),
        fullUrl: url,
        urlLength: url.length
      });
      
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
          fetch(`${BASE_URL}/fantasy-points/week/${selectedWeek}`).then(res => res.json()),
          fetch(`${BASE_URL}/dfs-salaries/week/${selectedWeek}`).then(res => res.json())
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
          console.log('About to start reveal animation from handleProceed');
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

  const copyTinyUrl = () => {
    navigator.clipboard.writeText(tinyUrl).then(() => {
      console.log('TinyURL copied to clipboard!');
    });
  };

  const fetchTinyUrlCount = useCallback(async () => {
    try {
      const response = await fetch(`${BASE_URL}/tinyurl/count`);
      if (response.ok) {
        const data = await response.json();
        setTinyUrlCount(data);
      }
    } catch (error) {
      console.error('Error fetching tinyURL count:', error);
      // Don't set error state, just fail silently
    }
  }, []);

  const handleCreateTinyUrl = async () => {
    if (!tinyUrlName || tinyUrlName.trim() === '') {
      setTinyUrlError('Please enter a name');
      return;
    }

    if (tinyUrlName.length > 20) {
      setTinyUrlError('Name must be 20 characters or less');
      return;
    }

    // Get the hash data from the current URL or construct it from compressedData
    let hashData = window.location.hash.substring(1);
    
    // If no hash in URL, construct it from compressedData and selectedWeek
    if (!hashData && compressedData && selectedWeek) {
      hashData = `${selectedWeek}|${compressedData}`;
    }
    
    if (!hashData) {
      setTinyUrlError('No data available to create tinyURL');
      return;
    }

    setCreatingTinyUrl(true);
    setTinyUrlError('');

    try {
      const response = await fetch(`${BASE_URL}/tinyurl/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: tinyUrlName.trim(),
          data: hashData
        })
      });

      const result = await response.json();

      if (response.ok) {
        // Generate the tinyURL
        const baseUrl = window.location.origin + window.location.pathname;
        const tinyUrlPath = `/tinyurl/${result.name}`;
        const createdUrl = `${baseUrl}${tinyUrlPath}`;
        
        setTinyUrl(createdUrl);
        setTinyUrlName(''); // Clear the input
        
        // Refresh the count after successful creation
        fetchTinyUrlCount();
      } else {
        // Handle errors
        if (response.status === 400) {
          setTinyUrlError(result.message || 'Invalid request. Please check your input.');
        } else if (response.status === 500) {
          setTinyUrlError('Server error. Please try again later.');
        } else {
          setTinyUrlError(result.message || 'Failed to create tinyURL');
        }
      }
    } catch (error) {
      console.error('Error creating tinyURL:', error);
      setTinyUrlError('Network error. Please try again.');
    } finally {
      setCreatingTinyUrl(false);
    }
  };

  // Load data from tinyURL if name parameter exists
  useEffect(() => {
    if (tinyUrlNameParam) {
      const fetchTinyUrlData = async () => {
        setLoadingTinyUrl(true);
        try {
          const response = await fetch(`${BASE_URL}/tinyurl/${tinyUrlNameParam}`);
          
          if (response.ok) {
            const result = await response.json();
            const hashData = result.data;
            
            // Process the hash data similar to hash URL loading
            let hash = hashData;
            
            // Decode if needed
            try {
              hash = decodeURIComponent(hash);
            } catch (e) {
              // Hash wasn't encoded, use as-is
            }
            
            // Split week and compressed data
            const [weekStr, compressedData] = hash.split('|');
            const urlWeek = parseInt(weekStr);
            
            // Set the week from URL
            if (urlWeek && !isNaN(urlWeek)) {
              setSelectedWeek(urlWeek);
            }
            
            // Decompress the data
            let decompressed = LZString.decompressFromEncodedURIComponent(compressedData);
            
            if (!decompressed) {
              decompressed = LZString.decompressFromBase64(compressedData);
            }
            
            if (!decompressed) {
              decompressed = LZString.decompressFromUTF16(compressedData);
            }
            
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
              
              setShareableUrl('');
            } else {
              console.error('Failed to decompress data from tinyURL');
              setInputData('ERROR: Failed to load data from tinyURL. The data may be corrupted.');
            }
          } else if (response.status === 404) {
            setInputData(`ERROR: TinyURL "${tinyUrlNameParam}" not found.`);
          } else {
            setInputData('ERROR: Failed to load data from tinyURL. Please try again.');
          }
        } catch (error) {
          console.error('Error loading tinyURL data:', error);
          setInputData('ERROR: Network error while loading tinyURL. Please try again.');
        } finally {
          setLoadingTinyUrl(false);
        }
      };
      
      fetchTinyUrlData();
      return; // Don't process hash if we're loading from tinyURL
    }
    
    // Check if data is in URL hash (original logic)
    let hash = window.location.hash.substring(1); // Remove the #
    
    // Decode the hash in case it was URL-encoded by the platform
    // Try multiple decoding strategies since different platforms encode differently
    const originalHash = hash;
    try {
      // First try standard URL decoding
      hash = decodeURIComponent(hash);
      console.log('Successfully decoded hash with decodeURIComponent');
    } catch (e) {
      console.log('decodeURIComponent failed, trying alternative approaches');
      
      // Try replacing common URL-encoded characters that might break the data
      try {
        hash = hash
          .replace(/%7C/g, '|')  // Replace encoded pipe characters
          .replace(/%3A/g, ':')   // Replace encoded colons
          .replace(/%2B/g, '+')   // Replace encoded plus signs
          .replace(/%2F/g, '/')  // Replace encoded forward slashes
          .replace(/%3D/g, '=')  // Replace encoded equals signs
          .replace(/%2D/g, '-')  // Replace encoded hyphens
          .replace(/%5F/g, '_')  // Replace encoded underscores
          .replace(/%2E/g, '.')  // Replace encoded periods
          .replace(/%2C/g, ','); // Replace encoded commas
        
        console.log('Applied manual character replacements');
      } catch (e2) {
        console.log('Manual replacements failed, using original hash');
        hash = originalHash;
      }
    }
    
    if (hash) {
      try {
        // Split week and compressed data
        const [weekStr, compressedData] = hash.split('|');
        const urlWeek = parseInt(weekStr);
        
        console.log('URL parsing:', { 
          originalHash: window.location.hash.substring(1),
          decodedHash: hash, 
          weekStr, 
          urlWeek, 
          compressedData: compressedData?.substring(0, 50) + '...',
          compressedDataLength: compressedData?.length,
          hashLength: hash.length,
          originalHashLength: window.location.hash.substring(1).length
        });
        
        // Set the week from URL
        if (urlWeek && !isNaN(urlWeek)) {
          console.log('Setting selectedWeek from URL:', urlWeek);
          setSelectedWeek(urlWeek);
        }
        
        // Decompress the data
        console.log('Attempting to decompress data:', {
          compressedDataLength: compressedData?.length,
          compressedDataStart: compressedData?.substring(0, 100),
          compressedDataEnd: compressedData?.substring(compressedData.length - 100),
          containsInvalidChars: /[^A-Za-z0-9+/_-]/.test(compressedData),
          firstChar: compressedData?.[0],
          lastChar: compressedData?.[compressedData.length - 1]
        });
        
        // Try different decompression methods
        let decompressed = LZString.decompressFromEncodedURIComponent(compressedData);
        
        // If that fails, try the base64 method
        if (!decompressed) {
          console.log('EncodedURIComponent failed, trying base64 decompression');
          decompressed = LZString.decompressFromBase64(compressedData);
        }
        
        // If that fails, try the UTF16 method
        if (!decompressed) {
          console.log('Base64 failed, trying UTF16 decompression');
          decompressed = LZString.decompressFromUTF16(compressedData);
        }
        
        console.log('Decompression result:', {
          success: !!decompressed,
          decompressedLength: decompressed?.length,
          decompressedStart: decompressed?.substring(0, 200)
        });
        
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
        } else {
          console.error('Failed to decompress data from URL. This might be due to URL encoding issues.');
          console.log('Compressed data that failed:', compressedData);
          
          // Show user-friendly error message
          setInputData('ERROR: Failed to load data from URL. This can happen when links are shared through certain platforms that modify URLs. Please try copying the link directly or ask the sender to share it again.');
        }
      } catch (error) {
        console.error('Error loading data from URL:', error);
        console.log('Original hash:', window.location.hash);
        console.log('Processed hash:', hash);
        
        // Show user-friendly error message
        setInputData('ERROR: Failed to parse URL data. This can happen when links are shared through certain platforms that modify URLs. Please try copying the link directly or ask the sender to share it again.');
      }
    }
    
    // Get current week from cache or fetch it (only if not loading from URL or tinyURL)
    const cachedWeek = sessionStorage.getItem('nfl_current_week');
    if (cachedWeek) {
      const week = parseInt(cachedWeek);
      setCurrentWeek(week);
      // Only set selectedWeek if not loading from URL or tinyURL
      if (!window.location.hash && !tinyUrlNameParam) {
        setSelectedWeek(week - 1); // Default to previous week
      }
    } else {
      // Fetch if not cached
      fetch('https://api.sleeper.app/v1/state/nfl')
        .then(res => res.json())
        .then(data => {
          setCurrentWeek(data.week);
          // Only set selectedWeek if not loading from URL or tinyURL
          if (!window.location.hash && !tinyUrlNameParam) {
            setSelectedWeek(data.week - 1); // Default to previous week
          }
        })
        .catch(err => console.error('Error fetching week:', err));
    }
  }, [tinyUrlNameParam]);

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
            fetch(`${BASE_URL}/fantasy-points/week/${selectedWeek}`).then(res => res.json()),
            fetch(`${BASE_URL}/dfs-salaries/week/${selectedWeek}`).then(res => res.json())
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
        } catch (error) {
          console.error('Error fetching data from URL:', error);
          setLoadingPoints(false);
        }
      };
      
      fetchDataForUrl();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedFromUrl, selectedWeek, compressedData]);

  // Fetch tinyURL count when section is visible
  useEffect(() => {
    if (compressedData && inputData && !loadedFromUrl) {
      fetchTinyUrlCount();
    }
  }, [compressedData, inputData, loadedFromUrl, fetchTinyUrlCount]);

  const parseLineups = useCallback(() => {
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
  }, [inputData]);

  const startRevealAnimation = useCallback(() => {
    const lineupData = parseLineups();
    const totalLineups = lineupData.length;
    
    console.log('Starting reveal animation with:', {
      totalLineups,
      fantasyPointsCount: Object.keys(fantasyPoints).length,
      dfsSalaryDataCount: Object.keys(dfsSalaryData).length,
      selectedWeek
    });
    
    // Check if there are any "Not played" players (excluding OUT players)
    const hasNotPlayedPlayers = lineupData.some(lineup => 
      lineup.players.some(player => {
        const playerInfo = fantasyPoints[player.sleeperId];
        if (playerInfo) return false; // Player has fantasy points, they played
        
        // Check if player is OUT
        const dfsPlayerKey = `${player.sleeperId}_W${selectedWeek}`;
        const dfsPlayer = dfsSalaryData[dfsPlayerKey];
        const isOut = dfsPlayer?.injury_status === 'O';
        
        console.log(`Player ${player.sleeperId}:`, {
          hasFantasyPoints: !!playerInfo,
          dfsPlayer,
          isOut,
          willShowAsNotPlayed: !isOut
        });
        
        // Only consider it "not played" if they're not OUT
        return !isOut;
      })
    );
    
    console.log('hasNotPlayedPlayers:', hasNotPlayedPlayers);
    
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
  }, [fantasyPoints, dfsSalaryData, selectedWeek, parseLineups]);

  // Trigger animation when data is loaded from URL
  useEffect(() => {
    if (loadedFromUrl && !loadingPoints && Object.keys(fantasyPoints).length > 0 && Object.keys(dfsSalaryData).length > 0) {
      console.log('Data loaded from URL, starting reveal animation');
      startRevealAnimation();
    }
  }, [loadedFromUrl, loadingPoints, fantasyPoints, dfsSalaryData, startRevealAnimation]);

  // Fetch player names for all sleeper IDs in lineups
  const fetchPlayerNames = async (sleeperIds) => {
    console.log('fetchPlayerNames called with:', sleeperIds);
    try {
      const response = await fetch(`${BASE_URL}/getplayers/bestball`, {
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
        // Get player info from multiple sources
        const dfsPlayerKey = `${player.sleeperId}_W${selectedWeek}`;
        const dfsPlayer = dfsSalaryData[dfsPlayerKey];
        const fantasyInfo = fantasyPoints[player.sleeperId];
        const playerName = playerNames[player.sleeperId];
        
        // Determine player name, position, and team from available sources
        const name = playerName || dfsPlayer?.name || fantasyInfo?.name || 'Unknown';
        const position = dfsPlayer?.position || fantasyInfo?.position;
        const team = dfsPlayer?.team || fantasyInfo?.team || '';
        const fantasyPointsValue = fantasyInfo?.fantasy_points || 0;
        
        // Skip if we don't have at least a position
        if (!position || !chosenStats[position]) return;

        const playerKey = `${name} (${team})`;
        
        // Count chosen players
        if (!chosenStats[position][playerKey]) {
          chosenStats[position][playerKey] = {
            name: name,
            team: team,
            count: 0,
            totalSalary: 0,
            totalPoints: 0
          };
        }
        chosenStats[position][playerKey].count++;
        chosenStats[position][playerKey].totalSalary += player.salary;
        chosenStats[position][playerKey].totalPoints += fantasyPointsValue;
        
        // Calculate value for best chosen players (only if player has points)
        if (fantasyPointsValue > 0) {
          const value = fantasyPointsValue / (player.salary / 1000);
          if (!bestChosenStats[position][playerKey]) {
            bestChosenStats[position][playerKey] = {
              name: name,
              team: team,
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
          bestChosenStats[position][playerKey].totalPoints += fantasyPointsValue;
        }
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
    
    // Handle both cases: fantasyPoints keyed by sleeper_id OR objects with sleeper_id field
    Object.entries(fantasyPoints).forEach(([key, playerInfo]) => {
      // Determine sleeper_id - could be the key or a field in the object
      const sleeperId = playerInfo.sleeper_id || playerInfo.id || key;
      
      const position = playerInfo.position;
      if (!bestNotChosenStats[position]) return;
      
      // Only include players NOT in lineups
      if (chosenSleeperIds.has(sleeperId)) {
        return;
      }
      
      // Skip players without fantasy points or with 0 points
      if (!playerInfo.fantasy_points || playerInfo.fantasy_points === 0) {
        return;
      }
      const playerKey = `${playerInfo.name} (${playerInfo.team})`;
      
      // Find salary from DFS salary data
      // Try the standard key format first
      const dfsPlayerKey = `${sleeperId}_W${selectedWeek}`;
      let salary = dfsSalaryData[dfsPlayerKey]?.salary;
      
      // Also try with sleeperId as number if it's a string, or vice versa
      if (!salary) {
        const altKey = typeof sleeperId === 'string' 
          ? `${parseInt(sleeperId)}_W${selectedWeek}`
          : `${String(sleeperId)}_W${selectedWeek}`;
        salary = dfsSalaryData[altKey]?.salary;
      }
      
      // Try looking up by sleeper_id directly (without week suffix) - maybe keys are just sleeper_ids
      if (!salary) {
        salary = dfsSalaryData[sleeperId]?.salary;
      }
      
      // Try with sleeperId as number
      if (!salary) {
        const sleeperIdNum = typeof sleeperId === 'string' ? parseInt(sleeperId) : sleeperId;
        salary = dfsSalaryData[sleeperIdNum]?.salary;
      }
      
      // If not found with key, search through all DFS salary data by sleeper_id
      if (!salary) {
        // Convert sleeperId to string and number for comparison
        const sleeperIdStr = String(sleeperId);
        const sleeperIdNum = typeof sleeperId === 'string' ? parseInt(sleeperId, 10) : Number(sleeperId);
        const sleeperIdNumValid = !isNaN(sleeperIdNum) ? sleeperIdNum : null;
        
        const dfsPlayer = Object.values(dfsSalaryData).find(
          p => {
            // Try multiple field name variations and type conversions
            const pSleeperId = p.sleeper_id;
            const pId = p.id;
            
            // Direct matches
            if (pSleeperId === sleeperId || pId === sleeperId) return true;
            if (pSleeperId === sleeperIdNumValid || pId === sleeperIdNumValid) return true;
            
            // String comparisons
            if (pSleeperId != null && String(pSleeperId) === sleeperIdStr) return true;
            if (pId != null && String(pId) === sleeperIdStr) return true;
            
            // Number comparisons
            if (pSleeperId != null && !isNaN(Number(pSleeperId)) && Number(pSleeperId) === sleeperIdNumValid) return true;
            if (pId != null && !isNaN(Number(pId)) && Number(pId) === sleeperIdNumValid) return true;
            
            return false;
          }
        );
        salary = dfsPlayer?.salary;
      }
      
      // Include player if we have salary, or if we don't have DFS data but player has points
      // If no salary, we can't calculate value, but we'll still show them
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
      } else {
        // Player has points but no salary found - still include them with 0 value
        // This can happen if player wasn't in DFS pool but still played
        if (!bestNotChosenStats[position][playerKey]) {
          bestNotChosenStats[position][playerKey] = {
            name: playerInfo.name,
            team: playerInfo.team,
            value: 0,
            count: 0,
            totalSalary: 0,
            totalPoints: playerInfo.fantasy_points
          };
        }
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

        {compressedData && inputData && (
          <>
            {!loadedFromUrl && (
              <div className="tinyurl-section">
              <h3>
                Create a results tinyURL
                {tinyUrlCount && (
                  <span className="tinyurl-count">
                    ({tinyUrlCount.count} of {tinyUrlCount.max_entries} used)
                  </span>
                )}
              </h3>
              <div className="tinyurl-input-container">
                <input
                  type="text"
                  value={tinyUrlName}
                  onChange={(e) => {
                    const value = e.target.value.slice(0, 20); // Limit to 20 characters
                    setTinyUrlName(value);
                    setTinyUrlError(''); // Clear error on input change
                  }}
                  placeholder="Enter name (max 20 chars)"
                  className="tinyurl-input"
                  maxLength={20}
                  disabled={creatingTinyUrl}
                />
                <button 
                  className="create-tinyurl-btn" 
                  onClick={handleCreateTinyUrl}
                  disabled={creatingTinyUrl || !tinyUrlName.trim()}
                >
                  {creatingTinyUrl ? 'Creating...' : 'Create'}
                </button>
              </div>
              {tinyUrlError && (
                <p className="tinyurl-error">{tinyUrlError}</p>
              )}
              {tinyUrl && (
                <div className="tinyurl-result">
                  <h4>TinyURL Created:</h4>
                  <div className="link-container">
                    <input 
                      type="text" 
                      value={tinyUrl} 
                      readOnly 
                      className="link-input"
                    />
                    <button className="copy-link-btn" onClick={copyTinyUrl} title="Copy tinyURL">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                      </svg>
                    </button>
                  </div>
                </div>
              )}
              </div>
            )}

            {shareableUrl && !loadedFromUrl && (
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
          </>
        )}
        </div>
      )}

      {compressedData && inputData && (
        <div className="results-grid-section">
          {loadingTinyUrl ? (
            <div className="loading-message">Loading tinyURL data...</div>
          ) : loadingPoints ? (
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


import React, { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import LZString from 'lz-string';
import './DFSResults.css';

// Add a mock flag
const mock = false; // Set to true for mock data, false for production

// Define the base URL based on the mock flag
const BASE_URL = mock
  ? "http://localhost:5000"
  : "https://shaggy-latashia-carnade-2ea2054a.koyeb.app";

const PRIMARY_SLEEPER_LEAGUE_ID = '1180214473415516160';
const DST_SLEEPER_LEAGUE_ID = '1293242375618957312';
const DEFENSE_POSITIONS = new Set(['DST', 'DEF', 'D/ST', 'D', 'TEAM', 'TM']);

const isDefensePosition = (position) => {
  if (!position || typeof position !== 'string') return false;
  return DEFENSE_POSITIONS.has(position.trim().toUpperCase());
};

const isDefenseSleeperId = (sleeperId) => {
  if (!sleeperId) return false;
  return !/^\d+$/.test(String(sleeperId));
};

const getUsdDstBoundsUtc = (year) => {
  const march1Utc = Date.UTC(year, 2, 1);
  const march1Day = new Date(march1Utc).getUTCDay();
  const firstSundayMarch = march1Day === 0 ? 1 : 8 - march1Day;
  const secondSundayMarch = firstSundayMarch + 7;
  const dstStartUtc = Date.UTC(year, 2, secondSundayMarch, 7, 0); // 2 AM local -> 7 AM UTC

  const nov1Utc = Date.UTC(year, 10, 1);
  const nov1Day = new Date(nov1Utc).getUTCDay();
  const firstSundayNovember = nov1Day === 0 ? 1 : 8 - nov1Day;
  const dstEndUtc = Date.UTC(year, 10, firstSundayNovember, 6, 0); // 2 AM local -> 6 AM UTC

  return { dstStartUtc, dstEndUtc };
};

const convertEasternLocalToUtc = (year, monthIndex, day, hour24, minute) => {
  const { dstStartUtc, dstEndUtc } = getUsdDstBoundsUtc(year);
  const dstCandidateUtc = Date.UTC(year, monthIndex, day, hour24 + 4, minute);
  const stdCandidateUtc = Date.UTC(year, monthIndex, day, hour24 + 5, minute);
  const isDst = dstCandidateUtc >= dstStartUtc && dstCandidateUtc < dstEndUtc;
  return new Date(isDst ? dstCandidateUtc : stdCandidateUtc);
};

const parseGameStartToUtc = (gameDate, gameStartTime) => {
  if (!gameDate) return null;

  let timeStr = typeof gameStartTime === 'string' && gameStartTime.trim().length > 0
    ? gameStartTime.trim()
    : '6:00PM';

  const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!timeMatch) {
    // Unexpected format—fallback to default 6:00PM Eastern
    timeStr = '6:00PM';
  }

  const parsedMatch = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!parsedMatch) return null;

  let [ , hourStr, minuteStr, ampm ] = parsedMatch;
  let hours = parseInt(hourStr, 10);
  const minutes = parseInt(minuteStr, 10);
  const meridiem = ampm.toUpperCase();

  if (meridiem === 'PM' && hours !== 12) {
    hours += 12;
  } else if (meridiem === 'AM' && hours === 12) {
    hours = 0;
  }

  const year = parseInt(gameDate.slice(0, 4), 10);
  const monthIndex = parseInt(gameDate.slice(5, 7), 10) - 1;
  const day = parseInt(gameDate.slice(8, 10), 10);

  if (Number.isNaN(year) || Number.isNaN(monthIndex) || Number.isNaN(day) || Number.isNaN(hours) || Number.isNaN(minutes)) {
    return null;
  }

  return convertEasternLocalToUtc(year, monthIndex, day, hours, minutes);
};

function DFSResults() {
  const navigate = useNavigate();
  const { name: tinyUrlNameParam } = useParams();
  const [inputData, setInputData] = useState('');
  const [compressedData, setCompressedData] = useState('');
  const [shareableUrl, setShareableUrl] = useState('');
  const [currentWeek, setCurrentWeek] = useState(null);
  const [selectedWeek, setSelectedWeek] = useState(null);
  const [fantasyPoints, setFantasyPoints] = useState({});
  const [liveUpdate, setLiveUpdate] = useState(false);
  const [dfsSalaryData, setDfsSalaryData] = useState({});
  const [playerMetadata, setPlayerMetadata] = useState({});
  const [loadedFromUrl, setLoadedFromUrl] = useState(false);
  const [loadingPoints, setLoadingPoints] = useState(false);
  const [loadingTinyUrl, setLoadingTinyUrl] = useState(false);
  const [visibleRanks, setVisibleRanks] = useState(new Set());
  const [tinyUrlName, setTinyUrlName] = useState('');
  const [tinyUrl, setTinyUrl] = useState('');
  const [creatingTinyUrl, setCreatingTinyUrl] = useState(false);
  const [tinyUrlError, setTinyUrlError] = useState('');
  const [tinyUrlCount, setTinyUrlCount] = useState(null);
  const [showUpdatingIndicator, setShowUpdatingIndicator] = useState(false);
  const [lastUpdateTime, setLastUpdateTime] = useState(null);

  const lineupRefs = useRef({});
  const previousPositionsRef = useRef({});
  const hasMeasuredRef = useRef(false);
  const animationTimeoutsRef = useRef({});
  const lastSortedKeysRef = useRef([]);

  // Fetch player names from bestball endpoint for players not in salary data
  const fetchPlayerMetadata = useCallback(async (sleeperIds) => {
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

      if (!response.ok) {
        throw new Error('Failed to fetch player names');
      }

      const playerData = await response.json();
      const metadataMap = {};
      
      // Create a mapping of sleeper_id to player metadata
      const players = playerData.players || Object.values(playerData);
      players.forEach(player => {
        if (player.id) {
          const derivedName = player.name ||
            [player.first_name, player.last_name].filter(Boolean).join(' ').trim();
          const derivedPosition = player.position ||
            player.pos ||
            (Array.isArray(player.fantasy_positions) ? player.fantasy_positions[0] : undefined);
          const derivedTeam = player.team ||
            player.team_abbr ||
            player.nfl_team ||
            player.team_name ||
            player.full_team_name ||
            '';

          metadataMap[player.id] = {
            name: derivedName || 'Unknown',
            position: derivedPosition,
            team: derivedTeam
          };
        }
      });
      
      return metadataMap;
    } catch (error) {
      console.error('Error fetching player names:', error);
      return {};
    }
  }, []);

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
        
        // Always fetch fantasy points from Sleeper matchups API
        const matchupsData = await fetch(`https://api.sleeper.app/v1/league/${PRIMARY_SLEEPER_LEAGUE_ID}/matchups/${selectedWeek}`).then(res => res.json());
        
        // Extract and combine all players_points from all matchups
        let fantasyData = {};
        if (Array.isArray(matchupsData)) {
          matchupsData.forEach(matchup => {
            if (matchup.players_points) {
              Object.entries(matchup.players_points).forEach(([sleeperId, points]) => {
                // Create object structure expected by the code
                fantasyData[sleeperId] = {
                  fantasy_points: points,
                  sleeper_id: sleeperId
                };
              });
            }
          });
        }
        
        // Fetch other data from original endpoints
        // Check cache first for DFS salaries
        const salaryCacheKey = `dfs_salaries_week_${selectedWeek}`;
        const cachedSalaryData = sessionStorage.getItem(salaryCacheKey);
        const salaryCacheTimestamp = sessionStorage.getItem(`${salaryCacheKey}_timestamp`);
        const now = Date.now();
        const cacheExpiry = 60 * 60 * 1000; // 1 hour
        
        let salaryData;
        if (cachedSalaryData && salaryCacheTimestamp && (now - parseInt(salaryCacheTimestamp)) < cacheExpiry) {
          // Use cached data
          salaryData = JSON.parse(cachedSalaryData);
          console.log('DFS salary data loaded from cache');
        } else {
          // Fetch and cache
          salaryData = await fetch(`${BASE_URL}/dfs-salaries/week/${selectedWeek}`).then(res => res.json());
          sessionStorage.setItem(salaryCacheKey, JSON.stringify(salaryData));
          sessionStorage.setItem(`${salaryCacheKey}_timestamp`, now.toString());
          console.log('DFS salary data fetched and cached');
        }
        
        // Determine DST players present in the lineups
        const dstSleeperIds = new Set();
        Array.from(allSleeperIds).forEach(rawSleeperId => {
          const sleeperId = String(rawSleeperId);
          const dfsPlayerKey = `${sleeperId}_W${selectedWeek}`;
          const dfsPlayer = salaryData[dfsPlayerKey];
          const salaryPosition =
            dfsPlayer?.position ||
            dfsPlayer?.fantasy_positions?.[0];
          const metadataPosition = playerMetadata[sleeperId]?.position;
          const lineupIndicatesDefense = isDefenseSleeperId(sleeperId);

          const isDefense =
            lineupIndicatesDefense ||
            isDefensePosition(salaryPosition) ||
            isDefensePosition(metadataPosition);

          if (isDefense) {
            dstSleeperIds.add(sleeperId);
            console.log('DST detection (handleProceed):', {
              sleeperId,
              dfsPlayerKey,
              salaryPosition,
              metadataPosition,
              lineupIndicatesDefense,
              salaryEntry: dfsPlayer
            });
          }
        });

        // Always fetch DST matchup data to get ALL DST points (needed for "Best Not Chosen" stats)
        // Merge ALL non-numeric keys (DST team abbreviations) from the DST league
        try {
          const dstMatchupsData = await fetch(`https://api.sleeper.app/v1/league/${DST_SLEEPER_LEAGUE_ID}/matchups/${selectedWeek}`).then(res => res.json());
          if (Array.isArray(dstMatchupsData)) {
            dstMatchupsData.forEach(matchup => {
              if (!matchup.players_points) return;
              Object.entries(matchup.players_points).forEach(([sleeperId, points]) => {
                const sid = String(sleeperId);
                // Merge ALL non-numeric keys (DST team abbreviations like "CHI", "LAC", etc.)
                // Also merge numeric IDs that are in our dstSleeperIds set (for DSTs in lineups)
                if (!/^\d+$/.test(sid) || dstSleeperIds.has(sid)) {
                  const existing = fantasyData[sid] || { sleeper_id: sid };
                  existing.fantasy_points = points ?? 0;
                  fantasyData[sid] = existing;
                  if (dstSleeperIds.has(sid)) {
                    console.log('DST points merged (handleProceed - in lineup):', {
                      sleeperId: sid,
                      points,
                      matchupId: matchup.matchup_id
                    });
                  }
                }
              });
            });
            console.log('DST points merged (handleProceed - all DSTs):', {
              totalDstPoints: Object.keys(fantasyData).filter(k => !/^\d+$/.test(k)).length,
              dstSleeperIdsInLineups: Array.from(dstSleeperIds)
            });
          }
        } catch (error) {
          console.error('Error fetching DST matchup data:', error);
        }

        // Use Sleeper points directly - names, positions, teams come from dfsSalaryData
        const mergedFantasyData = { ...fantasyData };
        
        console.log('Fantasy points fetched (from Sleeper matchups):', mergedFantasyData);
        console.log('DFS salary data fetched:', salaryData);
        
        // Find players without names in salary data and fetch from bestball endpoint
        const missingNames = [];
        Array.from(allSleeperIds).forEach(sleeperId => {
          const dfsPlayerKey = `${sleeperId}_W${selectedWeek}`;
          const dfsPlayer = salaryData[dfsPlayerKey];
          if (!dfsPlayer?.name) {
            missingNames.push(sleeperId);
          }
        });
        
        let nameData = {};
        if (missingNames.length > 0) {
          console.log('Fetching names for players not in salary data:', missingNames);
          nameData = await fetchPlayerMetadata(missingNames);
          console.log('Fetched name data from bestball:', nameData);
        }
        
        setFantasyPoints(mergedFantasyData);
        setDfsSalaryData(salaryData);
        if (Object.keys(nameData).length > 0) {
          setPlayerMetadata(prev => ({ ...prev, ...nameData }));
        }
        setLoadingPoints(false);
        setLastUpdateTime(new Date());
        
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
    let weekSetFromUrl = false; // Track if week was set from URL/tinyURL
    
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
              weekSetFromUrl = true;
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
          weekSetFromUrl = true;
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
    // Only set default week if we haven't already set it from URL/tinyURL
    if (!weekSetFromUrl) {
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
    } else {
      // Still set currentWeek even if week was set from URL
      const cachedWeek = sessionStorage.getItem('nfl_current_week');
      if (cachedWeek) {
        const week = parseInt(cachedWeek);
        setCurrentWeek(week);
      } else {
        fetch('https://api.sleeper.app/v1/state/nfl')
          .then(res => res.json())
          .then(data => {
            setCurrentWeek(data.week);
          })
          .catch(err => console.error('Error fetching week:', err));
      }
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
          // Always fetch fantasy points from Sleeper matchups API
          const matchupsData = await fetch(`https://api.sleeper.app/v1/league/${PRIMARY_SLEEPER_LEAGUE_ID}/matchups/${selectedWeek}`).then(res => res.json());
          
          // Extract and combine all players_points from all matchups
          let fantasyData = {};
          if (Array.isArray(matchupsData)) {
            matchupsData.forEach(matchup => {
              if (matchup.players_points) {
                Object.entries(matchup.players_points).forEach(([sleeperId, points]) => {
                  // Create object structure expected by the code
                  fantasyData[sleeperId] = {
                    fantasy_points: points,
                    sleeper_id: sleeperId
                  };
                });
              }
            });
          }
          
          // Fetch other data from original endpoints
          // Check cache first for DFS salaries
          const salaryCacheKey = `dfs_salaries_week_${selectedWeek}`;
          const cachedSalaryData = sessionStorage.getItem(salaryCacheKey);
          const salaryCacheTimestamp = sessionStorage.getItem(`${salaryCacheKey}_timestamp`);
          const now = Date.now();
          const cacheExpiry = 60 * 60 * 1000; // 1 hour
          
          let salaryData;
          if (cachedSalaryData && salaryCacheTimestamp && (now - parseInt(salaryCacheTimestamp)) < cacheExpiry) {
            // Use cached data
            salaryData = JSON.parse(cachedSalaryData);
            console.log('DFS salary data loaded from cache (from URL)');
          } else {
            // Fetch and cache
            salaryData = await fetch(`${BASE_URL}/dfs-salaries/week/${selectedWeek}`).then(res => res.json());
            sessionStorage.setItem(salaryCacheKey, JSON.stringify(salaryData));
            sessionStorage.setItem(`${salaryCacheKey}_timestamp`, now.toString());
            console.log('DFS salary data fetched and cached (from URL)');
          }
          
          // Use Sleeper points directly - names, positions, teams come from dfsSalaryData
          // Determine DST players present in the lineups (for reference)
          const dstSleeperIds = new Set();
          Array.from(allSleeperIds).forEach(rawSleeperId => {
            const sleeperId = String(rawSleeperId);
            const dfsPlayerKey = `${sleeperId}_W${selectedWeek}`;
            const dfsPlayer = salaryData[dfsPlayerKey];
            const salaryPosition = dfsPlayer?.position || dfsPlayer?.fantasy_positions?.[0];
            const lineupIndicatesDefense = isDefenseSleeperId(sleeperId);
            const isDefense = lineupIndicatesDefense || isDefensePosition(salaryPosition);
            if (isDefense) {
              dstSleeperIds.add(sleeperId);
            }
          });

          // Always fetch DST matchup data to get ALL DST points (needed for "Best Not Chosen" stats)
          // Merge ALL non-numeric keys (DST team abbreviations) from the DST league
          try {
            const dstMatchupsData = await fetch(`https://api.sleeper.app/v1/league/${DST_SLEEPER_LEAGUE_ID}/matchups/${selectedWeek}`).then(res => res.json());
            if (Array.isArray(dstMatchupsData)) {
              dstMatchupsData.forEach(matchup => {
                if (!matchup.players_points) return;
                Object.entries(matchup.players_points).forEach(([sleeperId, points]) => {
                  const sid = String(sleeperId);
                  // Merge ALL non-numeric keys (DST team abbreviations like "CHI", "LAC", etc.)
                  // Also merge numeric IDs that are in our dstSleeperIds set (for DSTs in lineups)
                  if (!/^\d+$/.test(sid) || dstSleeperIds.has(sid)) {
                    const existing = fantasyData[sid] || { sleeper_id: sid };
                    existing.fantasy_points = points ?? 0;
                    fantasyData[sid] = existing;
                  }
                });
              });
              console.log('DST points merged (URL load - all DSTs):', {
                totalDstPoints: Object.keys(fantasyData).filter(k => !/^\d+$/.test(k)).length,
                dstSleeperIdsInLineups: Array.from(dstSleeperIds)
              });
            }
          } catch (error) {
            console.error('Error fetching DST matchup data (URL load):', error);
          }

          const mergedFantasyData = { ...fantasyData };
          
          console.log('Fantasy points fetched (from URL, Sleeper matchups):', mergedFantasyData);
          console.log('DFS salary data fetched (from URL):', salaryData);
          
          // Find players without names in salary data and fetch from bestball endpoint
          const missingNames = [];
        Array.from(allSleeperIds).forEach(sleeperId => {
          const dfsPlayerKey = `${sleeperId}_W${selectedWeek}`;
          const dfsPlayer = salaryData[dfsPlayerKey];
          if (!dfsPlayer?.name) {
            missingNames.push(sleeperId);
          }
        });
          
          let nameData = {};
        if (missingNames.length > 0) {
          console.log('Fetching names for players not in salary data (from URL):', missingNames);
          nameData = await fetchPlayerMetadata(missingNames);
          console.log('Fetched name data from bestball (from URL):', nameData);
        }
          
          setFantasyPoints(mergedFantasyData);
          setDfsSalaryData(salaryData);
          if (Object.keys(nameData).length > 0) {
            setPlayerMetadata(prev => ({ ...prev, ...nameData }));
          }
          setLoadingPoints(false);
          setLastUpdateTime(new Date());
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

  const buildDstSleeperIdSet = useCallback((lineups) => {
    const dstIds = new Set();
    lineups.forEach(lineup => {
      lineup.players.forEach(player => {
        const sleeperId = String(player.sleeperId);
        if (isDefenseSleeperId(sleeperId)) {
          dstIds.add(sleeperId);
          return;
        }
        const dfsPlayerKey = `${sleeperId}_W${selectedWeek}`;
        const salaryEntry = dfsSalaryData[dfsPlayerKey];
        const position =
          salaryEntry?.position ||
          salaryEntry?.fantasy_positions?.[0] ||
          playerMetadata[sleeperId]?.position;
        if (isDefensePosition(position)) {
          dstIds.add(sleeperId);
        }
      });
    });
    return dstIds;
  }, [dfsSalaryData, playerMetadata, selectedWeek]);

  const getFantasyPointsDisplay = useCallback((sleeperId) => {
    const playerInfo = fantasyPoints[sleeperId];

    // Check if player is OUT (from DFS salary data)
    const dfsPlayerKey = `${sleeperId}_W${selectedWeek}`;
    const dfsPlayer = dfsSalaryData[dfsPlayerKey];

    // If player is marked as OUT in injury status, show "OUT"
    if (dfsPlayer?.injury_status === 'O') {
      return 'OUT';
    }

    // Get fantasy points (0 if no playerInfo, otherwise the actual points)
    const points = playerInfo?.fantasy_points ?? 0;

    // If points is 0.0, check if game has started
    if (points === 0) {
      const gameDate = dfsPlayer?.game_date;
      const gameStartTime = dfsPlayer?.game_start_time;

      if (gameDate) {
        try {
          const kickoffUtc = parseGameStartToUtc(gameDate, gameStartTime);
          if (kickoffUtc) {
            const now = new Date();
            if (now < kickoffUtc) {
              return 'Not played';
            }
          }
        } catch (error) {
          console.error('Error parsing game start time:', {
            sleeperId,
            gameDate,
            gameStartTime,
            error
          });
        }
      }

      // If we have player metadata indicating they haven't played, show Not played
      if (!playerInfo) {
        return 'Not played';
      }
    }

    // If no player info and no special conditions, show Not played
    if (!playerInfo) {
      return 'Not played';
    }

    // Otherwise return the fantasy points formatted to 1 decimal place
    return (playerInfo.fantasy_points ?? 0).toFixed(1);
  }, [dfsSalaryData, fantasyPoints, selectedWeek]);

  const startRevealAnimation = useCallback(() => {
    const lineupData = parseLineups();
    const totalLineups = lineupData.length;
    
    console.log('Starting reveal animation with:', {
      totalLineups,
      fantasyPointsCount: Object.keys(fantasyPoints).length,
      dfsSalaryDataCount: Object.keys(dfsSalaryData).length,
      selectedWeek
    });
    
    // Check if there are any players without fantasy data (excluding OUT players)
    let missingPlayers = [];
    const hasNotPlayedPlayers = lineupData.some(lineup => 
      lineup.players.some(player => {
        const displayStatus = getFantasyPointsDisplay(player.sleeperId);
        if (displayStatus === 'Not played') {
          const dfsPlayerKey = `${player.sleeperId}_W${selectedWeek}`;
          const dfsPlayer = dfsSalaryData[dfsPlayerKey];
          missingPlayers.push({
            sleeperId: player.sleeperId,
            reason: 'display_not_played',
            displayStatus,
            dfsPlayerKey,
            dfsPlayer
          });
          return true;
        }

        const playerInfo = fantasyPoints[player.sleeperId];
        const dfsPlayerKey = `${player.sleeperId}_W${selectedWeek}`;
        const dfsPlayer = dfsSalaryData[dfsPlayerKey];
        const isOut = dfsPlayer?.injury_status === 'O';

        if (!playerInfo && !isOut) {
          missingPlayers.push({
            sleeperId: player.sleeperId,
            reason: 'no_fantasy_entry',
            dfsPlayerKey,
            dfsPlayer
          });
          return true;
        }

        if (playerInfo && typeof playerInfo.fantasy_points !== 'number') {
          missingPlayers.push({
            sleeperId: player.sleeperId,
            reason: 'invalid_fantasy_points',
            playerInfo
          });
          return true;
        }

        return false;
      })
    );

    if (missingPlayers.length > 0) {
      console.log('Skipping reveal animation due to missing players:', missingPlayers);
    }
    
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
  }, [fantasyPoints, dfsSalaryData, selectedWeek, parseLineups, getFantasyPointsDisplay]);

  // Trigger animation when data is loaded from URL
  useEffect(() => {
    if (loadedFromUrl && !loadingPoints && Object.keys(fantasyPoints).length > 0 && Object.keys(dfsSalaryData).length > 0) {
      console.log('Data loaded from URL, starting reveal animation');
      startRevealAnimation();
    }
  }, [loadedFromUrl, loadingPoints, fantasyPoints, dfsSalaryData, startRevealAnimation]);

  const getPositionColor = (position) => {
    const colors = {
      QB: 'rgba(239, 116, 161, 0.8)',
      RB: 'rgba(143, 242, 202, 0.8)',
      WR: 'rgba(86, 201, 248, 0.8)',
      TE: 'rgba(254, 174, 88, 0.8)',
      FLX: 'rgb(235, 88, 254, 0.8)',
      DST: 'rgb(239, 91, 47, 0.8)'
    };
    // Return purple (FLX color) for unknown positions
    return colors[position] || 'rgb(235, 88, 254, 0.8)';
  };

  const getPlayerInfo = useCallback((sleeperId) => {
    const fantasyInfo = fantasyPoints[sleeperId];
    const dfsPlayerKey = `${sleeperId}_W${selectedWeek}`;
    const dfsPlayer = dfsSalaryData[dfsPlayerKey];
    
    return {
      ...fantasyInfo,
      name: dfsPlayer?.name || playerMetadata[sleeperId]?.name || fantasyInfo?.name || 'Unknown',
      position: dfsPlayer?.position || playerMetadata[sleeperId]?.position || fantasyInfo?.position,
      team: dfsPlayer?.team || playerMetadata[sleeperId]?.team || fantasyInfo?.team
    };
  }, [dfsSalaryData, fantasyPoints, playerMetadata, selectedWeek]);

  const calculateTotalPoints = useCallback((players) => {
    return players.reduce((sum, player) => {
      const info = getPlayerInfo(player.sleeperId);
      return sum + (info?.fantasy_points || 0);
    }, 0);
  }, [getPlayerInfo]);

  const generateLineupKey = useCallback((lineup, index) => {
    const usernameKey = lineup.username || 'unknown';
    const playersKey = lineup.players
      .map(player => `${player.sleeperId}-${player.salary}`)
      .join(',');
    return `${usernameKey}|${index}|${playersKey}`;
  }, []);

  const sortedLineups = useMemo(() => {
    const parsed = parseLineups();
    return parsed
      .map((lineup, originalIndex) => ({
        ...lineup,
        key: generateLineupKey(lineup, originalIndex),
        totalPoints: calculateTotalPoints(lineup.players),
        originalIndex
      }))
      .sort((a, b) => b.totalPoints - a.totalPoints);
  }, [parseLineups, calculateTotalPoints, generateLineupKey]);

  useLayoutEffect(() => {
    if (loadingPoints || sortedLineups.length === 0) {
      previousPositionsRef.current = {};
      return;
    }

    const currentPositions = {};
    sortedLineups.forEach(lineup => {
      const node = lineupRefs.current[lineup.key];
      if (node) {
        const rect = node.getBoundingClientRect();
        currentPositions[lineup.key] = rect;
      }
    });

    const currentKeysArray = sortedLineups.map(lineup => lineup.key);
    const orderChanged =
      currentKeysArray.length !== lastSortedKeysRef.current.length ||
      currentKeysArray.some((key, idx) => key !== lastSortedKeysRef.current[idx]);

    if (!orderChanged) {
      lastSortedKeysRef.current = currentKeysArray;
      previousPositionsRef.current = currentPositions;
      return;
    }

    lastSortedKeysRef.current = currentKeysArray;

    if (hasMeasuredRef.current) {
      sortedLineups.forEach(lineup => {
        const key = lineup.key;
        const node = lineupRefs.current[key];
        if (!node) return;

        const prevRect = previousPositionsRef.current[key];
        const newRect = currentPositions[key];

        if (prevRect && newRect) {
          const deltaY = prevRect.top - newRect.top;
          if (deltaY !== 0) {
            if (animationTimeoutsRef.current[key]) {
              clearTimeout(animationTimeoutsRef.current[key]);
            }
            node.style.transition = 'none';
            node.style.transform = `translateY(${deltaY}px)`;
            node.style.willChange = 'transform';

            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                node.style.transition = 'transform 2s cubic-bezier(0.4, 0, 0.2, 1)';
                node.style.transform = '';

                const timeoutId = window.setTimeout(() => {
                  node.style.transition = '';
                  node.style.willChange = '';
                  animationTimeoutsRef.current[key] = null;
                }, 2000);

                animationTimeoutsRef.current[key] = timeoutId;
              });
            });
          }
        }
      });
    } else {
      hasMeasuredRef.current = true;
    }

    previousPositionsRef.current = currentPositions;

    const currentKeys = new Set(sortedLineups.map(lineup => lineup.key));
    Object.keys(lineupRefs.current).forEach(key => {
      if (!currentKeys.has(key)) {
        delete lineupRefs.current[key];
      }
    });
  }, [sortedLineups, loadingPoints]);

  useEffect(() => {
    const timeoutsMap = animationTimeoutsRef.current;
    return () => {
      Object.values(timeoutsMap).forEach(timeoutId => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      });
    };
  }, []);

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
        
        // Determine player name, position, and team from available sources
        const metadata = playerMetadata[player.sleeperId];
        const name = dfsPlayer?.name || metadata?.name || fantasyInfo?.name || 'Unknown';
        const position = dfsPlayer?.position || metadata?.position || fantasyInfo?.position;
        const team = dfsPlayer?.team || metadata?.team || fantasyInfo?.team || '';
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
    
    // Calculate value scores for players NOT chosen in lineups
    // Start with all players from dfsSalaryData (source of truth for DFS pool)
    const chosenSleeperIds = new Set();
    lineups.forEach(lineup => {
      lineup.players.forEach(player => {
        // Store as string to handle both numeric and string IDs (like DST "TB")
        chosenSleeperIds.add(String(player.sleeperId));
      });
    });
    
    // Iterate through all players in DFS salary data
    Object.entries(dfsSalaryData).forEach(([dfsKey, dfsPlayer]) => {
      // Extract sleeper_id from the salary data entry
      // The key might be like "6813_W10", "6813_w10", "LAC_W10", or "LAC_w10"
      // Split on '_' and take the first part as the base ID
      const keyParts = dfsKey.split('_');
      const keyBase = keyParts[0]; // Extract base ID: "6813" or "LAC"
      
      // Get sleeper_id from the player data or fall back to keyBase
      // dfsPlayer.sleeper_id should contain the actual ID (like "LAC" for DST)
      const sleeperId = String(dfsPlayer.sleeper_id || dfsPlayer.id || keyBase);
      let position = dfsPlayer.position;
      
      // Normalize defense positions to "DST" for consistency
      if (position && isDefensePosition(position)) {
        position = 'DST';
      }
      
      // Skip if position is not in our stats categories
      if (!position || !bestNotChosenStats[position]) return;
      
      // Skip if player was chosen in any lineup
      // Check multiple formats to handle different ID representations (handles case-insensitive matching)
      const sleeperIdUpper = sleeperId.toUpperCase();
      const keyBaseUpper = keyBase.toUpperCase();
      const dfsKeyUpper = dfsKey.toUpperCase();
      
      // Check if this player was chosen - try all possible ID formats (case-insensitive)
      const isChosen = Array.from(chosenSleeperIds).some(chosenId => {
        const chosenUpper = String(chosenId).toUpperCase();
        return (
          sleeperIdUpper === chosenUpper ||
          keyBaseUpper === chosenUpper ||
          dfsKeyUpper === chosenUpper ||
          dfsKeyUpper.startsWith(chosenUpper + '_') ||
          (dfsPlayer.sleeper_id && String(dfsPlayer.sleeper_id).toUpperCase() === chosenUpper) ||
          (dfsPlayer.id && String(dfsPlayer.id).toUpperCase() === chosenUpper)
        );
      });
      
      if (isChosen) {
        return;
      }
      
      // Get fantasy points for this player
      // Try multiple key formats to find fantasy points (handles both numeric and string IDs, DST teams, etc.)
      // For DST, fantasy points are typically keyed by team abbreviation (like "LAC")
      let fantasyInfo = null;
      
      // Debug logging for DST players (non-numeric IDs)
      const isDstPlayer = !/^\d+$/.test(keyBase);
      if (isDstPlayer && position === 'DST') {
        console.log('DST Player Check - Best Not Chosen:', {
          dfsKey,
          keyBase,
          sleeperId,
          position,
          name: dfsPlayer.name,
          team: dfsPlayer.team,
          salary: dfsPlayer.salary,
          dfsPlayer_sleeper_id: dfsPlayer.sleeper_id,
          dfsPlayer_id: dfsPlayer.id,
          keyBaseUpper,
          sleeperIdUpper
        });
      }
      
      // Try exact matches first (case-sensitive)
      const exactMatchKeys = [sleeperId, dfsKey, keyBase];
      if (dfsPlayer.sleeper_id) exactMatchKeys.push(String(dfsPlayer.sleeper_id));
      if (dfsPlayer.id) exactMatchKeys.push(String(dfsPlayer.id));
      
      for (const key of exactMatchKeys) {
        if (fantasyPoints[key]) {
          fantasyInfo = fantasyPoints[key];
          if (isDstPlayer && position === 'DST') {
            console.log('DST Player - Found via exact match:', { key, fantasyInfo });
          }
          break;
        }
      }
      
      // If not found, try case-insensitive lookup for string IDs (like DST team abbreviations)
      if (!fantasyInfo && isDstPlayer) {
        // Non-numeric ID (like DST "LAC"), try case-insensitive match
        const fantasyPointsKeys = Object.keys(fantasyPoints);
        const matchingKey = fantasyPointsKeys.find(key => 
          String(key).toUpperCase() === keyBaseUpper || 
          String(key).toUpperCase() === sleeperIdUpper
        );
        
        if (matchingKey) {
          fantasyInfo = fantasyPoints[matchingKey];
          if (position === 'DST') {
            console.log('DST Player - Found via case-insensitive match:', { 
              matchingKey, 
              fantasyInfo,
              searchedFor: [keyBaseUpper, sleeperIdUpper]
            });
          }
        } else if (position === 'DST') {
          // Debug: show sample of available fantasyPoints keys (non-numeric ones)
          const nonNumericKeys = fantasyPointsKeys.filter(k => !/^\d+$/.test(k));
          console.log('DST Player - No match found. Available non-numeric keys in fantasyPoints:', {
            searchedKeys: exactMatchKeys,
            searchedUpper: [keyBaseUpper, sleeperIdUpper],
            sampleNonNumericKeys: nonNumericKeys.slice(0, 20), // First 20 non-numeric keys
            totalNonNumericKeys: nonNumericKeys.length,
            totalFantasyPointsKeys: fantasyPointsKeys.length
          });
        }
      }
      
      // Try numeric conversion for numeric IDs
      if (!fantasyInfo && /^\d+$/.test(sleeperId)) {
        fantasyInfo = fantasyPoints[Number(sleeperId)] || fantasyPoints[Number(keyBase)];
      }
      
      const points = fantasyInfo?.fantasy_points ?? 
                     (typeof fantasyInfo === 'number' ? fantasyInfo : 0);
      
      if (isDstPlayer && position === 'DST') {
        console.log('DST Player - Final result:', {
          name: dfsPlayer.name,
          team: dfsPlayer.team,
          points,
          hasFantasyInfo: !!fantasyInfo,
          fantasyInfoType: typeof fantasyInfo,
          willBeIncluded: points > 0
        });
      }
      
      // Skip players without fantasy points or with 0 points
      if (!points || points === 0) {
        return;
      }
      
      // Calculate value: fantasy points per $1000 of salary
      const salary = dfsPlayer.salary;
      if (!salary || salary === 0) {
        return; // Can't calculate value without salary
      }
      
      const value = points / (salary / 1000);
      const playerKey = `${dfsPlayer.name} (${dfsPlayer.team})`;
      
      bestNotChosenStats[position][playerKey] = {
        name: dfsPlayer.name,
        team: dfsPlayer.team,
        value: value,
        count: 0, // Not chosen
        salary: salary,
        points: points
      };
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

  const formattedLastUpdate = lastUpdateTime
    ? lastUpdateTime.toLocaleTimeString('en-GB', { hour12: false })
    : null;

  // Auto-refresh Sleeper points every 60 seconds when live update is enabled
  useEffect(() => {
    if (!liveUpdate || !selectedWeek) {
      return undefined;
    }

    let hideIndicatorTimeoutId = null;
    let isMounted = true;

    const refreshPoints = async () => {
      setShowUpdatingIndicator(true);
      try {
        const matchupsData = await fetch(`https://api.sleeper.app/v1/league/${PRIMARY_SLEEPER_LEAGUE_ID}/matchups/${selectedWeek}`).then(res => res.json());

        const sleeperPoints = {};
        if (Array.isArray(matchupsData)) {
          matchupsData.forEach(matchup => {
            if (matchup.players_points) {
              Object.assign(sleeperPoints, matchup.players_points);
            }
          });
        }

        const lineups = parseLineups();
        const dstSleeperIds = buildDstSleeperIdSet(lineups);

        // Always fetch DST matchup data to update ALL DST points (needed for "Best Not Chosen" stats)
        // Merge ALL non-numeric keys (DST team abbreviations) from the DST league
        try {
          const dstMatchupsData = await fetch(`https://api.sleeper.app/v1/league/${DST_SLEEPER_LEAGUE_ID}/matchups/${selectedWeek}`).then(res => res.json());
          if (Array.isArray(dstMatchupsData)) {
            dstMatchupsData.forEach(matchup => {
              if (!matchup.players_points) return;
              Object.entries(matchup.players_points).forEach(([sleeperId, points]) => {
                const sid = String(sleeperId);
                // Merge ALL non-numeric keys (DST team abbreviations like "CHI", "LAC", etc.)
                // Also merge numeric IDs that are in our dstSleeperIds set (for DSTs in lineups)
                if (!/^\d+$/.test(sid) || dstSleeperIds.has(sid)) {
                  sleeperPoints[sid] = points ?? 0;
                }
              });
            });
            console.log('DST points merged (liveUpdate - all DSTs):', {
              totalDstPoints: Object.keys(sleeperPoints).filter(k => !/^\d+$/.test(k)).length,
              dstSleeperIdsInLineups: Array.from(dstSleeperIds)
            });
          }
        } catch (error) {
          console.error('Error refreshing DST Sleeper points:', error);
        }

        setFantasyPoints(prevFantasyPoints => {
          const updatedFantasyPoints = { ...prevFantasyPoints };
          Object.entries(sleeperPoints).forEach(([sleeperId, points]) => {
            if (updatedFantasyPoints[sleeperId]) {
              updatedFantasyPoints[sleeperId] = {
                ...updatedFantasyPoints[sleeperId],
                fantasy_points: points
              };
            } else {
              updatedFantasyPoints[sleeperId] = {
                fantasy_points: points,
                sleeper_id: sleeperId
              };
            }
          });
          return updatedFantasyPoints;
        });
        setLastUpdateTime(new Date());
      } catch (error) {
        console.error('Error refreshing Sleeper points:', error);
      } finally {
        hideIndicatorTimeoutId = window.setTimeout(() => {
          if (isMounted) {
            setShowUpdatingIndicator(false);
          }
        }, 1000);
      }
    };

    refreshPoints();
    const intervalId = window.setInterval(refreshPoints, 60000);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
      if (hideIndicatorTimeoutId) {
        clearTimeout(hideIndicatorTimeoutId);
      }
    };
  }, [liveUpdate, selectedWeek, dfsSalaryData, playerMetadata, parseLineups, buildDstSleeperIdSet]);

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
              <div className="results-header-section">
                <div className="results-title-container">
                  <h2>Results - Week {selectedWeek}</h2>
                  <button
                    className={`live-update-toggle ${liveUpdate ? 'active' : ''}`}
                    onClick={() => {
                      setLiveUpdate(!liveUpdate);
                    }}
                  >
                    Live Update
                  </button>
                  {formattedLastUpdate && (
                    <span className="live-update-timestamp">
                      Last updated {formattedLastUpdate}
                    </span>
                  )}
                  {showUpdatingIndicator && (
                    <span className="live-update-status">Updating…</span>
                  )}
                </div>
              </div>
          
              {sortedLineups.map((lineup, idx) => {
                const rank = idx + 1;
                const isVisible = loadedFromUrl ? visibleRanks.has(rank) : true;
                const isGhost = loadedFromUrl && visibleRanks.has(-rank);
                const lineupKey = lineup.key;
                
                // Show ghost placeholder for top 3 ranks before reveal
                if (isGhost && rank <= 3) {
                  return (
                    <div key={`ghost-${lineupKey}`} className="lineup-grid ghost-grid visible">
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
                    key={lineupKey} 
                    className={`lineup-grid ${isVisible ? 'visible' : 'hidden'}`}
                    ref={el => {
                      if (el) {
                        lineupRefs.current[lineupKey] = el;
                      } else {
                        delete lineupRefs.current[lineupKey];
                      }
                    }}
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
                        const isNotPlayed = pointsDisplay === 'Not played';
                        const backgroundColor = isOut 
                          ? 'rgba(220, 53, 69, 0.8)' 
                          : isNotPlayed 
                            ? 'rgb(235, 88, 254, 0.8)' 
                            : getPositionColor(position);
                        console.log('Render info', {
                          lineupUsername: lineup.username,
                          sleeperId: player.sleeperId,
                          info,
                          pointsDisplay,
                          position,
                          isOut,
                          isNotPlayed
                        });
                        return (
                          <div
                            key={pIdx} 
                            className="dfs-results-player-card"
                            style={{ backgroundColor }}
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
                    <div className="total-points-cell">{calculateTotalPoints(lineup.players).toFixed(1)}</div>
                  </div>
                );
              })}

              <div className="stats-section">
                <h3>Position Statistics</h3>
                {Object.entries(getStatsData()).map(([position, { chosen, bestChosen, bestNotChosen }]) => (
                  <div key={position} className="position-stats">
                    <h4>{position}</h4>
                    <div className="stats-table-group">
                      <div className="stats-table">
                        <h5>Most Chosen Players</h5>
                        {chosen.length === 0 ? (
                          <p className="stats-empty">No data</p>
                        ) : (
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
                              {chosen.map((player, index) => (
                                <tr key={index}>
                                  <td>{player.name} ({player.team})</td>
                                  <td>{player.count}</td>
                                  <td>${player.count > 0 ? Math.round(player.totalSalary / player.count).toLocaleString() : 0}</td>
                                  <td>{player.count > 0 ? (player.totalPoints / player.count).toFixed(1) : '0.0'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>

                      <div className="stats-table">
                        <h5>Best Chosen (Pts / $1k)</h5>
                        {bestChosen.length === 0 ? (
                          <p className="stats-empty">No data</p>
                        ) : (
                          <table>
                            <thead>
                              <tr>
                                <th>Player</th>
                                <th>Value</th>
                                <th>Count</th>
                                <th>Avg Points</th>
                              </tr>
                            </thead>
                            <tbody>
                              {bestChosen.map((player, index) => (
                                <tr key={index}>
                                  <td>{player.name} ({player.team})</td>
                                  <td>{player.value.toFixed(2)}</td>
                                  <td>{player.count}</td>
                                  <td>{player.count > 0 ? (player.totalPoints / player.count).toFixed(1) : '0.0'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>

                      <div className="stats-table">
                        <h5>Best Not Chosen (Pts / $1k)</h5>
                        {bestNotChosen.length === 0 ? (
                          <p className="stats-empty">No data</p>
                        ) : (
                          <table>
                            <thead>
                              <tr>
                                <th>Player</th>
                                <th>Value</th>
                                <th>Salary</th>
                                <th>Points</th>
                              </tr>
                            </thead>
                            <tbody>
                              {bestNotChosen.map((player, index) => (
                                <tr key={index}>
                                  <td>{player.name} ({player.team})</td>
                                  <td>{player.value.toFixed(2)}</td>
                                  <td>${player.salary?.toLocaleString() ?? '-'}</td>
                                  <td>{player.points?.toFixed(1) ?? '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default DFSResults;
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSort, faSortUp, faSortDown } from '@fortawesome/free-solid-svg-icons';
import LZString from 'lz-string';
import './DFS.css';

// Add a mock flag
const mock = true; // Set to true for mock data, false for production

// Define the base URL based on the mock flag
const BASE_URL = mock
  ? "http://localhost:5000"
  : "https://shaggy-latashia-carnade-2ea2054a.koyeb.app";

function DFS({ userName }) {
  const navigate = useNavigate();
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [roster, setRoster] = useState({
    QB: null,
    RB1: null,
    RB2: null,
    WR1: null,
    WR2: null,
    WR3: null,
    TE: null,
    FLX: null,
    DST: null
  });
  
  // Filter states
  const [salaryRange, setSalaryRange] = useState([0, 10000]);
  const [minSalary, setMinSalary] = useState(0);
  const [maxSalary, setMaxSalary] = useState(10000);
  const [selectedTeam, setSelectedTeam] = useState('');
  const [selectedPosition, setSelectedPosition] = useState(null);
  const [selectedDays, setSelectedDays] = useState([]);
  const [hideUnavailable, setHideUnavailable] = useState(false);
  const [hideOut, setHideOut] = useState(false);
  const [hideQuestionable, setHideQuestionable] = useState(false);
  const [nameFilter, setNameFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [lineupCode, setLineupCode] = useState('');
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [loadLineupCode, setLoadLineupCode] = useState('');
  const [showUsernameModal, setShowUsernameModal] = useState(false);
  const [tempUsername, setTempUsername] = useState('');
  const [availableTinyUrls, setAvailableTinyUrls] = useState([]);
  const [loadingTinyUrls, setLoadingTinyUrls] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [entryToOverwrite, setEntryToOverwrite] = useState(null);
  const [submittedEntries, setSubmittedEntries] = useState(new Set());
  const [loadableLineups, setLoadableLineups] = useState([]);
  const [loadingLoadableLineups, setLoadingLoadableLineups] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Check cache first
        const cachedWeek = sessionStorage.getItem('nfl_current_week');
        const cachedPlayers = sessionStorage.getItem('dfs_players');
        const cacheTimestamp = sessionStorage.getItem('dfs_cache_timestamp');
        
        const now = Date.now();
        const cacheExpiry = 60 * 60 * 1000; // 1 hour
        
        if (cachedWeek && cachedPlayers && cacheTimestamp && (now - parseInt(cacheTimestamp)) < cacheExpiry) {
          const data = JSON.parse(cachedPlayers);
          
          // Only use cached data if it's not empty
          if (data && data.length > 0) {
            setPlayers(data);
            
            // Calculate min and max salary
            const salaries = data.map(p => p.salary).filter(s => s);
            const min = Math.min(...salaries);
            const max = Math.max(...salaries);
            setMinSalary(min);
            setMaxSalary(max);
            setSalaryRange([min, max]);
            
            setLoading(false);
            return;
          }
        }
        
        // Fetch current NFL week
        const weekResponse = await fetch('https://api.sleeper.app/v1/state/nfl');
        const weekData = await weekResponse.json();
        const currentWeek = weekData.week;

        // Fetch DFS salaries
        const salariesResponse = await fetch(`${BASE_URL}/dfs-salaries/week/${currentWeek}`);
        const salariesData = await salariesResponse.json();
        
        // Transform data to match our structure
        const data = Object.values(salariesData).map(player => ({
          name: player.name,
          position: player.position,
          team: player.team,
          salary: player.salary,
          injury_status: player.injury_status || '',
          opp: player.opponent,
          spread: player.spread,
          over_under: player.over_under,
          implied_team_score: player.proj_team_score,
          L5_dvp_rank: player.opp_rank,
          L5_fppg_avg: player.l5_avg,
          L10_fppg_avg: player.l10_avg,
          szn_fppg_avg: player.season_avg,
          ppg_projection: player.projected_points,
          value_projection: player.value_proj,
          sleeper_id: player.sleeper_id,
          game_date: player.game_date,
          slate_day: player.slate_day || '',
          game_day: player.game_day || player.slate_day || ''
        }));
        
        // Cache the data
        sessionStorage.setItem('nfl_current_week', currentWeek.toString());
        sessionStorage.setItem('dfs_players', JSON.stringify(data));
        sessionStorage.setItem('dfs_cache_timestamp', now.toString());
        
        setPlayers(data);
        
        // Calculate min and max salary
        if (data.length > 0) {
          const salaries = data.map(p => p.salary).filter(s => s);
          const min = Math.min(...salaries);
          const max = Math.max(...salaries);
          setMinSalary(min);
          setMaxSalary(max);
          setSalaryRange([min, max]);
        }
        
        setLoading(false);
      } catch (error) {
        console.error('Error loading DFS data:', error);
        setLoading(false);
      }
    };
    
    fetchData();
  }, []);

  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const getFilteredPlayers = () => {
    return players.filter(player => {
      // Name filter (wildcard search)
      if (nameFilter && !player.name.toLowerCase().includes(nameFilter.toLowerCase())) {
        return false;
      }
      
      // Salary filter
      if (player.salary < salaryRange[0] || player.salary > salaryRange[1]) {
        return false;
      }
      
      // Team filter
      if (selectedTeam && player.team !== selectedTeam) {
        return false;
      }
      
      // Position filter
      if (selectedPosition && player.position !== selectedPosition) {
        return false;
      }
      
      // Day filter (multiple days can be selected)
      // Use game_day for filtering
      if (selectedDays.length > 0) {
        const playerDay = player.game_day || player.slate_day;
        // Filter out players without a game_day when any day filter is active
        if (!playerDay || !selectedDays.includes(playerDay)) {
          return false;
        }
      }
      
      // Hide unavailable filter
      if (hideUnavailable) {
        const inRoster = isPlayerInRoster(player);
        const canAdd = canAddPlayer(player);
        if (!inRoster && !canAdd) {
          return false;
        }
      }
      
      // Hide Out filter
      if (hideOut && player.injury_status === 'O') {
        return false;
      }
      
      // Hide Questionable filter
      if (hideQuestionable && player.injury_status === 'Q') {
        return false;
      }
      
      return true;
    });
  };

  const getSortedPlayers = () => {
    const filtered = getFilteredPlayers();
    
    if (!sortConfig.key) return filtered;

    return [...filtered].sort((a, b) => {
      const aValue = a[sortConfig.key];
      const bValue = b[sortConfig.key];

      // Handle null/undefined values
      if (aValue === null || aValue === undefined || aValue === '') return 1;
      if (bValue === null || bValue === undefined || bValue === '') return -1;

      // Compare numbers
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortConfig.direction === 'asc' ? aValue - bValue : bValue - aValue;
      }

      // Compare strings
      const aStr = String(aValue).toLowerCase();
      const bStr = String(bValue).toLowerCase();
      
      if (sortConfig.direction === 'asc') {
        return aStr < bStr ? -1 : aStr > bStr ? 1 : 0;
      } else {
        return aStr > bStr ? -1 : aStr < bStr ? 1 : 0;
      }
    });
  };

  const getUniqueTeams = () => {
    const teams = [...new Set(players.map(p => p.team).filter(t => t))];
    return teams.sort();
  };

  const generateLineupCode = () => {
    // Use userName from props, fallback to localStorage, then 'Anonymous'
    const settings = JSON.parse(localStorage.getItem('FantasyHelperSettings') || '{}');
    const username = userName || settings.userName || 'Anonymous';
    
    // Build lineup string from roster
    const lineupParts = Object.values(roster)
      .filter(player => player !== null)
      .map(player => `${player.sleeper_id}-${player.salary}`)
      .join(',');
    
    // Base64 encode the lineup
    const encoded = btoa(lineupParts);
    
    // Format: Username:EncodedLineup
    return `${username}:${encoded}`;
  };

  const handleFinish = () => {
    // Check if username is empty
    const settings = JSON.parse(localStorage.getItem('FantasyHelperSettings') || '{}');
    const currentUsername = userName || settings.userName;
    
    if (!currentUsername || currentUsername.trim() === '' || currentUsername === 'Anonymous') {
      // Show username prompt modal
      setShowUsernameModal(true);
      return;
    }
    
    // If username exists, proceed normally
    const code = generateLineupCode();
    setLineupCode(code);
    setShowModal(true);
  };

  const handleUsernameSubmit = () => {
    if (!tempUsername || tempUsername.trim() === '') {
      alert('Please enter a username/handle');
      return;
    }
    
    const trimmedUsername = tempUsername.trim();
    
    // Save username to localStorage
    const settings = JSON.parse(localStorage.getItem('FantasyHelperSettings') || '{}');
    settings.userName = trimmedUsername;
    localStorage.setItem('FantasyHelperSettings', JSON.stringify(settings));
    
    // Close username modal
    setShowUsernameModal(false);
    setTempUsername(''); // Clear temp username
    
    // Generate lineup code with the new username
    // Build lineup string from roster
    const lineupParts = Object.values(roster)
      .filter(player => player !== null)
      .map(player => `${player.sleeper_id}-${player.salary}`)
      .join(',');
    
    // Base64 encode the lineup
    const encoded = btoa(lineupParts);
    
    // Format: Username:EncodedLineup
    const code = `${trimmedUsername}:${encoded}`;
    setLineupCode(code);
    setShowModal(true);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(lineupCode).then(() => {
      // Could add a visual feedback here
      console.log('Copied to clipboard!');
    });
  };

  const fetchAvailableTinyUrls = useCallback(async (username) => {
    if (!username || username.trim() === '' || username === 'Anonymous') {
      setAvailableTinyUrls([]);
      return;
    }

    setLoadingTinyUrls(true);
    try {
      const response = await fetch(`${BASE_URL}/tinyurl/${username}/available`);
      if (response.ok) {
        const data = await response.json();
        // Handle both cases: entries as strings or as objects
        const entryNames = Array.isArray(data.entries) 
          ? data.entries.map(entry => typeof entry === 'string' ? entry : entry.name || entry)
          : [];
        
        // Fetch full details for each entry to get has_data and week
        const entriesWithDetails = await Promise.all(
          entryNames.map(async (entryName) => {
            try {
              const detailResponse = await fetch(`${BASE_URL}/tinyurl/${entryName}/${username}/check`);
              if (detailResponse.ok) {
                const detailData = await detailResponse.json();
                return {
                  name: entryName,
                  has_data: detailData.has_data || false,
                  week: detailData.week || null
                };
              }
              // If detail fetch fails, return basic entry
              return {
                name: entryName,
                has_data: false,
                week: null
              };
            } catch (error) {
              console.error(`Error fetching details for ${entryName}:`, error);
              return {
                name: entryName,
                has_data: false,
                week: null
              };
            }
          })
        );
        
        setAvailableTinyUrls(entriesWithDetails);
      } else {
        setAvailableTinyUrls([]);
      }
    } catch (error) {
      console.error('Error fetching available tinyURLs:', error);
      setAvailableTinyUrls([]);
    } finally {
      setLoadingTinyUrls(false);
    }
  }, []);

  const fetchLoadableLineups = useCallback(async (username) => {
    if (!username || username.trim() === '' || username === 'Anonymous') {
      setLoadableLineups([]);
      return;
    }

    setLoadingLoadableLineups(true);
    try {
      // Fetch available entries
      const availableResponse = await fetch(`${BASE_URL}/tinyurl/${username}/available`);
      if (!availableResponse.ok) {
        setLoadableLineups([]);
        return;
      }

      const availableData = await availableResponse.json();
      const entryNames = Array.isArray(availableData.entries) 
        ? availableData.entries.map(entry => typeof entry === 'string' ? entry : entry.name || entry)
        : [];

      // For each entry, check if user has submitted and fetch their lineup
      const lineupPromises = entryNames.map(async (entryName) => {
        try {
          // Check details to see if user has submitted
          const detailsResponse = await fetch(`${BASE_URL}/tinyurl/${entryName}/details`);
          if (!detailsResponse.ok) return null;

          const details = await detailsResponse.json();
          const userSubmission = details.submissions?.[username];
          
          if (!userSubmission?.has_submitted) {
            return null; // User hasn't submitted to this entry
          }

          // Fetch the data
          const dataResponse = await fetch(`${BASE_URL}/tinyurl/${entryName}/data`);
          if (!dataResponse.ok) return null;

          const dataResult = await dataResponse.json();
          const hashData = dataResult.data;

          // Parse the data to extract user's lineup
          try {
            const [weekStr, compressedData] = hashData.split('|');
            const week = parseInt(weekStr);

            // Decompress
            let decompressed = LZString.decompressFromEncodedURIComponent(compressedData);
            if (!decompressed) {
              decompressed = LZString.decompressFromBase64(compressedData);
            }
            if (!decompressed) {
              decompressed = LZString.decompressFromUTF16(compressedData);
            }

            if (decompressed) {
              // Split into individual lineups
              const lineups = decompressed.split('|');
              // Find the user's lineup
              const userLineup = lineups.find(lineup => {
                const [lineupUsername] = lineup.split(':');
                return lineupUsername === username;
              });

              if (userLineup) {
                const [lineupUsername, rawData] = userLineup.split(':');
                const encoded = btoa(rawData);
                const lineupCode = `${lineupUsername}:${encoded}`;

                return {
                  entryName,
                  week,
                  lineupCode,
                  updatedAt: userSubmission.updated_at || userSubmission.created_at
                };
              }
            }
          } catch (error) {
            console.error(`Error parsing data for ${entryName}:`, error);
            return null;
          }
        } catch (error) {
          console.error(`Error fetching lineup from ${entryName}:`, error);
          return null;
        }
        return null;
      });

      const lineups = (await Promise.all(lineupPromises)).filter(Boolean);
      setLoadableLineups(lineups);
    } catch (error) {
      console.error('Error fetching loadable lineups:', error);
      setLoadableLineups([]);
    } finally {
      setLoadingLoadableLineups(false);
    }
  }, []);

  // Fetch available tinyURLs when modal opens
  useEffect(() => {
    if (showModal) {
      const settings = JSON.parse(localStorage.getItem('FantasyHelperSettings') || '{}');
      const currentUsername = userName || settings.userName;
      if (currentUsername && currentUsername !== 'Anonymous') {
        fetchAvailableTinyUrls(currentUsername);
      }
    } else {
      setAvailableTinyUrls([]);
    }
  }, [showModal, userName, fetchAvailableTinyUrls]);

  // Fetch loadable lineups when load modal opens
  useEffect(() => {
    if (showLoadModal) {
      const settings = JSON.parse(localStorage.getItem('FantasyHelperSettings') || '{}');
      const currentUsername = userName || settings.userName;
      if (currentUsername && currentUsername !== 'Anonymous') {
        fetchLoadableLineups(currentUsername);
      }
    } else {
      setLoadableLineups([]);
    }
  }, [showLoadModal, userName, fetchLoadableLineups]);

  const handleAddToLeague = (entry) => {
    // If entry has data, show confirmation modal
    if (entry.has_data) {
      setEntryToOverwrite(entry);
      setShowConfirmModal(true);
    } else {
      // No data, proceed directly
      proceedWithAddToLeague(entry);
    }
  };

  const proceedWithAddToLeague = async (entry) => {
    try {
      // Get username from props or settings
      const settings = JSON.parse(localStorage.getItem('FantasyHelperSettings') || '{}');
      const username = userName || settings.userName || 'Anonymous';
      
      if (!username || username === 'Anonymous') {
        alert('Please set a username in settings before adding to league.');
        return;
      }
      
      // Get current week from sessionStorage
      const currentWeek = sessionStorage.getItem('nfl_current_week');
      if (!currentWeek) {
        alert('Unable to determine current week. Please refresh the page.');
        return;
      }
      
      // Generate lineup code (format: username:encodedLineup)
      const lineupCode = generateLineupCode();
      
      // Decode the base64 to get the raw player data
      const [codeUsername, encoded] = lineupCode.split(':');
      const decoded = atob(encoded);
      
      // Format as username:decodedData (same format as DFSResults expects)
      const formattedData = `${codeUsername}:${decoded}`;
      
      // Compress the data using LZ-String
      const compressed = LZString.compressToEncodedURIComponent(formattedData);
      
      // Format as week|compressedData (same format as DFSResults hash)
      const data = `${currentWeek}|${compressed}`;
      
      // Make POST request to add endpoint
      const response = await fetch(`${BASE_URL}/tinyurl/${entry.name}/add`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: username,
          data: data
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log('Successfully added to league:', result);
        // Mark entry as submitted
        setSubmittedEntries(prev => new Set(prev).add(entry.name));
        // Close confirmation modal if it was open
        setShowConfirmModal(false);
        setEntryToOverwrite(null);
        // Optionally refresh the available tinyURLs list
        if (userName || settings.userName) {
          fetchAvailableTinyUrls(userName || settings.userName);
        }
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('Error adding to league:', errorData);
        alert(`Failed to add lineup: ${errorData.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error adding to league:', error);
      alert(`Error adding lineup: ${error.message}`);
    }
  };

  const handleConfirmCancel = () => {
    setShowConfirmModal(false);
    setEntryToOverwrite(null);
  };

  const loadLineupFromCode = (lineupCode) => {
    try {
      // Clear current roster
      setRoster({
        QB: null,
        RB1: null,
        RB2: null,
        WR1: null,
        WR2: null,
        WR3: null,
        TE: null,
        FLX: null,
        DST: null
      });

      // Parse the lineup code - handle both formats
      let encoded;
      if (lineupCode.includes(':')) {
        // Format: username:encodedData
        const [, encodedData] = lineupCode.split(':');
        encoded = encodedData;
      } else {
        // Format: just encodedData (no username)
        encoded = lineupCode;
      }

      if (!encoded) {
        throw new Error('Invalid lineup code format');
      }

      // Decode the base64
      const decoded = atob(encoded);
      console.log('Decoded lineup data:', decoded);
      const playerPairs = decoded.split(',');
      console.log('Player pairs:', playerPairs);

      // Find and add players to roster
      playerPairs.forEach((pair, index) => {
        console.log(`Processing pair ${index + 1}:`, pair);
        const [sleeperId, salary] = pair.split('-');
        console.log(`Sleeper ID: ${sleeperId}, Salary: ${salary}`);
        
        const player = players.find(p => p.sleeper_id === sleeperId);
        console.log(`Found player:`, player ? `${player.name} (${player.position})` : 'NOT FOUND');
        
        if (player) {
          console.log(`Adding player to roster: ${player.name}`);
          addPlayerToRoster(player);
        } else {
          console.log(`Player not found for sleeper_id: ${sleeperId}`);
        }
      });

      // Close modal and clear input
      setShowLoadModal(false);
      setLoadLineupCode('');
      
    } catch (error) {
      alert('Error loading lineup: ' + error.message);
    }
  };

  const handleLoadLineup = () => {
    loadLineupFromCode(loadLineupCode);
  };

  const handleLoadLineupFromList = (lineup) => {
    loadLineupFromCode(lineup.lineupCode);
  };

  const getSortIcon = (key) => {
    if (sortConfig.key !== key) {
      return <FontAwesomeIcon icon={faSort} className="sort-icon" />;
    }
    return sortConfig.direction === 'asc' 
      ? <FontAwesomeIcon icon={faSortUp} className="sort-icon active" />
      : <FontAwesomeIcon icon={faSortDown} className="sort-icon active" />;
  };

  const formatHeader = (header) => {
    // Special cases
    if (header === 'name') return 'Player';
    if (header === 'injury_status') return 'Injury';
    if (header === 'opp') return 'Opp';
    if (header === 'L5_dvp_rank') return 'VS DEF';
    if (header === 'L5_fppg_avg') return 'L5 FPPG';
    if (header === 'L10_fppg_avg') return 'L10 FPPG';
    if (header === 'szn_fppg_avg') return 'Season FPPG';
    if (header === 'ppg_projection') return 'Proj PPG';
    if (header === 'value_projection') return 'Proj Value';
    if (header === 'ppg_actual') return 'Actual PPG';
    if (header === 'value_actual') return 'Actual Value';
    
    // Format header names to be more readable
    return header
      .replace(/_/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase());
  };

  const getDvpColor = (rank) => {
    if (!rank || typeof rank !== 'number') return null;
    
    if (rank >= 1 && rank <= 10) {
      // Red gradient: rank 1 is darkest red (#c41e3a), rank 10 is lightest red (#ff9999)
      const intensity = 1 - ((rank - 1) / 9); // 1.0 at rank 1, 0.1 at rank 10
      const r = Math.round(196 + (59 * (1 - intensity))); // 196 to 255
      const g = Math.round(30 + (123 * (1 - intensity))); // 30 to 153
      const b = Math.round(58 + (95 * (1 - intensity))); // 58 to 153
      return `rgb(${r}, ${g}, ${b})`;
    }
    
    if (rank >= 22 && rank <= 32) {
      // Green gradient: rank 22 starts at what rank 30 was, rank 32 is slightly darker
      const intensity = (rank - 22) / 10; // 0.0 at rank 22, 1.0 at rank 32
      
      // Calculate what rank 30 would have been in the old scale
      const rank30Intensity = (30 - 22) / 10; // 0.8
      const startR = Math.round(102 - (72 * rank30Intensity)); // ~44
      const startG = Math.round(204 - (78 * rank30Intensity)); // ~142
      const startB = Math.round(102 - (50 * rank30Intensity)); // ~62
      
      // Darken slightly from rank 22 to 32
      const r = Math.round(startR - (14 * intensity)); // 44 to 30
      const g = Math.round(startG - (16 * intensity)); // 142 to 126
      const b = Math.round(startB - (10 * intensity)); // 62 to 52
      
      return `rgb(${r}, ${g}, ${b})`;
    }
    
    return null;
  };

  const formatValue = (value, header) => {
    // Format specific columns
    if (header === 'salary' && typeof value === 'number') {
      return `$${value.toLocaleString()}`;
    }
    if (typeof value === 'number' && !Number.isInteger(value)) {
      return value.toFixed(1);
    }
    return value;
  };

  const addPlayerToRoster = (player) => {
    const position = player.position;
    
    // Use functional update to ensure we work with the latest state
    setRoster(prev => {
      // Find first available slot for this position
      if (position === 'QB' && !prev.QB) {
        console.log(`Adding ${player.name} to QB slot`);
        return { ...prev, QB: player };
      } else if (position === 'RB') {
        if (!prev.RB1) {
          console.log(`Adding ${player.name} to RB1 slot`);
          return { ...prev, RB1: player };
        } else if (!prev.RB2) {
          console.log(`Adding ${player.name} to RB2 slot`);
          return { ...prev, RB2: player };
        } else if (!prev.FLX) {
          console.log(`Adding ${player.name} to FLX slot`);
          return { ...prev, FLX: player };
        }
      } else if (position === 'WR') {
        if (!prev.WR1) {
          console.log(`Adding ${player.name} to WR1 slot`);
          return { ...prev, WR1: player };
        } else if (!prev.WR2) {
          console.log(`Adding ${player.name} to WR2 slot`);
          return { ...prev, WR2: player };
        } else if (!prev.WR3) {
          console.log(`Adding ${player.name} to WR3 slot`);
          return { ...prev, WR3: player };
        } else if (!prev.FLX) {
          console.log(`Adding ${player.name} to FLX slot`);
          return { ...prev, FLX: player };
        }
      } else if (position === 'TE') {
        if (!prev.TE) {
          console.log(`Adding ${player.name} to TE slot`);
          return { ...prev, TE: player };
        } else if (!prev.FLX) {
          console.log(`Adding ${player.name} to FLX slot`);
          return { ...prev, FLX: player };
        }
      } else if (position === 'DST' && !prev.DST) {
        console.log(`Adding ${player.name} to DST slot`);
        return { ...prev, DST: player };
      }
      
      console.log(`Could not add ${player.name} - no available slots`);
      return prev;
    });
  };

  const removePlayerFromRoster = (slotKey) => {
    setRoster(prev => ({ ...prev, [slotKey]: null }));
  };

  const isPlayerInRoster = (player) => {
    return Object.values(roster).some(p => p && p.name === player.name);
  };

  const canAddPlayer = (player) => {
    const position = player.position;
    const currentSalary = getTotalSalary();
    const SALARY_CAP = 50000;
    
    // Check if player has already played their game
    if (player.game_date) {
      const gameDate = new Date(player.game_date);
      const now = new Date();
      
      // Get the day after the game date (games are typically over by the next day)
      const dayAfterGame = new Date(gameDate);
      dayAfterGame.setDate(dayAfterGame.getDate() + 1);
      
      // Only disable if it's the day after the game or later
      if (now >= dayAfterGame) {
        return false;
      }
    }
    
    // Check salary cap
    if (currentSalary + player.salary > SALARY_CAP) {
      return false;
    }
    
    // Check if position has available slots
    if (position === 'QB') {
      return !roster.QB;
    } else if (position === 'RB') {
      return !roster.RB1 || !roster.RB2 || !roster.FLX;
    } else if (position === 'WR') {
      return !roster.WR1 || !roster.WR2 || !roster.WR3 || !roster.FLX;
    } else if (position === 'TE') {
      return !roster.TE || !roster.FLX;
    } else if (position === 'DST') {
      return !roster.DST;
    }
    
    return false;
  };

  const togglePlayerSelection = (index, player) => {
    const inRoster = isPlayerInRoster(player);
    
    if (inRoster) {
      // Remove from roster - find which slot has this player
      const slotKey = Object.keys(roster).find(key => roster[key] && roster[key].name === player.name);
      if (slotKey) {
        removePlayerFromRoster(slotKey);
      }
    } else {
      // Add to roster
      addPlayerToRoster(player);
    }
  };

  const getTotalFpts = () => {
    return Object.values(roster).reduce((sum, player) => {
      return sum + (player ? (player.ppg_projection || 0) : 0);
    }, 0);
  };

  const getTotalSalary = () => {
    return Object.values(roster).reduce((sum, player) => {
      return sum + (player?.salary || 0);
    }, 0);
  };

  const getPositionLabel = (key) => {
    if (key === 'RB1' || key === 'RB2') return 'RB';
    if (key === 'WR1' || key === 'WR2' || key === 'WR3') return 'WR';
    return key;
  };

  const getPositionColor = (key) => {
    const position = getPositionLabel(key);
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

  if (loading) {
    return (
      <div className="dfs-container">
        <div className="dfs-header">
          <h1>DFS</h1>
          <p className="dfs-subtitle">Daily Fantasy Sports</p>
        </div>
        <div className="dfs-content">
          <div className="dfs-loading">Loading players...</div>
        </div>
      </div>
    );
  }

  const sortedPlayers = getSortedPlayers();
  
  // Define explicit header order (excluding sleeper_id which is for internal use)
  const headers = players.length > 0 ? [
    'name',
    'position', 
    'team',
    'salary',
    'injury_status',
    'opp',
    'spread',
    'over_under',
    'implied_team_score',
    'L5_dvp_rank',
    'L5_fppg_avg',
    'L10_fppg_avg',
    'szn_fppg_avg',
    'ppg_projection',
    'value_projection'
  ] : [];

  return (
    <div className="dfs-container">
      <div className="dfs-header">
        <div className="dfs-header-content">
          <div>
            <h1>DFS</h1>
            <p className="dfs-subtitle">
              Daily Fantasy Sports • Week {sessionStorage.getItem('nfl_current_week') || '...'}
              <span className="dfs-info-divider">|</span>
              <span className="dfs-info">Salary Cap: $50,000</span>
              <span className="dfs-info-divider">|</span>
              <span className="dfs-info">PPR Scoring</span>
            </p>
          </div>
          <div className="dfs-header-buttons">
            <button className="load-lineup-button" onClick={() => setShowLoadModal(true)}>
              Load Lineup
            </button>
            <button className="check-results-button" onClick={() => navigate('/dfs/results')}>
              Check Results!
            </button>
          </div>
        </div>
      </div>

      <div className="dfs-top-section">
        <div className="dfs-team-section">
          <h2>My Team</h2>
          <table className="dfs-team-table">
            <thead>
              <tr>
                <th>Position</th>
                <th>Player</th>
                <th>Salary</th>
                <th>Fpts</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {Object.keys(roster).map((key) => (
                <tr key={key}>
                  <td>
                    <div 
                      className="position-badge"
                      style={{ backgroundColor: getPositionColor(key) }}
                    >
                      {getPositionLabel(key)}
                    </div>
                  </td>
                  <td className="player-name-cell">
                    {roster[key] ? roster[key].name : '-'}
                  </td>
                  <td className="salary-cell">
                    {roster[key] ? `$${roster[key].salary.toLocaleString()}` : '-'}
                  </td>
                  <td className="fpts-cell">
                    {roster[key] ? (roster[key].ppg_projection || 0).toFixed(1) : '-'}
                  </td>
                  <td className="action-cell">
                    <button
                      className="roster-remove-btn"
                      onClick={() => removePlayerFromRoster(key)}
                      disabled={!roster[key]}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
              <tr className="total-row">
                <td colSpan="2"><strong>Total</strong></td>
                <td className="salary-cell">
                  <strong>${getTotalSalary().toLocaleString()}</strong>
                  <span className="salary-limit"> of $50,000</span>
                </td>
                <td className="fpts-cell">
                  <strong>Fpts</strong>
                </td>
                <td className="fpts-cell">
                  <strong>{getTotalFpts().toFixed(1)}</strong>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="dfs-filters-section">
        <h3>Filters</h3>

        <div className="filter-group">
          <div className="toggle-container">
            <label className="toggle-switch">
              <input 
                type="checkbox" 
                checked={hideUnavailable}
                onChange={(e) => setHideUnavailable(e.target.checked)}
              />
              <span className="toggle-slider"></span>
            </label>
            <span className="toggle-label">Hide unavailable players</span>
          </div>
        </div>

        <div className="filter-group">
          <div className="toggle-container">
            <label className="toggle-switch">
              <input 
                type="checkbox" 
                checked={hideOut}
                onChange={(e) => setHideOut(e.target.checked)}
              />
              <span className="toggle-slider"></span>
            </label>
            <span className="toggle-label">Hide Out</span>
          </div>
        </div>

        <div className="filter-group">
          <div className="toggle-container">
            <label className="toggle-switch">
              <input 
                type="checkbox" 
                checked={hideQuestionable}
                onChange={(e) => setHideQuestionable(e.target.checked)}
              />
              <span className="toggle-slider"></span>
            </label>
            <span className="toggle-label">Hide Questionable</span>
          </div>
        </div>

        <div className="filter-group">
          <label className="filter-label">Player Name:</label>
          <input
            type="text"
            placeholder="Search player name..."
            value={nameFilter}
            onChange={(e) => setNameFilter(e.target.value)}
            className="name-filter-input"
          />
        </div>
        
        <div className="filter-group">
          <label className="filter-label">Salary Range:</label>
          <div className="salary-slider-container">
            <div className="dual-slider-wrapper">
              <input
                type="range"
                min={minSalary}
                max={maxSalary}
                value={salaryRange[0]}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  if (value < salaryRange[1]) {
                    setSalaryRange([value, salaryRange[1]]);
                  }
                }}
                className="salary-slider salary-slider-min"
              />
              <input
                type="range"
                min={minSalary}
                max={maxSalary}
                value={salaryRange[1]}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  if (value > salaryRange[0]) {
                    setSalaryRange([salaryRange[0], value]);
                  }
                }}
                className="salary-slider salary-slider-max"
              />
            </div>
            <div className="salary-values">
              <span>${salaryRange[0].toLocaleString()}</span>
              <span>${salaryRange[1].toLocaleString()}</span>
            </div>
          </div>
        </div>

        <div className="filter-group">
          <label className="filter-label">Team:</label>
          <select 
            value={selectedTeam} 
            onChange={(e) => setSelectedTeam(e.target.value)}
            className="team-dropdown"
          >
            <option value="">All Teams</option>
            {getUniqueTeams().map(team => (
              <option key={team} value={team}>{team}</option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label className="filter-label">Position:</label>
          <div className="filter-buttons">
            <button
              className={`filter-button ${selectedPosition === 'QB' ? 'qb-active' : ''}`}
              onClick={() => setSelectedPosition(prev => prev === 'QB' ? null : 'QB')}
            >
              QB
            </button>
            <button
              className={`filter-button ${selectedPosition === 'RB' ? 'rb-active' : ''}`}
              onClick={() => setSelectedPosition(prev => prev === 'RB' ? null : 'RB')}
            >
              RB
            </button>
            <button
              className={`filter-button ${selectedPosition === 'WR' ? 'wr-active' : ''}`}
              onClick={() => setSelectedPosition(prev => prev === 'WR' ? null : 'WR')}
            >
              WR
            </button>
            <button
              className={`filter-button ${selectedPosition === 'TE' ? 'te-active' : ''}`}
              onClick={() => setSelectedPosition(prev => prev === 'TE' ? null : 'TE')}
            >
              TE
            </button>
            <button
              className={`filter-button ${selectedPosition === 'DST' ? 'dst-active' : ''}`}
              onClick={() => setSelectedPosition(prev => prev === 'DST' ? null : 'DST')}
            >
              DST
            </button>
          </div>
        </div>

        <div className="filter-group">
          <label className="filter-label">Day:</label>
          <div className="filter-buttons">
            {(() => {
              // Get unique days from players (use game_day if available, otherwise slate_day)
              const uniqueDays = [...new Set(players.map(p => p.game_day || p.slate_day).filter(Boolean))].sort();
              return uniqueDays.map(day => (
                <button
                  key={day}
                  className={`filter-button ${selectedDays.includes(day) ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedDays(prev => {
                      if (prev.includes(day)) {
                        // Button is on, turning it off
                        // If this is the last selected button, clear all and show all
                        if (prev.length === 1) {
                          return [];
                        }
                        // Otherwise, remove this day
                        return prev.filter(d => d !== day);
                      } else {
                        // Button is off, turning it on
                        // If this would make all buttons selected, clear all instead
                        if (prev.length === uniqueDays.length - 1) {
                          return [];
                        }
                        // Otherwise, add this day
                        return [...prev, day];
                      }
                    });
                  }}
                >
                  {day}
                </button>
              ));
            })()}
          </div>
        </div>
        </div>

        <button className="finish-button" onClick={handleFinish}>
          <span className="finish-icon">✓</span>
          Finish Lineup
        </button>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="lineup-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close-btn" onClick={() => setShowModal(false)}>
              ×
            </button>
            <h2>Your Lineup Code</h2>
            <div className="lineup-code-container">
              <code className="lineup-code">{lineupCode}</code>
              <button className="copy-btn" onClick={copyToClipboard} title="Copy to clipboard">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
              </button>
            </div>
            
            <div className="add-to-league-section">
              <h3 className="add-to-league-title">Add team to league</h3>
              {loadingTinyUrls ? (
                <p className="add-to-league-message">Loading available leagues...</p>
              ) : availableTinyUrls.length === 0 ? (
                <p className="add-to-league-message">No available leagues</p>
              ) : (
                <div className="add-to-league-buttons">
                  {availableTinyUrls.map((entry) => {
                    const isSubmitted = submittedEntries.has(entry.name);
                    
                    return (
                      <button
                        key={entry.name}
                        onClick={() => !isSubmitted && handleAddToLeague(entry)}
                        disabled={isSubmitted}
                        className={`add-to-league-btn ${entry.has_data ? 'has-data' : 'no-data'} ${isSubmitted ? 'submitted' : ''}`}
                      >
                        {isSubmitted ? 'Lineup submitted' : `${entry.name} ${entry.week ? `(Week ${entry.week})` : ''}`}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showLoadModal && (
        <div className="modal-overlay" onClick={() => setShowLoadModal(false)}>
          <div className="lineup-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close-btn" onClick={() => setShowLoadModal(false)}>
              ×
            </button>
            <h2>Load Lineup</h2>
            <div className="load-lineup-container">
              {loadableLineups.length > 0 && (
                <div className="load-lineup-list-section">
                  <h3 className="add-to-league-title">Load from your leagues</h3>
                  <div className="add-to-league-buttons">
                    {loadableLineups.map((lineup) => (
                      <button
                        key={lineup.entryName}
                        onClick={() => handleLoadLineupFromList(lineup)}
                        className="add-to-league-btn no-data"
                      >
                        {lineup.entryName} {lineup.week && `(Week ${lineup.week})`}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {loadingLoadableLineups && (
                <p className="add-to-league-message">Loading your lineups...</p>
              )}
              <div style={{ marginTop: loadableLineups.length > 0 ? '20px' : '0' }}>
                <p>Or enter your lineup code to load players:</p>
                <textarea
                  className="lineup-code-input"
                  value={loadLineupCode}
                  onChange={(e) => setLoadLineupCode(e.target.value)}
                  placeholder="Paste your lineup code here (e.g., Username:MTktNTQwMCw4MTM2LTY0MDAs...)"
                  rows={3}
                />
                <div className="load-lineup-buttons">
                  <button className="load-btn" onClick={handleLoadLineup} disabled={!loadLineupCode.trim()}>
                    Load Lineup
                  </button>
                  <button className="cancel-btn" onClick={() => setShowLoadModal(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showUsernameModal && (
        <div className="modal-overlay" onClick={() => setShowUsernameModal(false)}>
          <div className="lineup-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close-btn" onClick={() => setShowUsernameModal(false)}>
              ×
            </button>
            <h2>Enter Username/Handle</h2>
            <div className="load-lineup-container">
              <p>Please enter your username or handle to continue:</p>
              <input
                type="text"
                className="lineup-code-input"
                value={tempUsername}
                onChange={(e) => setTempUsername(e.target.value)}
                placeholder="Enter your username/handle"
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    handleUsernameSubmit();
                  }
                }}
                autoFocus
              />
              <div className="load-lineup-buttons">
                <button className="load-btn" onClick={handleUsernameSubmit}>
                  Continue
                </button>
                <button className="cancel-btn" onClick={() => setShowUsernameModal(false)}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showConfirmModal && entryToOverwrite && (
        <div className="modal-overlay" onClick={handleConfirmCancel}>
          <div className="lineup-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close-btn" onClick={handleConfirmCancel}>
              ×
            </button>
            <h2>Confirm Overwrite</h2>
            <div className="load-lineup-container">
              <p>Are you sure you want to overwrite the existing data for "{entryToOverwrite.name}"?</p>
              {entryToOverwrite.week && (
                <p style={{ color: '#6c757d', fontSize: '14px', marginTop: '8px' }}>
                  Week {entryToOverwrite.week}
                </p>
              )}
              <div className="load-lineup-buttons">
                <button 
                  className="load-btn" 
                  onClick={() => proceedWithAddToLeague(entryToOverwrite)}
                  style={{ backgroundColor: '#dc3545' }}
                >
                  Proceed
                </button>
                <button className="cancel-btn" onClick={handleConfirmCancel}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="dfs-content">
        <div className="dfs-table-wrapper">
          <table className="dfs-table">
            <thead>
              <tr>
                <th className="action-column"></th>
                {headers.map(header => (
                  <th 
                    key={header} 
                    onClick={() => handleSort(header)}
                    className="sortable"
                  >
                    <span>{formatHeader(header)}</span>
                    {getSortIcon(header)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedPlayers.map((player, index) => {
                const inRoster = isPlayerInRoster(player);
                const canAdd = canAddPlayer(player);
                const isDisabled = !inRoster && !canAdd;
                
                return (
                  <tr key={index}>
                    <td className="action-column">
                      <button
                        className={`player-toggle-btn ${inRoster ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}`}
                        onClick={() => !isDisabled && togglePlayerSelection(index, player)}
                        disabled={isDisabled}
                      >
                        {inRoster ? '×' : '+'}
                      </button>
                    </td>
                  {headers.map(header => {
                    const cellClass = header === 'injury_status' && player[header] ? 'injury' : '';
                    const dvpColor = header === 'L5_dvp_rank' ? getDvpColor(player[header]) : null;
                    
                    return (
                      <td 
                        key={header} 
                        className={cellClass}
                        style={dvpColor ? { color: dvpColor, fontWeight: 600 } : {}}
                      >
                        {formatValue(player[header], header)}
                      </td>
                    );
                  })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default DFS;


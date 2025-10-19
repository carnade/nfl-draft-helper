import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSort, faSortUp, faSortDown } from '@fortawesome/free-solid-svg-icons';
import './DFS.css';

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
  const [hideUnavailable, setHideUnavailable] = useState(false);
  const [nameFilter, setNameFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [lineupCode, setLineupCode] = useState('');

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
          return;
        }
        
        // Fetch current NFL week
        const weekResponse = await fetch('https://api.sleeper.app/v1/state/nfl');
        const weekData = await weekResponse.json();
        const currentWeek = weekData.week;

        // Fetch DFS salaries
        const salariesResponse = await fetch(`https://shaggy-latashia-carnade-2ea2054a.koyeb.app/dfs-salaries/week/${currentWeek}`);
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
          sleeper_id: player.sleeper_id
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
      
      // Hide unavailable filter
      if (hideUnavailable) {
        const inRoster = isPlayerInRoster(player);
        const canAdd = canAddPlayer(player);
        if (!inRoster && !canAdd) {
          return false;
        }
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
    const code = generateLineupCode();
    setLineupCode(code);
    setShowModal(true);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(lineupCode).then(() => {
      // Could add a visual feedback here
      console.log('Copied to clipboard!');
    });
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
    
    // Find first available slot for this position
    if (position === 'QB' && !roster.QB) {
      setRoster(prev => ({ ...prev, QB: player }));
    } else if (position === 'RB') {
      if (!roster.RB1) {
        setRoster(prev => ({ ...prev, RB1: player }));
      } else if (!roster.RB2) {
        setRoster(prev => ({ ...prev, RB2: player }));
      } else if (!roster.FLX) {
        setRoster(prev => ({ ...prev, FLX: player }));
      }
    } else if (position === 'WR') {
      if (!roster.WR1) {
        setRoster(prev => ({ ...prev, WR1: player }));
      } else if (!roster.WR2) {
        setRoster(prev => ({ ...prev, WR2: player }));
      } else if (!roster.WR3) {
        setRoster(prev => ({ ...prev, WR3: player }));
      } else if (!roster.FLX) {
        setRoster(prev => ({ ...prev, FLX: player }));
      }
    } else if (position === 'TE') {
      if (!roster.TE) {
        setRoster(prev => ({ ...prev, TE: player }));
      } else if (!roster.FLX) {
        setRoster(prev => ({ ...prev, FLX: player }));
      }
    } else if (position === 'DST' && !roster.DST) {
      setRoster(prev => ({ ...prev, DST: player }));
    }
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
          <button className="check-results-button" onClick={() => navigate('/dfs/results')}>
            Check Results!
          </button>
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
                <td colSpan="3"><strong>Total</strong></td>
                <td className="salary-cell">
                  <strong>${getTotalSalary().toLocaleString()}</strong>
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


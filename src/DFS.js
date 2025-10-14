import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSort, faSortUp, faSortDown } from '@fortawesome/free-solid-svg-icons';
import './DFS.css';

function DFS() {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [selectedPlayers, setSelectedPlayers] = useState(new Set());
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

  useEffect(() => {
    // Fetch the CSV file
    fetch('/dfs_example.csv')
      .then(response => response.text())
      .then(csvText => {
        const lines = csvText.split('\n');
        const headers = lines[0].split(',');
        
        const columnsToRemove = ['week', 'slate', 'game_date'];
        
        const data = lines.slice(1)
          .filter(line => line.trim())
          .map(line => {
            const values = line.split(',');
            const tempData = {};
            let firstName = '';
            let lastName = '';
            
            // First pass: collect all data
            headers.forEach((header, index) => {
              const value = values[index]?.trim();
              
              // Skip columns we don't want
              if (columnsToRemove.includes(header)) {
                return;
              }
              
              // Store first and last name separately
              if (header === 'first_name') {
                firstName = value || '';
                return;
              }
              if (header === 'last_name') {
                lastName = value || '';
                return;
              }
              
              // Convert numeric strings to numbers
              if (value && !isNaN(value) && value !== '') {
                tempData[header] = parseFloat(value);
              } else {
                tempData[header] = value || '';
              }
            });
            
            // Second pass: build object in desired order
            const player = {
              name: `${firstName} ${lastName}`.trim(),
              position: tempData.position,
              team: tempData.team,
              salary: tempData.salary,
              injury_status: tempData.injury_status,
              opp: tempData.opp,
              spread: tempData.spread,
              over_under: tempData.over_under,
              implied_team_score: tempData.implied_team_score,
              L5_dvp_rank: tempData.L5_dvp_rank,
              L5_fppg_avg: tempData.L5_fppg_avg,
              L10_fppg_avg: tempData.L10_fppg_avg,
              szn_fppg_avg: tempData.szn_fppg_avg,
              ppg_projection: tempData.ppg_projection,
              value_projection: tempData.value_projection
            };
            
            return player;
          });
        
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
      })
      .catch(error => {
        console.error('Error loading CSV:', error);
        setLoading(false);
      });
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
    if (header === 'L5_dvp_rank') return 'L5 DVP';
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
      setSelectedPlayers(prev => {
        const newSet = new Set(prev);
        newSet.delete(index);
        return newSet;
      });
    } else {
      // Add to roster
      addPlayerToRoster(player);
      setSelectedPlayers(prev => {
        const newSet = new Set(prev);
        newSet.add(index);
        return newSet;
      });
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
  const headers = players.length > 0 ? Object.keys(players[0]) : [];

  return (
    <div className="dfs-container">
      <div className="dfs-header">
        <h1>DFS</h1>
        <p className="dfs-subtitle">Daily Fantasy Sports • Week 6</p>
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
      </div>
      
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
                    {headers.map(header => (
                      <td key={header} className={header === 'injury_status' && player[header] ? 'injury' : ''}>
                        {formatValue(player[header], header)}
                      </td>
                    ))}
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


import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './TournamentCreate.css';

// Add a mock flag
const mock = false; // Set to true for localhost, false for production

// Define the base URL based on the mock flag
const BASE_URL = mock
  ? "http://localhost:5000"
  : "https://shaggy-latashia-carnade-2ea2054a.koyeb.app";

function TournamentCreate() {
  const navigate = useNavigate();
  const [tournamentName, setTournamentName] = useState('');
  const [selectedWeek, setSelectedWeek] = useState(null);
  const [currentWeek, setCurrentWeek] = useState(null);
  const [nextWeek, setNextWeek] = useState(null);
  const [leagueIds, setLeagueIds] = useState('');
  const [step, setStep] = useState(1); // 1 = enter league IDs, 2 = select participants
  const [participantCount, setParticipantCount] = useState(2);
  const [participants, setParticipants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingLeagueData, setLoadingLeagueData] = useState(false);
  const [tournamentMode, setTournamentMode] = useState('h2h'); // 'h2h' or 'pts'
  
  // Store league data: { leagueId: { name, users: [{ owner_id, username, points, rank }] } }
  const [leagueData, setLeagueData] = useState({});
  const [cachedUsers, setCachedUsers] = useState({}); // Cache user_id -> { username, display_name }
  
  // Power of 2 options up to 64
  const participantOptions = [2, 4, 8, 16, 32, 64];

  // Fetch current NFL week
  useEffect(() => {
    const fetchCurrentWeek = async () => {
      try {
        const response = await fetch('https://api.sleeper.app/v1/state/nfl');
        const data = await response.json();
        const week = data.week || 1;
        setCurrentWeek(week);
        setNextWeek(week + 1);
        setSelectedWeek(week); // Default to current week
      } catch (error) {
        console.error('Error fetching current week:', error);
        // Fallback values
        setCurrentWeek(1);
        setNextWeek(2);
        setSelectedWeek(1);
      } finally {
        setLoading(false);
      }
    };

    fetchCurrentWeek();
  }, []);

  // Generate participant structures when participantCount or mode changes (only in step 2)
  useEffect(() => {
    if (step === 2) {
      const newParticipants = Array(participantCount).fill(null).map((_, index) => ({
        id: index,
        league1: participants[index]?.league1 || '',
        username1: participants[index]?.username1 || '',
        league2: participants[index]?.league2 || '',
        username2: participants[index]?.username2 || ''
      }));
      setParticipants(newParticipants);
    }
  }, [participantCount, step, tournamentMode]);

  // Fetch user info (with caching)
  const fetchUserInfo = async (userId) => {
    // Check cache first
    if (cachedUsers[userId]) {
      return cachedUsers[userId];
    }

    try {
      const response = await fetch(`https://api.sleeper.app/v1/user/${userId}`);
      if (!response.ok) {
        return { username: userId, display_name: userId };
      }
      const userData = await response.json();
      const userInfo = {
        username: userData.username || userId,
        display_name: userData.display_name || userData.username || userId
      };
      
      // Cache it
      setCachedUsers(prev => ({
        ...prev,
        [userId]: userInfo
      }));
      
      return userInfo;
    } catch (error) {
      console.error(`Error fetching user ${userId}:`, error);
      return { username: userId, display_name: userId };
    }
  };

  // Fetch league data
  const handleGetLeagueData = async () => {
    const leagueIdList = leagueIds.split('\n')
      .map(id => id.trim())
      .filter(id => id.length > 0);
    
    if (leagueIdList.length === 0) {
      alert('Please enter at least one league ID');
      return;
    }

    setLoadingLeagueData(true);
    
    try {
      const newLeagueData = {};
      
      // Fetch all leagues in parallel
      const leaguePromises = leagueIdList.map(async (leagueId) => {
        try {
          // Fetch league info
          const leagueResponse = await fetch(`https://api.sleeper.app/v1/league/${leagueId}`);
          if (!leagueResponse.ok) {
            throw new Error(`Failed to fetch league ${leagueId}`);
          }
          const leagueInfo = await leagueResponse.json();
          
          // Fetch rosters
          const rostersResponse = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/rosters`);
          if (!rostersResponse.ok) {
            throw new Error(`Failed to fetch rosters for league ${leagueId}`);
          }
          const rostersData = await rostersResponse.json();
          
          // Sort rosters by points (fpts) descending
          const sortedRosters = [...rostersData].sort((a, b) => {
            const pointsA = a.settings?.fpts || 0;
            const pointsB = b.settings?.fpts || 0;
            return pointsB - pointsA;
          });
          
          // Fetch user info for each owner
          const usersWithInfo = await Promise.all(
            sortedRosters.map(async (roster, index) => {
              const userInfo = await fetchUserInfo(roster.owner_id);
              return {
                owner_id: roster.owner_id,
                username: userInfo.username,
                display_name: userInfo.display_name,
                points: roster.settings?.fpts || 0,
                rank: index + 1
              };
            })
          );
          
          return {
            leagueId,
            data: {
              name: leagueInfo.name || `League ${leagueId}`,
              users: usersWithInfo
            }
          };
        } catch (error) {
          console.error(`Error processing league ${leagueId}:`, error);
          return {
            leagueId,
            data: {
              name: `League ${leagueId} (Error)`,
              users: []
            },
            error: error.message
          };
        }
      });
      
      const results = await Promise.all(leaguePromises);
      
      // Build leagueData object
      results.forEach(({ leagueId, data }) => {
        newLeagueData[leagueId] = data;
      });
      
      setLeagueData(newLeagueData);
      setStep(2); // Move to step 2
    } catch (error) {
      console.error('Error fetching league data:', error);
      alert('Error fetching league data. Please try again.');
    } finally {
      setLoadingLeagueData(false);
    }
  };

  const handleParticipantChange = (index, field, value) => {
    const newParticipants = [...participants];
    if (!newParticipants[index]) {
      newParticipants[index] = { id: index };
    }
    newParticipants[index][field] = value;
    
    // If league changed, clear the username for that side
    if (field === 'league1') {
      newParticipants[index].username1 = '';
    } else if (field === 'league2') {
      newParticipants[index].username2 = '';
    }
    
    setParticipants(newParticipants);
  };

  // Get users for a specific league
  const getUsersForLeague = (leagueId) => {
    if (!leagueId || !leagueData[leagueId]) {
      return [];
    }
    return leagueData[leagueId].users || [];
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Generate tournament ID from name (simple sanitization)
    const tournamentId = tournamentName.replace(/\s+/g, '').replace(/[^a-zA-Z0-9]/g, '') + Math.floor(Math.random() * 1000000);
    
    if (tournamentMode === 'h2h') {
      // Validate participants - check pairs (each pair has player1 and player2)
      const isValid = (() => {
        for (let i = 0; i < participantCount; i += 2) {
          const participant1 = participants[i] || {};
          const participant2 = participants[i + 1] || {};
          
          // Both players in a pair must have their league and username selected
          if (!participant1.league1 || !participant1.username1 || 
              !participant2.league2 || !participant2.username2) {
            return false;
          }
        }
        return true;
      })();
      
      if (!isValid) {
        alert('Please fill in all fields for all participants');
        return;
      }
      
      // Build games array - iterate in pairs
      const games = [];
      for (let i = 0; i < participantCount; i += 2) {
        const participant1 = participants[i] || {};
        const participant2 = participants[i + 1] || {};
        
        // Find owner_id for username1 and username2
        const users1 = getUsersForLeague(participant1.league1);
        const users2 = getUsersForLeague(participant2.league2);
        const user1 = users1.find(u => u.username === participant1.username1);
        const user2 = users2.find(u => u.username === participant2.username2);
        
        if (!user1 || !user2) {
          continue; // Skip this game if user data not found
        }
        
        // Get league names
        const league1Name = leagueData[participant1.league1]?.name || `League ${participant1.league1}`;
        const league2Name = leagueData[participant2.league2]?.name || `League ${participant2.league2}`;
        
        games.push({
          player1: {
            league_name: league1Name,
            leagie_position: String(user1.rank),
            league: String(participant1.league1),
            playername: user1.username,
            playerid: String(user1.owner_id)
          },
          player2: {
            league_name: league2Name,
            leagie_position: String(user2.rank),
            league: String(participant2.league2),
            playername: user2.username,
            playerid: String(user2.owner_id)
          }
        });
      }
      
      // Build payload for H2H mode
      var payload = {
        week: selectedWeek,
        name: tournamentName,
        id: tournamentId,
        type: 'h2h',
        games
      };
    } else {
      // PTS mode: validate all participants
      const isValid = participants.every(p => p.league1 && p.username1);
      
      if (!isValid) {
        alert('Please fill in all fields for all participants');
        return;
      }
      
      // Build players array
      const players = [];
      for (let i = 0; i < participantCount; i++) {
        const participant = participants[i] || {};
        
        // Find owner_id for username
        const users = getUsersForLeague(participant.league1);
        const user = users.find(u => u.username === participant.username1);
        
        if (!user) {
          continue; // Skip if user data not found
        }
        
        // Get league name
        const leagueName = leagueData[participant.league1]?.name || `League ${participant.league1}`;
        
        players.push({
          league_name: leagueName,
          leagie_position: String(user.rank),
          league: String(participant.league1),
          playername: user.username,
          playerid: String(user.owner_id)
        });
      }
      
      // Build payload for PTS mode
      var payload = {
        week: selectedWeek,
        name: tournamentName,
        id: tournamentId,
        type: 'pts',
        players
      };
    }
    
    // Ensure payload is properly defined
    if (!payload) {
      alert('Failed to create payload');
      return;
    }
    
    console.log('Tournament payload:', JSON.stringify(payload, null, 2));
    
    try {
      const response = await fetch(`${BASE_URL}/tournament`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to create tournament' }));
        throw new Error(errorData.message || 'Failed to create tournament');
      }
      
      // Navigate back to tournaments list after creation
      navigate('/tournaments');
    } catch (error) {
      console.error('Error creating tournament:', error);
      alert(`Error creating tournament: ${error.message}`);
    }
  };

  const handleCancel = () => {
    if (step === 2) {
      setStep(1);
    } else {
      navigate('/tournaments');
    }
  };

  // Render participant dropdown rows
  const renderParticipantRows = () => {
    const rows = [];
    const leagueOptions = Object.keys(leagueData).map(leagueId => ({
      value: leagueId,
      label: leagueData[leagueId].name || `League ${leagueId}`
    }));
    
    if (tournamentMode === 'h2h') {
      // H2H mode: two players per row with vs
      for (let i = 0; i < participantCount; i += 2) {
        const participant1 = participants[i] || { id: i };
        const participant2 = participants[i + 1] || { id: i + 1 };
        
        rows.push(
          <div key={i} className="tournament-participant-row">
            {/* Player 1 */}
            <select
              className="tournament-participant-select tournament-league-select"
              value={participant1.league1 || ''}
              onChange={(e) => handleParticipantChange(i, 'league1', e.target.value)}
            >
              <option value="">Select League</option>
              {leagueOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            
            <select
              className="tournament-participant-select tournament-username-select"
              value={participant1.username1 || ''}
              onChange={(e) => handleParticipantChange(i, 'username1', e.target.value)}
              disabled={!participant1.league1}
            >
              <option value="">Select User</option>
              {getUsersForLeague(participant1.league1).map(user => (
                <option key={user.owner_id} value={user.username}>
                  {user.rank}# {user.display_name || user.username}
                </option>
              ))}
            </select>
            
            <span className="tournament-vs">vs</span>
            
            {/* Player 2 */}
            <select
              className="tournament-participant-select tournament-username-select"
              value={participant2.username2 || ''}
              onChange={(e) => handleParticipantChange(i + 1, 'username2', e.target.value)}
              disabled={!participant2.league2}
            >
              <option value="">Select User</option>
              {getUsersForLeague(participant2.league2).map(user => (
                <option key={user.owner_id} value={user.username}>
                  {user.rank}# {user.display_name || user.username}
                </option>
              ))}
            </select>
            
            <select
              className="tournament-participant-select tournament-league-select"
              value={participant2.league2 || ''}
              onChange={(e) => handleParticipantChange(i + 1, 'league2', e.target.value)}
            >
              <option value="">Select League</option>
              {leagueOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        );
      }
    } else {
      // PTS mode: one player per row
      for (let i = 0; i < participantCount; i++) {
        const participant = participants[i] || { id: i };
        
        rows.push(
          <div key={i} className="tournament-participant-row tournament-pts-row">
            <select
              className="tournament-participant-select tournament-league-select"
              value={participant.league1 || ''}
              onChange={(e) => handleParticipantChange(i, 'league1', e.target.value)}
            >
              <option value="">Select League</option>
              {leagueOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            
            <select
              className="tournament-participant-select tournament-username-select"
              value={participant.username1 || ''}
              onChange={(e) => handleParticipantChange(i, 'username1', e.target.value)}
              disabled={!participant.league1}
            >
              <option value="">Select User</option>
              {getUsersForLeague(participant.league1).map(user => (
                <option key={user.owner_id} value={user.username}>
                  {user.rank}# {user.display_name || user.username}
                </option>
              ))}
            </select>
          </div>
        );
      }
    }
    
    return rows;
  };

  if (loading) {
    return (
      <div className="tournament-create-container">
        <div className="tournament-create-loading">Loading...</div>
      </div>
    );
  }

  return (
    <div className="tournament-create-container">
      <div className="tournament-create-header">
        <button
          className="tournament-back-btn"
          onClick={() => navigate('/tournaments')}
        >
          ← Back
        </button>
        <h1 className="tournament-create-title">Create Tournament</h1>
      </div>

      <form onSubmit={handleSubmit} className="tournament-create-form">
        <div className="tournament-form-section">
          <label htmlFor="tournament-name" className="tournament-form-label">
            Tournament Name
          </label>
          <input
            type="text"
            id="tournament-name"
            className="tournament-form-input"
            value={tournamentName}
            onChange={(e) => setTournamentName(e.target.value)}
            placeholder="Enter tournament name"
            required
          />
        </div>

        <div className="tournament-form-section">
          <label className="tournament-form-label">Week</label>
          <div className="tournament-week-options">
            <label className="tournament-week-option">
              <input
                type="radio"
                name="week"
                value={currentWeek}
                checked={selectedWeek === currentWeek}
                onChange={() => setSelectedWeek(currentWeek)}
              />
              <span>Current Week ({currentWeek})</span>
            </label>
            <label className="tournament-week-option">
              <input
                type="radio"
                name="week"
                value={nextWeek}
                checked={selectedWeek === nextWeek}
                onChange={() => setSelectedWeek(nextWeek)}
              />
              <span>Next Week ({nextWeek})</span>
            </label>
          </div>
        </div>

        {step === 1 ? (
          <>
            <div className="tournament-form-section">
              <label htmlFor="league-ids" className="tournament-form-label">
                Sleeper League IDs (one per line)
              </label>
              <textarea
                id="league-ids"
                className="tournament-form-textarea"
                value={leagueIds}
                onChange={(e) => setLeagueIds(e.target.value)}
                placeholder="Enter league IDs, one per line"
                rows={5}
                required
              />
            </div>

            <div className="tournament-form-actions">
              <button
                type="button"
                className="tournament-cancel-btn"
                onClick={handleCancel}
              >
                Cancel
              </button>
              <button
                type="button"
                className="tournament-submit-btn"
                onClick={handleGetLeagueData}
                disabled={loadingLeagueData}
              >
                {loadingLeagueData ? 'Loading...' : 'Get League Data'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="tournament-form-section">
              <div className="tournament-participant-controls">
                <div className="tournament-participant-count-wrapper">
                  <label htmlFor="participant-count" className="tournament-form-label">
                    Number of Participants
                  </label>
                  <select
                    id="participant-count"
                    className="tournament-form-select"
                    value={participantCount}
                    onChange={(e) => setParticipantCount(parseInt(e.target.value, 10))}
                    required
                  >
                    {participantOptions.map(option => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="tournament-mode-toggle-wrapper">
                  <label className="tournament-form-label">Tournament Type:</label>
                  <div className="tournament-mode-toggle">
                    <button
                      type="button"
                      className={`tournament-mode-btn ${tournamentMode === 'h2h' ? 'active' : ''}`}
                      onClick={() => setTournamentMode('h2h')}
                    >
                      H2H
                    </button>
                    <button
                      type="button"
                      className={`tournament-mode-btn ${tournamentMode === 'pts' ? 'active' : ''}`}
                      onClick={() => setTournamentMode('pts')}
                    >
                      PTS
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="tournament-form-section">
              <label className="tournament-form-label">
                {tournamentMode === 'h2h' ? 'Matchups' : 'Participants'}
              </label>
              <div className="tournament-participants-container">
                {tournamentMode === 'h2h' && (
                  <div className="tournament-matchup-header">
                    <span>League</span>
                    <span>Player</span>
                    <span></span>
                    <span>Player</span>
                    <span>League</span>
                  </div>
                )}
                {tournamentMode === 'pts' && (
                  <div className="tournament-matchup-header tournament-pts-header">
                    <span>League</span>
                    <span>Player</span>
                  </div>
                )}
                {renderParticipantRows()}
              </div>
            </div>

            <div className="tournament-form-actions">
              <button
                type="button"
                className="tournament-cancel-btn"
                onClick={handleCancel}
              >
                Back
              </button>
              <button
                type="submit"
                className="tournament-submit-btn"
              >
                Create Tournament
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}

export default TournamentCreate;

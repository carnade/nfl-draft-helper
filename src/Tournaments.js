import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './Tournaments.css';

// Add a mock flag
const mock = false; // Set to true for localhost, false for production

// Define the base URL based on the mock flag
const BASE_URL = mock
  ? "http://localhost:5000"
  : "https://shaggy-latashia-carnade-2ea2054a.koyeb.app";

function Tournaments() {
  const navigate = useNavigate();
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Fetch list of tournaments
  const fetchTournaments = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${BASE_URL}/tournament/list`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch tournaments');
      }
      
      const data = await response.json();
      // Map API response to component format
      // API returns: { tournaments: [{ id, name, week, participants }], count: ... }
      const mappedTournaments = (data.tournaments || []).map(tournament => ({
        id: tournament.id,
        name: tournament.name,
        week: tournament.week,
        participants_count: tournament.participants
      }));
      
      setTournaments(mappedTournaments);
    } catch (error) {
      console.error('Error fetching tournaments:', error);
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTournaments();
  }, []);

  const handleCreateTournament = () => {
    navigate('/tournaments/create');
  };

  const handleResultsClick = (tournamentId) => {
    // Navigate to tournament results page using ID
    navigate(`/tournaments/${tournamentId}/results`);
  };

  return (
    <div className="tournaments-container">
      <div className="tournaments-header">
        <h1 className="tournaments-title">Tournaments</h1>
        <button 
          className="tournaments-create-btn"
          onClick={handleCreateTournament}
        >
          Create Tournament
        </button>
      </div>

      {loading && (
        <div className="tournaments-loading">
          Loading tournaments...
        </div>
      )}

      {error && (
        <div className="tournaments-error">
          {error}
          <button className="tournaments-retry-btn" onClick={fetchTournaments}>
            Retry
          </button>
        </div>
      )}

      {!loading && !error && tournaments.length === 0 && (
        <div className="tournaments-empty">
          No tournaments found.
        </div>
      )}

      {!loading && !error && tournaments.length > 0 && (
        <div className="tournaments-table-wrapper">
          <table className="tournaments-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Week</th>
                <th>Entries</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tournaments.map((tournament) => (
                <tr key={tournament.id || tournament.name}>
                  <td>{tournament.name}</td>
                  <td>{tournament.week || 'N/A'}</td>
                  <td>{tournament.participants_count || tournament.participants || 0}</td>
                  <td>
                    <button
                      className="tournaments-results-btn"
                      onClick={() => handleResultsClick(tournament.id)}
                    >
                      Results
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default Tournaments;


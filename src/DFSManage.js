import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import LZString from 'lz-string';
import './DFSManage.css';
import { useIsPrivilegedUser, loadSleeperAuth } from './auth';

// Add a mock flag
const mock = process.env.REACT_APP_MOCK === 'true';

// Define the base URL based on the mock flag
const BASE_URL = mock
  ? "http://localhost:5000"
  : "https://shaggy-latashia-carnade-2ea2054a.koyeb.app";

// Clearing a lineup is organiser-only and the backend checks the Sleeper token,
// not just that the page rendered — so the request has to carry it.
function sleeperAuthHeaders() {
  const token = loadSleeperAuth()?.token;
  return token ? { Authorization: token } : {};
}

function DFSManage() {
  const navigate = useNavigate();
  // The button that reaches this page is already behind a privileged check, but the
  // route is reachable by URL, and this page can delete entrants. Gate the page too.
  const isPrivilegedUser = useIsPrivilegedUser();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [entryDetails, setEntryDetails] = useState({});
  const [removingEntrant, setRemovingEntrant] = useState(null);
  const [purgePointsOnRemove, setPurgePointsOnRemove] = useState(false);
  const [clearingLineup, setClearingLineup] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(new Set());
  const [expandedEntries, setExpandedEntries] = useState(new Set());
  // Per-player point overrides, keyed by week. They are global, not per
  // tournament — the picker is shown per entry only because that is where the
  // players who were actually used can be listed.
  const [overrides, setOverrides] = useState({});
  const [usedPlayers, setUsedPlayers] = useState({});
  const [overrideDraft, setOverrideDraft] = useState({});
  const [savingOverride, setSavingOverride] = useState(null);

  // Fetch list of all tinyURL entries
  const fetchEntries = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${BASE_URL}/tinyurl/list`);
      if (response.ok) {
        const data = await response.json();
        setEntries(data.entries || []);
      } else {
        setError('Failed to fetch entries list');
      }
    } catch (error) {
      console.error('Error fetching entries:', error);
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Fetch details for a specific entry
  const fetchEntryDetails = async (entryName) => {
    setLoadingDetails(prev => new Set(prev).add(entryName));
    try {
      const response = await fetch(`${BASE_URL}/tinyurl/${entryName}/details`);
      if (response.ok) {
        const data = await response.json();
        setEntryDetails(prev => ({
          ...prev,
          [entryName]: data
        }));
      } else {
        console.error(`Failed to fetch details for ${entryName}`);
      }
    } catch (error) {
      console.error(`Error fetching details for ${entryName}:`, error);
    } finally {
      setLoadingDetails(prev => {
        const next = new Set(prev);
        next.delete(entryName);
        return next;
      });
    }
  };

  // Removing an entrant serves two different situations. A guillotine elimination
  // should leave the weeks already played on the board, while someone who regrets
  // entering should leave no trace — hence the opt-in purge rather than a default.
  const removeEntrant = async (entryName, username) => {
    const suffix = purgePointsOnRemove
      ? 'Their accumulated points will also be deleted.'
      : 'Points from weeks already played will be kept.';
    if (!window.confirm(`Remove ${username} from ${entryName}?\n\n${suffix}`)) {
      return;
    }

    setRemovingEntrant(`${entryName}:${username}`);
    try {
      const query = purgePointsOnRemove ? '?purge_standings=true' : '';
      const response = await fetch(
        `${BASE_URL}/tinyurl/${encodeURIComponent(entryName)}/entrants/${encodeURIComponent(username)}${query}`,
        { method: 'DELETE' }
      );
      if (response.ok) {
        await fetchEntryDetails(entryName);
      } else {
        const error = await response.json().catch(() => ({}));
        window.alert(`Could not remove ${username}: ${error.error || response.statusText}`);
      }
    } catch (error) {
      window.alert(`Could not remove ${username}: ${error.message}`);
    } finally {
      setRemovingEntrant(null);
    }
  };

  // Clearing exists for the lineup its owner can no longer fix: once one of its
  // players has kicked off, submitting over it is refused. This wipes only the
  // current week's lineup — they stay an entrant and keep points from earlier
  // weeks — so they can enter a fresh one.
  const clearLineup = async (entryName, username) => {
    if (!window.confirm(
      `Clear ${username}'s lineup in ${entryName}?\n\n` +
      'Only this week\'s lineup goes. They stay in the tournament and keep points ' +
      'from earlier weeks, but the week scores as nothing until they submit again — ' +
      'which they can do even if games have already started.'
    )) {
      return;
    }

    setClearingLineup(`${entryName}:${username}`);
    try {
      const response = await fetch(
        `${BASE_URL}/tinyurl/${encodeURIComponent(entryName)}/entrants/${encodeURIComponent(username)}/lineup`,
        { method: 'DELETE', headers: sleeperAuthHeaders() }
      );
      if (response.ok) {
        await fetchEntryDetails(entryName);
      } else {
        const error = await response.json().catch(() => ({}));
        window.alert(`Could not clear ${username}'s lineup: ${error.error || response.statusText}`);
      }
    } catch (error) {
      window.alert(`Could not clear ${username}'s lineup: ${error.message}`);
    } finally {
      setClearingLineup(null);
    }
  };

  // The players who appear in this tournament's submitted lineups, with names.
  // Decoded the same way copyLeagueData does: "week|LZString(username:id-salary,…)".
  const loadOverrideContext = useCallback(async (entryName, week) => {
    if (!week) return;
    try {
      const [dataRes, overrideRes, salaryRes] = await Promise.all([
        fetch(`${BASE_URL}/tinyurl/${entryName}/data?action=results`).then((r) => (r.ok ? r.json() : {})),
        fetch(`${BASE_URL}/points-overrides/week/${week}`).then((r) => (r.ok ? r.json() : { overrides: {} })),
        fetch(`${BASE_URL}/dfs-salaries/week/${week}`).then((r) => (r.ok ? r.json() : {})),
      ]);

      const ids = new Set();
      Object.values(dataRes.user_submissions || {}).forEach((submission) => {
        if (!submission?.data) return;
        try {
          const [, compressed] = String(submission.data).split('|');
          const decompressed = LZString.decompressFromEncodedURIComponent(compressed);
          if (!decompressed) return;
          const colonIndex = decompressed.indexOf(':');
          const body = colonIndex === -1 ? decompressed : decompressed.substring(colonIndex + 1);
          body.split(',').forEach((pair) => {
            const [id] = pair.split('-');
            if (id) ids.add(id.trim());
          });
        } catch {
          // A lineup we cannot decode simply contributes no players.
        }
      });

      const named = [...ids].map((id) => {
        const row = salaryRes[`${id}_W${week}`];
        return { id, name: row?.name || id, position: row?.position || '', team: row?.team || '' };
      }).sort((a, b) => a.name.localeCompare(b.name));

      setUsedPlayers((prev) => ({ ...prev, [entryName]: named }));
      setOverrides((prev) => ({ ...prev, [week]: overrideRes.overrides || {} }));
    } catch {
      setUsedPlayers((prev) => ({ ...prev, [entryName]: [] }));
    }
  }, []);

  const saveOverride = async (entryName, week, sleeperId, rawValue) => {
    const points = Number(rawValue);
    if (rawValue === '' || Number.isNaN(points)) {
      window.alert('Enter a number of points.');
      return;
    }
    setSavingOverride(`${entryName}:${sleeperId}`);
    try {
      const res = await fetch(`${BASE_URL}/points-overrides`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...sleeperAuthHeaders() },
        body: JSON.stringify({ sleeper_id: sleeperId, week, points }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        window.alert(`Could not set it: ${body.error || res.statusText}`);
        return;
      }
      setOverrideDraft((prev) => ({ ...prev, [`${entryName}:${sleeperId}`]: '' }));
      await loadOverrideContext(entryName, week);
    } catch (err) {
      window.alert(`Could not set it: ${err.message}`);
    } finally {
      setSavingOverride(null);
    }
  };

  const removeOverride = async (entryName, week, sleeperId) => {
    setSavingOverride(`${entryName}:${sleeperId}`);
    try {
      const res = await fetch(`${BASE_URL}/points-overrides/${sleeperId}/${week}`, {
        method: 'DELETE',
        headers: sleeperAuthHeaders(),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        window.alert(`Could not remove it: ${body.error || res.statusText}`);
        return;
      }
      await loadOverrideContext(entryName, week);
    } catch (err) {
      window.alert(`Could not remove it: ${err.message}`);
    } finally {
      setSavingOverride(null);
    }
  };

  useEffect(() => {
    expandedEntries.forEach((entryName) => {
      const week = entryDetails[entryName]?.week;
      if (week && !usedPlayers[entryName]) loadOverrideContext(entryName, week);
    });
  }, [expandedEntries, entryDetails, usedPlayers, loadOverrideContext]);

  // Fetch details for all entries
  useEffect(() => {
    if (isPrivilegedUser) {
      fetchEntries();
    }
  }, [isPrivilegedUser]);

  useEffect(() => {
    if (entries.length > 0) {
      entries.forEach(entry => {
        fetchEntryDetails(entry.name);
      });
      // Initialize all entries as expanded
      setExpandedEntries(new Set(entries.map(entry => entry.name)));
    }
  }, [entries]);

  const toggleEntry = (entryName) => {
    setExpandedEntries(prev => {
      const next = new Set(prev);
      if (next.has(entryName)) {
        next.delete(entryName);
      } else {
        next.add(entryName);
      }
      return next;
    });
  };

  const getSubmissionSummary = (details) => {
    if (!details || !details.submissions || !details.allowed_names) {
      return { submitted: 0, total: 0 };
    }
    const total = details.allowed_names.length;
    const submitted = details.allowed_names.filter(
      username => details.submissions[username]?.has_submitted
    ).length;
    return { submitted, total };
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
    } catch (error) {
      return dateString;
    }
  };

  const formatDateWithWeekday = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      const weekday = date.toLocaleDateString('en-US', { weekday: 'short' });
      const dateTime = date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
      return `${weekday} ${dateTime}`;
    } catch (error) {
      return dateString;
    }
  };

  const copyLeagueData = async (entryName, details) => {
    try {
      if (!details || !details.allowed_names || details.allowed_names.length === 0) {
        alert('No users found in this league');
        return;
      }

      // Fetch the full data for this entry (contains user_submissions)
      // Use action=results to bypass PIN requirement when copying
      const response = await fetch(`${BASE_URL}/tinyurl/${entryName}/data?action=results`);
      if (!response.ok) {
        alert('Failed to fetch league data');
        return;
      }

      const data = await response.json();
      const userSubmissions = data.user_submissions || {};
      const allowedNames = data.allowed_names || details.allowed_names || [];

      // Process each user's submission data
      const userDataMap = new Map();
      
      Object.values(userSubmissions).forEach(submission => {
        if (submission && submission.data) {
          try {
            const username = submission.username;
            const compressedData = submission.data; // Format: "week|compressedData"
            
            // Parse the compressed data
            const [, compressed] = compressedData.split('|');
            
            // Decompress using LZString
            const decompressed = LZString.decompressFromEncodedURIComponent(compressed);
            
            if (decompressed) {
              // The decompressed data should be in format "username:decodedData"
              // Extract just the decoded data part
              const colonIndex = decompressed.indexOf(':');
              if (colonIndex !== -1) {
                const decodedData = decompressed.substring(colonIndex + 1);
                // Encode back to base64
                const encodedData = btoa(decodedData);
                userDataMap.set(username.toLowerCase(), encodedData);
              } else {
                // If no colon, the entire decompressed string is the data
                const encodedData = btoa(decompressed);
                userDataMap.set(username.toLowerCase(), encodedData);
              }
            }
          } catch (error) {
            console.error(`Error processing data for ${submission.username}:`, error);
            // Continue with other users even if one fails
          }
        }
      });

      // Build the output: iterate through allowed_names in order
      const lines = allowedNames.map(username => {
        // Try both original case and lowercase for matching
        const encodedData = userDataMap.get(username.toLowerCase()) || userDataMap.get(username);
        if (encodedData) {
          return `${username}:${encodedData}`;
        } else {
          return `${username}:`;
        }
      });

      navigator.clipboard.writeText(lines.join('\n'));
      alert('League data copied to clipboard!');
    } catch (error) {
      console.error('Error copying league data:', error);
      alert('Failed to copy league data');
    }
  };

  if (!isPrivilegedUser) {
    return (
      <div className="dfs-manage-container">
        <h1 className="dfs-manage-title">DFS TinyURL Management</h1>
        <div className="dfs-manage-error">
          This page is only available when signed in with an authorised Sleeper
          account. Connect yours from Settings.
        </div>
        <button onClick={() => navigate('/settings')} className="dfs-manage-retry-btn">
          Go to Settings
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="dfs-manage-container">
        <div className="dfs-manage-loading">Loading entries...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dfs-manage-container">
        <div className="dfs-manage-error">{error}</div>
        <button onClick={fetchEntries} className="dfs-manage-retry-btn">Retry</button>
      </div>
    );
  }

  return (
    <div className="dfs-manage-container">
      <h1 className="dfs-manage-title">DFS TinyURL Management</h1>
      
      {entries.length === 0 ? (
        <div className="dfs-manage-empty">No entries found</div>
      ) : (
        <div className="dfs-manage-entries">
          {entries.map((entry) => {
            const details = entryDetails[entry.name];
            const isLoading = loadingDetails.has(entry.name);
            const isExpanded = expandedEntries.has(entry.name);
            const summary = getSubmissionSummary(details);
            
            return (
              <div key={entry.name} className="dfs-manage-entry">
                <div 
                  className="dfs-manage-entry-header"
                  onClick={() => toggleEntry(entry.name)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="dfs-manage-entry-header-left">
                    <h2 className="dfs-manage-entry-name">{entry.name}</h2>
                    {details && summary.total > 0 && (
                      <span className="dfs-manage-entry-summary">
                        {summary.submitted} of {summary.total} lineups added
                      </span>
                    )}
                  </div>
                  <div className="dfs-manage-entry-meta">
                    <span className="dfs-manage-entry-date">
                      Created: {formatDate(entry.created_at)}
                    </span>
                    <div className="dfs-manage-entry-buttons">
                      <button 
                        className="dfs-manage-results-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/dfs/results/tinyurl/${entry.name}?admin=true`);
                        }}
                        aria-label="View results"
                        title="View results page"
                      >
                        <svg 
                          width="16" 
                          height="16" 
                          viewBox="0 0 24 24" 
                          fill="none" 
                          stroke="currentColor" 
                          strokeWidth="2"
                        >
                          <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>
                          <polyline points="10 17 15 12 10 7"></polyline>
                          <line x1="15" y1="12" x2="3" y2="12"></line>
                        </svg>
                        <span className="dfs-manage-results-btn-text">Results</span>
                      </button>
                      {details && (
                        <button 
                          className="dfs-manage-copy-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            copyLeagueData(entry.name, details);
                          }}
                          aria-label="Copy league data"
                          title="Copy league data to clipboard"
                        >
                          <svg 
                            width="16" 
                            height="16" 
                            viewBox="0 0 24 24" 
                            fill="none" 
                            stroke="currentColor" 
                            strokeWidth="2"
                          >
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                          </svg>
                        </button>
                      )}
                      <button 
                        className={`dfs-manage-toggle-btn ${isExpanded ? 'expanded' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleEntry(entry.name);
                        }}
                        aria-label={isExpanded ? 'Collapse' : 'Expand'}
                      >
                        <svg 
                          width="16" 
                          height="16" 
                          viewBox="0 0 16 16" 
                          fill="none" 
                          stroke="currentColor" 
                          strokeWidth="2"
                        >
                          <path d="M4 6 L8 10 L12 6" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <>
                    {isLoading ? (
                      <div className="dfs-manage-loading-details">Loading details...</div>
                    ) : details ? (
                      <div className="dfs-manage-entry-details">
                    {details.week && (
                      <div className="dfs-manage-detail-row">
                        <span className="dfs-manage-detail-label">Week:</span>
                        <span className="dfs-manage-detail-value">
                          {details.week}
                          {details.tournament_week
                            ? ` (week ${details.tournament_week} of ${details.num_weeks})`
                            : ''}
                        </span>
                      </div>
                    )}

                    {(() => {
                      // An open tournament has no allowlist in its first week: the
                      // entrants are whoever has actually submitted.
                      const entrants = details.allowed_names && details.allowed_names.length > 0
                        ? details.allowed_names
                        : Object.keys(details.submissions || {});
                      if (entrants.length === 0) return null;
                      return (
                      <div className="dfs-manage-detail-section">
                        <h3 className="dfs-manage-section-title">
                          {details.access_mode === 'sleeper' ? 'Entrants (open to Sleeper logins)' : 'Allowed Users'}
                        </h3>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px',
                                        fontSize: '0.8rem', opacity: 0.8, marginBottom: '8px' }}>
                          <input
                            type="checkbox"
                            checked={purgePointsOnRemove}
                            onChange={(e) => setPurgePointsOnRemove(e.target.checked)}
                          />
                          Also delete accumulated points when removing (leave off to eliminate
                          a player but keep their played weeks)
                        </label>
                        <div className="dfs-manage-submissions">
                          {entrants.map((username) => {
                            const submission = details.submissions?.[username];
                            const hasSubmitted = submission?.has_submitted || false;
                            const updateCount = submission?.update_count || 0;
                            
                            return (
                              <div key={username} className={`dfs-manage-submission ${hasSubmitted ? 'submitted' : 'not-submitted'}`}>
                                <div className="dfs-manage-submission-content">
                                  <div className="dfs-manage-submission-left">
                                    <span className="dfs-manage-submission-username">{username}</span>
                                    <span className={`dfs-manage-submission-status ${hasSubmitted ? 'submitted' : 'not-submitted'}`}>
                                      {hasSubmitted ? '✓ Submitted' : '○ Not Submitted'}
                                    </span>
                                  </div>
                                  {submission && (
                                    <div className="dfs-manage-submission-right">
                                      <span className="dfs-manage-submission-meta-item">
                                        Updates: <span className="dfs-manage-submission-value">{updateCount}</span>
                                      </span>
                                      {submission.created_at && (
                                        <span className="dfs-manage-submission-meta-item">
                                          Created: <span className="dfs-manage-submission-value">{formatDateWithWeekday(submission.created_at)}</span>
                                        </span>
                                      )}
                                      {submission.updated_at && (
                                        <span className="dfs-manage-submission-meta-item">
                                          Updated: <span className="dfs-manage-submission-value">{formatDateWithWeekday(submission.updated_at)}</span>
                                        </span>
                                      )}
                                    </div>
                                  )}
                                  {hasSubmitted && (
                                    <button
                                      className="dfs-manage-clear-lineup"
                                      onClick={() => clearLineup(entry.name, username)}
                                      disabled={clearingLineup === `${entry.name}:${username}`}
                                      title={`Clear ${username}'s lineup so they can submit a new one`}
                                    >
                                      {clearingLineup === `${entry.name}:${username}` ? '…' : 'Clear'}
                                    </button>
                                  )}
                                  <button
                                    className="dfs-manage-remove-entrant"
                                    onClick={() => removeEntrant(entry.name, username)}
                                    disabled={removingEntrant === `${entry.name}:${username}`}
                                    title={`Remove ${username} from this tournament`}
                                  >
                                    {removingEntrant === `${entry.name}:${username}` ? '…' : 'Remove'}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      );
                    })()}

                    {details.week && (() => {
                      const week = details.week;
                      const players = usedPlayers[entry.name] || [];
                      const set = overrides[week] || {};
                      const filter = (overrideDraft[`${entry.name}:filter`] || '').toLowerCase();
                      const shown = filter
                        ? players.filter((p) => p.name.toLowerCase().includes(filter))
                        : players.slice(0, 8);
                      return (
                        <div className="dfs-manage-detail-section">
                          <h3 className="dfs-manage-section-title">Point overrides — week {week}</h3>
                          <p className="dfs-manage-override-note">
                            A player nobody rosters in the scoring leagues counts as zero. Setting a
                            figure here counts instead, everywhere — every tournament and the results
                            page. It must be set before the week is scored on Wednesday.
                          </p>

                          {Object.keys(set).length > 0 && (
                            <div className="dfs-manage-override-current">
                              {Object.entries(set).map(([id, pts]) => {
                                const known = players.find((p) => p.id === id);
                                return (
                                  <div key={id} className="dfs-manage-override-row">
                                    <span>{known ? known.name : id} — <strong>{pts}</strong></span>
                                    <button
                                      type="button"
                                      className="dfs-manage-clear-lineup"
                                      onClick={() => removeOverride(entry.name, week, id)}
                                      disabled={savingOverride === `${entry.name}:${id}`}
                                    >
                                      Remove
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          <input
                            type="text"
                            className="dfs-manage-override-input"
                            placeholder="Search a player in these lineups…"
                            value={overrideDraft[`${entry.name}:filter`] || ''}
                            onChange={(e) => setOverrideDraft((prev) => ({
                              ...prev, [`${entry.name}:filter`]: e.target.value,
                            }))}
                          />

                          {players.length === 0 ? (
                            <p className="dfs-manage-override-note">No lineups submitted yet.</p>
                          ) : (
                            <div className="dfs-manage-override-list">
                              {shown.map((p) => (
                                <div key={p.id} className="dfs-manage-override-row">
                                  <span>
                                    {p.name}
                                    {p.position && <span className="dfs-manage-override-pos"> {p.position}</span>}
                                    {p.team && <span className="dfs-manage-override-pos"> {p.team}</span>}
                                  </span>
                                  <span className="dfs-manage-override-set">
                                    <input
                                      type="number"
                                      step="0.1"
                                      className="dfs-manage-override-points"
                                      placeholder="pts"
                                      value={overrideDraft[`${entry.name}:${p.id}`] || ''}
                                      onChange={(e) => setOverrideDraft((prev) => ({
                                        ...prev, [`${entry.name}:${p.id}`]: e.target.value,
                                      }))}
                                    />
                                    <button
                                      type="button"
                                      className="dfs-manage-clear-lineup"
                                      onClick={() => saveOverride(
                                        entry.name, week, p.id,
                                        overrideDraft[`${entry.name}:${p.id}`] ?? ''
                                      )}
                                      disabled={savingOverride === `${entry.name}:${p.id}`}
                                    >
                                      {savingOverride === `${entry.name}:${p.id}` ? '…' : 'Set'}
                                    </button>
                                  </span>
                                </div>
                              ))}
                              {!filter && players.length > shown.length && (
                                <p className="dfs-manage-override-note">
                                  {players.length - shown.length} more — search to narrow.
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {details.updated_at && (
                      <div className="dfs-manage-detail-row">
                        <span className="dfs-manage-detail-label">Last Updated:</span>
                        <span className="dfs-manage-detail-value">
                          {formatDate(details.updated_at)}
                          {details.updated_by && ` by ${details.updated_by}`}
                        </span>
                      </div>
                    )}
                      </div>
                    ) : (
                      <div className="dfs-manage-error-details">Failed to load details</div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default DFSManage;


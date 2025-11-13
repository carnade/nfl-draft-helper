import React, { useState, useEffect } from 'react';
import LZString from 'lz-string';
import './DFSManage.css';

// Add a mock flag
const mock = false; // Set to true for mock data, false for production

// Define the base URL based on the mock flag
const BASE_URL = mock
  ? "http://localhost:5000"
  : "https://shaggy-latashia-carnade-2ea2054a.koyeb.app";

function DFSManage() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [entryDetails, setEntryDetails] = useState({});
  const [loadingDetails, setLoadingDetails] = useState(new Set());
  const [expandedEntries, setExpandedEntries] = useState(new Set());

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

  // Fetch details for all entries
  useEffect(() => {
    fetchEntries();
  }, []);

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
      const response = await fetch(`${BASE_URL}/tinyurl/${entryName}/data`);
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
                        <span className="dfs-manage-detail-value">{details.week}</span>
                      </div>
                    )}

                    {details.allowed_names && details.allowed_names.length > 0 && (
                      <div className="dfs-manage-detail-section">
                        <h3 className="dfs-manage-section-title">Allowed Users</h3>
                        <div className="dfs-manage-submissions">
                          {details.allowed_names.map((username) => {
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
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

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


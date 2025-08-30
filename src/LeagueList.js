import React, { useEffect, useState, useCallback } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faUserInjured,
  faQuestion,
  faExternalLinkAlt,
  faTableCells,
} from "@fortawesome/free-solid-svg-icons";
import { useParams } from "react-router-dom";
import DraftModal from "./DraftModal";
import "./LeagueList.css";

// Add a mock flag
const mock = false; // Set to true for mock data, false for production

// Define the base URL based on the mock flag
const BASE_URL = mock
  ? "http://localhost:5000"
  : "https://shaggy-latashia-carnade-2ea2054a.koyeb.app";

function LeagueList() {
  const { userName } = useParams();
  const [userId, setUserId] = useState(null);
  const [leagues, setLeagues] = useState([]);
  const [injuryReport, setInjuryReport] = useState({});
  const [portfolioData, setPortfolioData] = useState([]); // State for portfolio data
  const [activeTab, setActiveTab] = useState("Injuries"); // State for active tab
  const [expandedLeagueIds, setExpandedLeagueIds] = useState(new Set());
  const [playerData, setPlayerData] = useState({});
  const [expandedTeams, setExpandedTeams] = useState(new Set());
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [highlightedLeagues, setHighlightedLeagues] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  // Player fuzzy search state
  const [playerFilteredList, setPlayerFilteredList] = useState([]);
  const [showPlayerDropdown, setShowPlayerDropdown] = useState(false);
  const [playerSelectedIndex, setPlayerSelectedIndex] = useState(-1);
  // Owner username fuzzy search state (similar to BestballList opponent search)
  const [ownerInput, setOwnerInput] = useState("");
  const [ownerFilteredUsernames, setOwnerFilteredUsernames] = useState([]);
  const [showOwnerDropdown, setShowOwnerDropdown] = useState(false);
  const [ownerSelectedIndex, setOwnerSelectedIndex] = useState(-1);
  const [usernameMap, setUsernameMap] = useState({});
  const [isLoadingUsernames, setIsLoadingUsernames] = useState(false);
  const [showAllInjuries, setShowAllInjuries] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState(null); // Filter by position
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedLeague, setSelectedLeague] = useState(null);

  let searchTimeout;

  const handleToggle = (leagueId) => {
    setExpandedLeagueIds((prevIds) => {
      const newIds = new Set(prevIds);
      if (newIds.has(leagueId)) {
        newIds.delete(leagueId);
      } else {
        newIds.add(leagueId);
      }
      return newIds;
    });
  };

  const handleTeamToggle = (teamAbbreviation) => {
    setExpandedTeams((prevIds) => {
      const newIds = new Set(prevIds);
      if (newIds.has(teamAbbreviation)) {
        newIds.delete(teamAbbreviation);
      } else {
        newIds.add(teamAbbreviation);
      }
      return newIds;
    });
  };

  const handlePlayerClick = (player) => {
    const playerId = `${player.first_name}-${player.last_name}`;

    if (selectedPlayer === playerId) {
      setSelectedPlayer(null);
      setHighlightedLeagues(new Set());
    } else {
      // Clear any owner selection/inputs when selecting a player
      setOwnerInput("");
      setSearchQuery("");
      setOwnerFilteredUsernames([]);
      setShowOwnerDropdown(false);
      setOwnerSelectedIndex(-1);

      setSelectedPlayer(playerId);
      highlightLeaguesWithPlayer(player.first_name, player.last_name);
    }
  };

  const handlePlayerDoubleClick = (player) => {
    const fullName = `${player.first_name} ${player.last_name}`;
    navigator.clipboard.writeText(fullName).then(
      () => {
        console.log(`Copied ${fullName} to clipboard`);
      },
      (err) => {
        console.error("Failed to copy to clipboard: ", err);
      }
    );
  };

  const highlightLeaguesWithPlayer = (firstName, lastName) => {
    console.log(`Highlighting leagues with player ${firstName} ${lastName}`);
    const highlightedLeaguesSet = new Set();
    leagues.forEach((league) => {
      Object.keys(playerData[league.league_id]?.players || {}).forEach((p) => {
        const leaguePlayer = playerData[league.league_id]?.players[p];
        if (
          leaguePlayer?.first_name === firstName &&
          leaguePlayer?.last_name === lastName
        ) {
          highlightedLeaguesSet.add(league.league_id);
        }
      });
    });
    setHighlightedLeagues(highlightedLeaguesSet);
  };

  const handleSearchInputChange = (e) => {
    const query = e.target.value; // Allow spaces in the query
    setSearchQuery(query);

    // Update dropdown suggestions based on player's teams
    if (query.trim()) {
      const filtered = filterPlayers(query);
      setPlayerFilteredList(filtered);
      setShowPlayerDropdown(filtered.length > 0);
      setPlayerSelectedIndex(-1);
    } else {
      setShowPlayerDropdown(false);
      setPlayerFilteredList([]);
    }

    clearTimeout(window.searchTimeout);

    if (query.trim().length < 3) {
      setSelectedPlayer(null);
      setHighlightedLeagues(new Set());
    } else {
      if (searchTimeout) {
        clearTimeout(searchTimeout); // Clear the previous timeout
      }
      window.searchTimeout = setTimeout(() => searchPlayer(query.trim()), 1000); // Delay search for 1 second
    }
  };

  // Collect all player display names from the user's teams (playerData)
  const collectPlayerNames = () => {
    const names = new Set();
    Object.values(playerData).forEach((leagueData) => {
      if (!leagueData || !leagueData.players) return;
      Object.values(leagueData.players).forEach((p) => {
        if (p && p.first_name && p.last_name) {
          names.add(`${p.first_name} ${p.last_name}`);
        }
      });
    });
    return Array.from(names).sort();
  };

  const filterPlayers = (input) => {
    if (!input.trim()) return [];
    const all = collectPlayerNames();
    const q = input.toLowerCase();
    // fuzzy-ish: include if full name includes the query or any part starts with query
    const filtered = all.filter((name) => {
      const lower = name.toLowerCase();
      if (lower.includes(q)) return true;
      const parts = q.split(" ").filter(Boolean);
      return parts.every(
        (part) =>
          parts.length && lower.split(" ").some((pn) => pn.startsWith(part))
      );
    });
    return filtered.slice(0, 12);
  };

  const handlePlayerKeydown = (e) => {
    if (!showPlayerDropdown) return;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setPlayerSelectedIndex((prev) =>
          prev < playerFilteredList.length - 1 ? prev + 1 : prev
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setPlayerSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
        break;
      case "Enter":
        e.preventDefault();
        if (
          playerSelectedIndex >= 0 &&
          playerFilteredList[playerSelectedIndex]
        ) {
          const name = playerFilteredList[playerSelectedIndex];
          handlePlayerSelect(name);
        }
        break;
      case "Escape":
        setShowPlayerDropdown(false);
        break;
    }
  };

  const handlePlayerSelect = (name) => {
    // Clear owner selection when picking a player from suggestions
    setOwnerInput("");
    setOwnerFilteredUsernames([]);
    setShowOwnerDropdown(false);
    setOwnerSelectedIndex(-1);

    setSearchQuery(name);
    setShowPlayerDropdown(false);
    setPlayerSelectedIndex(-1);
    // Run the existing search directly (immediate)
    searchPlayer(name);
  };

  // --- Username caching / fuzzy search helpers ---
  const getUsernameFromId = async (userId) => {
    const userMapKey = "sleeperUserMap";
    let userMap = JSON.parse(localStorage.getItem(userMapKey) || "{}");

    if (userMap[userId]) return userMap[userId];

    try {
      const response = await fetch(`https://api.sleeper.app/v1/user/${userId}`);
      if (response.ok) {
        const userData = await response.json();
        const username =
          userData.username || userData.display_name || `User_${userId}`;
        userMap[userId] = username;
        localStorage.setItem(userMapKey, JSON.stringify(userMap));
        return username;
      }
    } catch (error) {
      console.error(`Error fetching username for user ${userId}:`, error);
    }

    const fallback = `User_${userId}`;
    userMap[userId] = fallback;
    localStorage.setItem(userMapKey, JSON.stringify(userMap));
    return fallback;
  };

  const getAllUsernames = async (userIds) => {
    const userMapKey = "sleeperUserMap";
    let userMap = JSON.parse(localStorage.getItem(userMapKey) || "{}");

    const uniqueUserIds = [...new Set(userIds.filter((id) => id))];

    const uncached = uniqueUserIds.filter((id) => !userMap[id]);
    if (uncached.length === 0) {
      setUsernameMap(userMap);
      return userMap;
    }

    setIsLoadingUsernames(true);
    const fetched = await Promise.all(
      uncached.map((id) => getUsernameFromId(id))
    );
    uncached.forEach((id, i) => {
      userMap[id] = fetched[i];
    });
    setIsLoadingUsernames(false);
    localStorage.setItem(userMapKey, JSON.stringify(userMap));
    setUsernameMap(userMap);
    return userMap;
  };

  const loadLocalUsernames = () => {
    const userMapKey = "sleeperUserMap";
    const stored = JSON.parse(localStorage.getItem(userMapKey) || "{}");
    setUsernameMap(stored);
  };

  // Filter usernames (prefix match) for dropdown suggestions
  const filterUsernames = (input) => {
    if (!input.trim()) return [];
    const usernames = Object.values(usernameMap);
    return usernames
      .filter((username) =>
        username.toLowerCase().startsWith(input.toLowerCase())
      )
      .slice(0, 10);
  };

  // When the owner input is focused and we have few cached usernames, try to fetch owner ids from leagues' rosters
  const fetchOwnerIdsFromLeagues = async () => {
    try {
      const ownerIds = [];
      for (const league of leagues) {
        try {
          const resp = await fetch(
            `https://api.sleeper.app/v1/league/${league.league_id}/rosters`
          );
          if (!resp.ok) continue;
          const rosters = await resp.json();
          rosters.forEach((r) => {
            if (r.owner_id) ownerIds.push(r.owner_id);
          });
        } catch (e) {
          // ignore and continue
        }
      }
      await getAllUsernames(ownerIds);
    } catch (e) {
      console.error("Error fetching owner ids from leagues:", e);
    }
  };

  // Handlers for owner (username) input
  const handleOwnerInputChange = (e) => {
    const v = e.target.value;
    setOwnerInput(v);
    if (v.trim()) {
      const filtered = filterUsernames(v);
      setOwnerFilteredUsernames(filtered);
      setShowOwnerDropdown(filtered.length > 0);
      setOwnerSelectedIndex(-1);
    } else {
      setShowOwnerDropdown(false);
      setOwnerFilteredUsernames([]);
    }
  };

  const handleOwnerKeydown = (e) => {
    if (!showOwnerDropdown) return;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setOwnerSelectedIndex((prev) =>
          prev < ownerFilteredUsernames.length - 1 ? prev + 1 : prev
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setOwnerSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
        break;
      case "Enter":
        e.preventDefault();
        if (
          ownerSelectedIndex >= 0 &&
          ownerFilteredUsernames[ownerSelectedIndex]
        ) {
          const username = ownerFilteredUsernames[ownerSelectedIndex];
          setOwnerInput(username);
          setShowOwnerDropdown(false);
          setOwnerSelectedIndex(-1);
          // TODO: you may want to act on selection (e.g., highlight leagues)
        }
        break;
      case "Escape":
        setShowOwnerDropdown(false);
        break;
    }
  };

  const handleOwnerSelect = (username) => {
    setOwnerInput(username);
    setShowOwnerDropdown(false);
    setOwnerSelectedIndex(-1);
    // Highlight leagues where this owner appears
    (async () => {
      try {
        // Clear any player selection/inputs when selecting an owner
        setSelectedPlayer(null);
        setSearchQuery("");
        setShowPlayerDropdown(false);
        setPlayerFilteredList([]);
        setPlayerSelectedIndex(-1);

        const ownerId = await resolveUsernameToId(username);
        if (!ownerId) {
          setHighlightedLeagues(new Set());
          return;
        }

        const highlighted = new Set();
        // For each league, fetch rosters and check for ownerId
        await Promise.all(
          leagues.map(async (league) => {
            try {
              const resp = await fetch(
                `https://api.sleeper.app/v1/league/${league.league_id}/rosters`
              );
              if (!resp.ok) return;
              const rosters = await resp.json();
              const hasOwner = rosters.some((r) => r.owner_id === ownerId);
              if (hasOwner) highlighted.add(league.league_id);
            } catch (e) {
              // ignore per-league errors
            }
          })
        );

        // ensure we set a fresh Set instance so React re-renders
        const highlightedSet = new Set(highlighted);
        console.log(
          "Owner select:",
          username,
          ownerId,
          "highlighted count:",
          highlightedSet.size
        );
        setHighlightedLeagues(highlightedSet);
      } catch (e) {
        console.error("Error highlighting owner leagues:", e);
        setHighlightedLeagues(new Set());
      }
    })();
  };

  // Resolve a username to a sleeper user_id using cached map or API
  const resolveUsernameToId = async (username) => {
    if (!username) return null;
    const lower = username.toLowerCase();
    for (const [id, name] of Object.entries(usernameMap || {})) {
      if (name && name.toLowerCase() === lower) return id;
    }
    // check localStorage
    const userMapKey = "sleeperUserMap";
    const stored = JSON.parse(localStorage.getItem(userMapKey) || "{}");
    for (const [id, name] of Object.entries(stored)) {
      if (name && name.toLowerCase() === lower) return id;
    }

    try {
      const resp = await fetch(`https://api.sleeper.app/v1/user/${username}`);
      if (resp.ok) {
        const data = await resp.json();
        const id = data.user_id;
        const combined = {
          ...(stored || {}),
          [id]: data.username || data.display_name,
        };
        localStorage.setItem(userMapKey, JSON.stringify(combined));
        setUsernameMap(combined);
        return id;
      }
    } catch (e) {
      console.error("Error resolving username to id:", e);
    }

    return null;
  };

  useEffect(() => {
    loadLocalUsernames();
  }, []);

  const searchPlayer = (query) => {
    const searchTerms = query.toLowerCase().split(" ").filter(Boolean);
    const highlightedLeaguesSet = new Set();
    let foundPlayerId = null;

    leagues.forEach((league) => {
      Object.keys(playerData[league.league_id]?.players || {}).forEach(
        (playerId) => {
          const player = playerData[league.league_id]?.players[playerId];
          const playerName =
            `${player.first_name} ${player.last_name}`.toLowerCase();

          const matches = searchTerms.every((term) =>
            playerName.includes(term)
          );

          if (matches) {
            highlightedLeaguesSet.add(league.league_id);
            foundPlayerId = `${player.first_name}-${player.last_name}`; // Construct playerId properly with names
          }
        }
      );
    });

    if (foundPlayerId) {
      setHighlightedLeagues(highlightedLeaguesSet);
      setSelectedPlayer(foundPlayerId);
    } else {
      // If no player matches, clear highlights
      setSelectedPlayer(null);
      setHighlightedLeagues(new Set());
    }
  };

  const fetchPlayerData = useCallback(
    async (leagues) => {
      const requests = {
        username: userName,
        league: leagues.map((league) => {
          const leagueId = league.league_id;
          const playerlist = [
            ...league.userRoster.starters,
            ...league.userRoster.reserve,
            ...league.userRoster.taxi,
            ...league.userRoster.uniquePlayers,
          ];
          return {
            league_id: leagueId,
            playerlist,
          };
        }),
      };

      try {
        const response = await fetch(`${BASE_URL}/getplayers`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requests),
        });

        const data = await response.json();
        const playerDataMap = {};
        data.forEach((leagueData) => {
          playerDataMap[leagueData.league_id] = leagueData;
        });
        setPlayerData(playerDataMap);

        const playerCountMap = {};

        // Count players across leagues, excluding playerId === 0
        leagues.forEach((league) => {
          const players = [
            ...league.userRoster.starters,
            ...league.userRoster.reserve,
            ...league.userRoster.taxi,
            ...league.userRoster.uniquePlayers,
          ];

          players.forEach((playerId) => {
            if (playerId && playerId !== "0") {
              // Ensure playerId is valid and not 0
              if (!playerCountMap[playerId]) {
                playerCountMap[playerId] = 0;
              }
              playerCountMap[playerId]++;
            }
          });
        });
        console.log("Player Count Map: ", playerCountMap);
        // Map player data to portfolio format
        const portfolio = Object.keys(playerCountMap).map((playerId) => {
          let player = null;

          // Convert playerId to a string for comparison
          const playerIdStr = String(playerId);

          // Iterate through each league in the data array
          for (const league of data) {
            // Iterate through league.players and include the player ID
            player = Object.entries(league.players).find(([key, value]) => {
              return key === playerIdStr;
            });

            if (player) {
              // Extract the player object and include the ID
              player = { id: player[0], ...player[1] };
              break; // Exit the loop once the player is found
            }
          }

          return {
            name: `${player?.first_name || ""} ${player?.last_name || ""}`,
            position: player?.position || "N/A",
            count: playerCountMap[playerId],
            percentage: (
              (playerCountMap[playerId] / leagues.length) *
              100
            ).toFixed(0),
          };
        });

        setPortfolioData(portfolio);
      } catch (error) {
        console.error("Error fetching player data:", error);
      }
    },
    [userName]
  );

  const fetchLeagueData = useCallback(async () => {
    try {
      const userResponse = await fetch(
        `https://api.sleeper.app/v1/user/${userName}`
      );
      const userData = await userResponse.json();
      const userId = userData.user_id;
      setUserId(userId);

      const leaguesResponse = await fetch(
        `https://api.sleeper.app/v1/user/${userId}/leagues/nfl/2025`
      );
      const leaguesData = await leaguesResponse.json();

      const filteredLeagues = leaguesData.filter(
        (league) =>
          league.settings.best_ball === 0 || league.settings.best_ball == null
      );

      const leagueDetailsPromises = filteredLeagues.map(async (league) => {
        const leagueId = league.league_id;

        const rostersResponse = await fetch(
          `https://api.sleeper.app/v1/league/${leagueId}/rosters`
        );
        const rostersData = await rostersResponse.json();

        const userRoster = rostersData.find(
          (roster) => roster.owner_id === userId
        );

        if (!userRoster) {
          return null;
        }

        const starters = userRoster.starters || [];
        const reserve = userRoster.reserve || [];
        const taxi = userRoster.taxi || [];
        const players = userRoster.players || [];

        const uniquePlayers = players.filter(
          (player) =>
            !starters.includes(player) &&
            !reserve.includes(player) &&
            !taxi.includes(player)
        );

        return {
          ...league,
          userRoster: {
            starters,
            uniquePlayers,
            reserve,
            taxi,
            settings: userRoster.settings,
          },
        };
      });

      const leagueDetails = await Promise.all(leagueDetailsPromises);
      const filteredLeagueDetails = leagueDetails.filter(
        (league) => league !== null
      );

      setLeagues(filteredLeagueDetails);
      await fetchPlayerData(filteredLeagueDetails);
    } catch (error) {
      console.error("Error fetching league data:", error);
    }
  }, [userName, fetchPlayerData]);

  const fetchInjuryReport = useCallback(async () => {
    try {
      const response = await fetch(`${BASE_URL}/teams`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const data = await response.json();
      setInjuryReport(data);
    } catch (error) {
      console.error("Error fetching injury report:", error);
    }
  }, []);

  useEffect(() => {
    fetchLeagueData();
    fetchInjuryReport();
  }, [fetchLeagueData, fetchInjuryReport]);

  const renderPlayerInfo = (playerId, leagueId) => {
    const player = playerData[leagueId]?.players[playerId];

    if (!player) return null;

    const { first_name, last_name } = player;

    return (
      <div>
        {first_name} {last_name}
      </div>
    );
  };

  const renderInjuryStatus = (playerId, leagueId) => {
    const player = playerData[leagueId]?.players[playerId];
    if (!player) return null;

    const { injury_status } = player;
    let injuryClass = "";

    if (injury_status) {
      injuryClass =
        injury_status === "Questionable" ? "injury-questionable" : "injury";
    }

    return <div className={injuryClass}>{injury_status}</div>;
  };

  const renderPlayerLinks = (player, leagueId) => {
    const yahooId = playerData[leagueId]?.players[player]?.yahoo_id;
    const rotowireId = playerData[leagueId]?.players[player]?.rotowire_id;
    const firstName = playerData[leagueId]?.players[player]?.first_name;
    const lastName = playerData[leagueId]?.players[player]?.last_name;

    return (
      <>
        <span
          style={{
            display: "inline-block",
            marginRight: "5px",
            filter: yahooId ? "none" : "grayscale(100%)",
          }}
        >
          <a
            href={
              yahooId ? `https://sports.yahoo.com/nfl/players/${yahooId}` : "#"
            }
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: yahooId ? "inline" : "none",
              pointerEvents: yahooId ? "auto" : "none",
            }}
          >
            <img
              src="/yahoo.png"
              alt="Yahoo"
              style={{ width: "20px", height: "20px" }}
            />
          </a>
          {!yahooId && (
            <img
              src="/yahoo.png"
              alt="Yahoo"
              style={{
                width: "20px",
                height: "20px",
              }}
            />
          )}
        </span>
        <span
          style={{
            display: "inline-block",
            filter: rotowireId ? "none" : "grayscale(100%)",
            pointerEvents: rotowireId ? "auto" : "none",
          }}
        >
          <a
            href={
              rotowireId
                ? `https://www.rotowire.com/football/player/${firstName}-${lastName}-${rotowireId}`
                : "#"
            }
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: rotowireId ? "inline" : "none" }}
          >
            <img
              src="/rotowire.png"
              alt="Rotowire"
              style={{ width: "20px", height: "20px", marginRight: "5px" }}
            />
          </a>
          {!rotowireId && (
            <img
              src="/rotowire.png"
              alt="Rotowire"
              style={{
                width: "20px",
                height: "20px",
              }}
            />
          )}
        </span>
      </>
    );
  };

  const sortPlayersByPosition = (playerIds, leagueId) => {
    const positionOrder = { QB: 1, RB: 2, WR: 3, TE: 4, DEF: 5 };
    return playerIds.sort((a, b) => {
      const posA = playerData[leagueId]?.players[a]?.position || "ZZZ";
      const posB = playerData[leagueId]?.players[b]?.position || "ZZZ";
      return (positionOrder[posA] || 99) - (positionOrder[posB] || 99);
    });
  };

  const countInjuriesForReport = (teamInjuries) => {
    let redCount = 0;
    let orangeCount = 0;

    teamInjuries.forEach((player) => {
      const injuryStatus = player?.injury_status;
      if (injuryStatus) {
        if (injuryStatus === "Questionable") {
          orangeCount += 1;
        } else {
          redCount += 1;
        }
      }
    });

    return { redCount, orangeCount };
  };

  const countInjuries = (starters, leagueId) => {
    let redCount = 0;
    let orangeCount = 0;

    starters.forEach((playerId) => {
      const injuryStatus =
        playerData[leagueId]?.players[playerId]?.injury_status;
      if (injuryStatus) {
        if (injuryStatus === "Questionable") {
          orangeCount += 1;
        } else {
          redCount += 1;
        }
      }
    });

    return { redCount, orangeCount };
  };

  const teamFullName = (abbreviation) => {
    const teams = {
      ARI: "Arizona Cardinals",
      ATL: "Atlanta Falcons",
      BAL: "Baltimore Ravens",
      BUF: "Buffalo Bills",
      CAR: "Carolina Panthers",
      CHI: "Chicago Bears",
      CIN: "Cincinnati Bengals",
      CLE: "Cleveland Browns",
      DAL: "Dallas Cowboys",
      DEN: "Denver Broncos",
      DET: "Detroit Lions",
      GB: "Green Bay Packers",
      HOU: "Houston Texans",
      IND: "Indianapolis Colts",
      JAX: "Jacksonville Jaguars",
      KC: "Kansas City Chiefs",
      LAC: "Los Angeles Chargers",
      LAR: "Los Angeles Rams",
      LV: "Las Vegas Raiders",
      MIA: "Miami Dolphins",
      MIN: "Minnesota Vikings",
      NE: "New England Patriots",
      NO: "New Orleans Saints",
      NYG: "New York Giants",
      NYJ: "New York Jets",
      PHI: "Philadelphia Eagles",
      PIT: "Pittsburgh Steelers",
      SEA: "Seattle Seahawks",
      SF: "San Francisco 49ers",
      TB: "Tampa Bay Buccaneers",
      TEN: "Tennessee Titans",
      WAS: "Washington Commanders",
    };
    return teams[abbreviation] || abbreviation;
  };

  const handleOpenModal = (league) => {
    setSelectedLeague(league);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedLeague(null);
  };

  return (
    <div className="dashboard-container">
      <div className="header-container">
        <div className="draftname">
          <h1>Leagues Overview</h1>
          <span>{userName}</span>
        </div>
      </div>

      <div className="search-container">
        <label className="search-label">Find a player</label>
        <div className="player-search">
          <input
            type="text"
            className="injury-report-search"
            placeholder="Player name"
            value={searchQuery}
            onChange={handleSearchInputChange}
            onKeyDown={handlePlayerKeydown}
            onFocus={() => {
              if (searchQuery.trim()) {
                const filtered = filterPlayers(searchQuery);
                setPlayerFilteredList(filtered);
                setShowPlayerDropdown(filtered.length > 0);
                setPlayerSelectedIndex(-1);
              }
            }}
          />
          {showPlayerDropdown && (
            <div className="opponent-dropdown">
              {playerFilteredList.map((name, i) => (
                <div
                  key={name}
                  className={`opponent-option ${
                    i === playerSelectedIndex ? "selected" : ""
                  }`}
                  onMouseDown={(ev) => ev.preventDefault()}
                  onClick={() => handlePlayerSelect(name)}
                >
                  {name}
                </div>
              ))}
            </div>
          )}
        </div>
        <label className="search-label">Find an owner</label>
        <div className="owner-search">
          <input
            type="text"
            placeholder="Search owner username"
            value={ownerInput}
            onChange={handleOwnerInputChange}
            onKeyDown={handleOwnerKeydown}
            onFocus={() => {
              loadLocalUsernames();
              if (Object.keys(usernameMap).length < 5) {
                fetchOwnerIdsFromLeagues();
              }
            }}
          />
          {showOwnerDropdown && (
            <div className="opponent-dropdown">
              {ownerFilteredUsernames.map((u, i) => (
                <div
                  key={u}
                  className={`opponent-option ${
                    i === ownerSelectedIndex ? "selected" : ""
                  }`}
                  onMouseDown={(ev) => ev.preventDefault()}
                  onClick={() => handleOwnerSelect(u)}
                >
                  {u}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="league-main-content">
        {/* Left Side: Leagues */}
        <div className="league-list-container">
          <div className="league-grid">
            <div className="league-grid-header">League Name</div>
            <div className="league-grid-header">Record</div>
            <div className="league-grid-header">FPTS</div>
            <div className="league-grid-header">Used Waiver Budget</div>
            <div className="league-grid-header">Injuries on starters</div>
            <div className="league-grid-header">Actions</div>

            {leagues.length > 0 ? (
              leagues.map((league, index) => {
                const { redCount, orangeCount } = countInjuries(
                  league.userRoster?.starters || [],
                  league.league_id
                );
                return (
                  <React.Fragment key={index}>
                    <div
                      className={`league-grid-item league-name ${
                        highlightedLeagues.has(league.league_id)
                          ? "league-highlighted-league"
                          : ""
                      }`}
                    >
                      <span
                        className="toggle-button"
                        onClick={() => handleToggle(league.league_id)}
                      >
                        {expandedLeagueIds.has(league.league_id) ? "▼" : "►"}{" "}
                      </span>
                      {league.name}
                    </div>

                    <div className="league-grid-item">
                      {league.userRoster?.settings?.wins}-
                      {league.userRoster?.settings?.losses}-
                      {league.userRoster?.settings?.ties}
                    </div>
                    <div className="league-grid-item">
                      {league.userRoster?.settings?.fpts}
                    </div>
                    <div className="league-grid-item">
                      {league.userRoster?.settings?.waiver_budget_used}/
                      {league.settings.waiver_budget}
                    </div>
                    <div className="league-grid-item">
                      {redCount > 0 && (
                        <>
                          <FontAwesomeIcon
                            icon={faUserInjured}
                            style={{ color: "red" }}
                          />{" "}
                          {redCount}{" "}
                        </>
                      )}
                      {orangeCount > 0 && (
                        <>
                          <FontAwesomeIcon
                            icon={faQuestion}
                            style={{ color: "orange" }}
                          />{" "}
                          {orangeCount}
                        </>
                      )}
                    </div>
                    <div className="league-grid-item league-actions">
                      {/* Link to Sleeper league */}
                      <a
                        href={`https://sleeper.app/leagues/${league.league_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="league-link-icon"
                      >
                        <FontAwesomeIcon icon={faExternalLinkAlt} />
                      </a>

                      {/* Modal action */}
                      <FontAwesomeIcon
                        icon={faTableCells}
                        className="league-action-icon"
                        onClick={() => handleOpenModal(league)}
                      />
                    </div>
                    {expandedLeagueIds.has(league.league_id) && (
                      <div className="league-details">
                        {["starters", "uniquePlayers", "reserve", "taxi"].map(
                          (group, idx) =>
                            (league.userRoster[group] || []).length > 0 && (
                              <div key={idx} className="roster-group">
                                <div className="roster-grid">
                                  <div className="roster-grid-item roster-header">
                                    {group === "uniquePlayers"
                                      ? "Bench"
                                      : group.charAt(0).toUpperCase() +
                                        group.slice(1)}
                                  </div>
                                  <div className="roster-grid-item roster-header">
                                    Position
                                  </div>
                                  <div className="roster-grid-item roster-header">
                                    KTC
                                  </div>
                                  <div className="roster-grid-item roster-header">
                                    FantasyCalc
                                  </div>
                                  <div className="roster-grid-item roster-header">
                                    Status
                                  </div>
                                  <div className="roster-grid-item roster-header">
                                    Links
                                  </div>
                                </div>
                                {sortPlayersByPosition(
                                  league.userRoster[group],
                                  league.league_id
                                )?.map((player, index) => {
                                  const playerInfo =
                                    playerData[league.league_id]?.players[
                                      player
                                    ];
                                  const playerId = `${playerInfo?.first_name}-${playerInfo?.last_name}`;

                                  const ktcValue =
                                    playerInfo?.["KTC Value"] || "N/A"; // Access "KTC Value"
                                  const ktcDelta =
                                    playerInfo?.["KTC Delta"] || 0; // Access "KTC Delta"
                                  const fcDelta = playerInfo?.["FC Delta"] || 0; // Access "FC Delta"

                                  return (
                                    <div key={index} className="roster-grid">
                                      <div
                                        className={`roster-grid-item ${
                                          selectedPlayer === playerId
                                            ? "selected-player"
                                            : ""
                                        }`}
                                      >
                                        {renderPlayerInfo(
                                          player,
                                          league.league_id
                                        )}
                                      </div>
                                      <div className="roster-grid-item">
                                        {playerInfo?.position || ""}
                                      </div>
                                      <div className="roster-grid-item">
                                        <span>{ktcValue}</span>
                                        {" ("}
                                        <span
                                          className={`${
                                            ktcDelta > 0
                                              ? "value-positive"
                                              : ktcDelta < 0
                                              ? "value-negative"
                                              : "value-neutral"
                                          }`}
                                        >
                                          {ktcDelta > 0
                                            ? `+${ktcDelta}`
                                            : ktcDelta}
                                        </span>
                                        <span>)</span>
                                      </div>
                                      <div className="roster-grid-item">
                                        <span>
                                          {playerInfo?.["FC Value"] || "N/A"}
                                        </span>
                                        {" ("}
                                        <span
                                          className={`${
                                            fcDelta > 0
                                              ? "value-positive"
                                              : fcDelta < 0
                                              ? "value-negative"
                                              : "value-neutral"
                                          }`}
                                        >
                                          {fcDelta > 0
                                            ? `+${fcDelta}`
                                            : fcDelta}
                                        </span>
                                        <span>)</span>
                                      </div>
                                      <div className="roster-grid-item">
                                        {renderInjuryStatus(
                                          player,
                                          league.league_id
                                        )}
                                      </div>
                                      <div className="roster-grid-item">
                                        {renderPlayerLinks(
                                          player,
                                          league.league_id
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )
                        )}
                      </div>
                    )}
                  </React.Fragment>
                );
              })
            ) : (
              <div className="league-grid-item">No leagues found.</div>
            )}
          </div>
        </div>

        {/* Modal */}
        {isModalOpen && (
          <DraftModal
            league={selectedLeague}
            draftId={selectedLeague?.draft_id}
            onClose={handleCloseModal}
            userId={userId}
          />
        )}

        {/* Right Side: Tabs for Injuries and Portfolio */}
        <div className="league-right-side-container">
          {/* Tab Navigation */}
          <div className="league-tab-container">
            <button
              className={`league-tab-button ${
                activeTab === "Injuries" ? "active" : ""
              }`}
              onClick={() => setActiveTab("Injuries")}
            >
              Injuries
            </button>
            <button
              className={`league-tab-button ${
                activeTab === "Portfolio" ? "active" : ""
              }`}
              onClick={() => setActiveTab("Portfolio")}
            >
              Portfolio
            </button>
          </div>

          {/* Tab Content */}
          <div className="league-tab-content">
            {activeTab === "Injuries" && (
              <div className="league-injury-report-container">
                <h2>Injury Report</h2>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={showAllInjuries}
                    onChange={() => setShowAllInjuries((prev) => !prev)}
                  />
                  <span className="slider"></span>
                </label>
                <label>Show by team</label>
                {!showAllInjuries ? (
                  <div className="all-injuries-list">
                    <div className="injury-grid-header">
                      <div className="injury-grid-column">Player Name</div>
                      <div className="injury-grid-column">Team</div>
                      <div className="injury-grid-column">Status</div>
                    </div>
                    {Object.keys(injuryReport).flatMap((teamAbbreviation) =>
                      injuryReport[teamAbbreviation].map((player, index) => (
                        <div
                          key={`${teamAbbreviation}-${index}`}
                          className={`injury-grid-row ${
                            selectedPlayer ===
                            `${player.first_name}-${player.last_name}`
                              ? "selected-player"
                              : ""
                          }`}
                          onClick={() => handlePlayerClick(player)}
                          onDoubleClick={() => handlePlayerDoubleClick(player)}
                        >
                          <div className="injury-grid-column">
                            {player.first_name} {player.last_name}
                          </div>
                          <div className="injury-grid-column">
                            {teamAbbreviation}
                          </div>
                          <div className="injury-grid-column">
                            <span
                              className={`injury-status ${player.injury_status}`}
                            >
                              {player.injury_status}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                ) : (
                  <div className="injury-report-teams">
                    {Object.keys(injuryReport).map((teamAbbreviation) => {
                      const teamInjuries = injuryReport[teamAbbreviation];
                      const { redCount, orangeCount } =
                        countInjuriesForReport(teamInjuries);

                      return (
                        <div key={teamAbbreviation} className="injury-team">
                          <span
                            className="team-name"
                            onClick={() => handleTeamToggle(teamAbbreviation)}
                          >
                            {expandedTeams.has(teamAbbreviation) ? "▼" : "►"}{" "}
                            {teamFullName(teamAbbreviation)}
                          </span>
                          <div className="team-injury-icons">
                            {redCount > 0 && (
                              <span className="injury-icon">
                                <FontAwesomeIcon
                                  icon={faUserInjured}
                                  style={{ color: "red" }}
                                />{" "}
                                {redCount}
                              </span>
                            )}
                            {orangeCount > 0 && (
                              <span className="injury-icon">
                                <FontAwesomeIcon
                                  icon={faQuestion}
                                  style={{ color: "orange" }}
                                />{" "}
                                {orangeCount}
                              </span>
                            )}
                          </div>
                          {expandedTeams.has(teamAbbreviation) && (
                            <div className="team-injury-list">
                              {teamInjuries.map((player, index) => (
                                <div
                                  key={index}
                                  className={`injury-player ${
                                    selectedPlayer ===
                                    `${player.first_name}-${player.last_name}`
                                      ? "selected-player"
                                      : ""
                                  }`}
                                  onClick={() => handlePlayerClick(player)}
                                >
                                  {player.first_name} {player.last_name}
                                  <span
                                    className={`injury-status ${player.injury_status}`}
                                  >
                                    {player.injury_status}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {activeTab === "Portfolio" && (
              <div className="league-portfolio-container">
                <h2>Portfolio</h2>

                {/* Filter Buttons */}
                <div className="filter-container">
                  <span className="filter-label">Filter:</span>
                  <div className="filter-buttons">
                    <button
                      className={`filter-button ${
                        selectedPosition === "QB" ? "qb-active" : ""
                      }`}
                      onClick={() =>
                        setSelectedPosition((prev) =>
                          prev === "QB" ? null : "QB"
                        )
                      }
                    >
                      QB
                    </button>
                    <button
                      className={`filter-button ${
                        selectedPosition === "RB" ? "rb-active" : ""
                      }`}
                      onClick={() =>
                        setSelectedPosition((prev) =>
                          prev === "RB" ? null : "RB"
                        )
                      }
                    >
                      RB
                    </button>
                    <button
                      className={`filter-button ${
                        selectedPosition === "WR" ? "wr-active" : ""
                      }`}
                      onClick={() =>
                        setSelectedPosition((prev) =>
                          prev === "WR" ? null : "WR"
                        )
                      }
                    >
                      WR
                    </button>
                    <button
                      className={`filter-button ${
                        selectedPosition === "TE" ? "te-active" : ""
                      }`}
                      onClick={() =>
                        setSelectedPosition((prev) =>
                          prev === "TE" ? null : "TE"
                        )
                      }
                    >
                      TE
                    </button>
                  </div>
                </div>

                {/* Portfolio Table */}
                <div className="league-portfolio-grid">
                  <div className="league-portfolio-grid-header">
                    Player Name
                  </div>
                  <div className="league-portfolio-grid-header align_center">
                    Position
                  </div>
                  <div className="league-portfolio-grid-header align_center">
                    Count
                  </div>

                  {portfolioData
                    .filter((player) =>
                      selectedPosition
                        ? player.position === selectedPosition
                        : true
                    )
                    .sort((a, b) => b.count - a.count)
                    .map((player, index) => {
                      const playerId = player.name.replace(" ", "-"); // Use player name as the unique identifier
                      return (
                        <React.Fragment key={index}>
                          <div
                            className={`league-portfolio-grid-item ${
                              selectedPlayer === playerId
                                ? "selected-player"
                                : ""
                            }`}
                            onClick={() =>
                              handlePlayerClick({
                                first_name: player.name.split(" ")[0],
                                last_name: player.name.split(" ")[1],
                              })
                            }
                          >
                            {player.name}
                          </div>
                          <div className="league-portfolio-grid-item align_center">
                            {player.position}
                          </div>
                          <div className="league-portfolio-grid-item align_center">
                            <span className="count">{player.count}</span>{" "}
                            <span className="percentage">
                              ({player.percentage}%)
                            </span>
                          </div>
                        </React.Fragment>
                      );
                    })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <span hidden>{userId}</span>
    </div>
  );
}

export default LeagueList;

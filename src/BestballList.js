import React, { useEffect, useState, useCallback } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faExternalLinkAlt,
  faTrophy,
  faTableCells,
} from "@fortawesome/free-solid-svg-icons";
import { useParams } from "react-router-dom";
import "./BestballList.css";
import DraftModal from "./DraftModal";

// Add a mock flag
const mock = true; // Set to true for mock data, false for production

// Define the base URL based on the mock flag
const BASE_URL = mock
  ? "http://localhost:5000"
  : "https://shaggy-latashia-carnade-2ea2054a.koyeb.app";

function BestballList() {
  const { userName } = useParams();
  const [userId, setUserId] = useState(null);
  const [leagues, setLeagues] = useState([]);
  const [expandedLeagueIds, setExpandedLeagueIds] = useState(new Set());
  const [activeTab, setActiveTab] = useState("Results");
  const [portfolioData, setPortfolioData] = useState([]);
  const [selectedPosition, setSelectedPosition] = useState(null);
  const [selectedDraft, setSelectedDraft] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [clickedOwnerId, setClickedOwnerId] = useState(null);

  // Add state for league counts
  const [oneQBDrafts, setOneQBDrafts] = useState(0);
  const [twoQBDrafts, setTwoQBDrafts] = useState(0);
  const [totalDrafts, setTotalDrafts] = useState(0);

  // Add state for sorting
  const [sortConfig, setSortConfig] = useState({
    key: "totalCount",
    direction: "descending",
  });

  const [showNon12TeamDrafts, setShowNon12TeamDrafts] = useState(false);
  const [show1QB, setShow1QB] = useState(true);
  const [show2QB, setShow2QB] = useState(true);

  // Username caching for owner display
  const [usernameMap, setUsernameMap] = useState({});
  const [isLoadingUsernames, setIsLoadingUsernames] = useState(false);

  // Add state for opponent input and dropdown
  const [opponentInput, setOpponentInput] = useState("");
  const [filteredUsernames, setFilteredUsernames] = useState([]);
  const [showOpponentDropdown, setShowOpponentDropdown] = useState(false);
  const [selectedDropdownIndex, setSelectedDropdownIndex] = useState(-1);
  const [sharedLeagueCount, setSharedLeagueCount] = useState(null);
  const [no1UserCount, setNo1UserCount] = useState(null);
  const [no1OpponentCount, setNo1OpponentCount] = useState(null);
  const [rank1qbUserAvg, setRank1qbUserAvg] = useState(null);
  const [rank1qbOpponentAvg, setRank1qbOpponentAvg] = useState(null);
  const [rank2qbUserAvg, setRank2qbUserAvg] = useState(null);
  const [rank2qbOpponentAvg, setRank2qbOpponentAvg] = useState(null);
  const [h2hUserPoints, setH2hUserPoints] = useState(null);
  const [h2hOpponentPoints, setH2hOpponentPoints] = useState(null);

  // Get username for a single user id, prefer localStorage cache
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

    // fallback
    const fallback = `User_${userId}`;
    userMap[userId] = fallback;
    localStorage.setItem(userMapKey, JSON.stringify(userMap));
    return fallback;
  };

  // Batch fetch usernames: only fetch uncached ids, update localStorage and state
  const getAllUsernames = React.useCallback(async (userIds) => {
    const userMapKey = "sleeperUserMap";
    let userMap = JSON.parse(localStorage.getItem(userMapKey) || "{}");

    const uniqueUserIds = [...new Set(userIds.filter((id) => id))];

    const cachedUserIds = [];
    const uncachedUserIds = [];
    uniqueUserIds.forEach((id) => {
      if (userMap[id]) cachedUserIds.push(id);
      else uncachedUserIds.push(id);
    });

    console.log(
      `Username caching: ${cachedUserIds.length} cached, ${uncachedUserIds.length} to fetch`
    );

    let newUsernames = {};
    if (uncachedUserIds.length > 0) {
      setIsLoadingUsernames(true);
      const usernamePromises = uncachedUserIds.map((id) =>
        getUsernameFromId(id)
      );
      const fetchedUsernames = await Promise.all(usernamePromises);
      uncachedUserIds.forEach((id, index) => {
        newUsernames[id] = fetchedUsernames[index];
      });
      setIsLoadingUsernames(false);
    }

    const combined = { ...userMap, ...newUsernames };
    // persist combined map
    localStorage.setItem(userMapKey, JSON.stringify(combined));
    setUsernameMap(combined);
    return combined;
  }, []);

  // Utility for templates
  const getUsername = (userId) => {
    if (!userId) return "Unknown";
    if (isLoadingUsernames) return "Loading...";
    const fromState = usernameMap[userId];
    if (fromState) return fromState;
    // fallback to localStorage if available
    const userMapKey = "sleeperUserMap";
    const stored = JSON.parse(localStorage.getItem(userMapKey) || "{}");
    return stored[userId] || `User_${userId}`;
  };

  // Filter usernames based on input (starts with only)
  const filterUsernames = (input) => {
    if (!input.trim()) return [];

    const usernames = Object.values(usernameMap);
    return usernames
      .filter((username) =>
        username.toLowerCase().startsWith(input.toLowerCase())
      )
      .slice(0, 10); // Limit to 10 results
  };

  // Handle opponent input change
  const handleOpponentInputChange = (e) => {
    const value = e.target.value;
    setOpponentInput(value);

    if (value.trim()) {
      const filtered = filterUsernames(value);
      setFilteredUsernames(filtered);
      setShowOpponentDropdown(filtered.length > 0);
      setSelectedDropdownIndex(-1);
    } else {
      setShowOpponentDropdown(false);
      setFilteredUsernames([]);
    }
  };

  // Handle opponent input keydown
  const handleOpponentInputKeydown = (e) => {
    if (!showOpponentDropdown) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedDropdownIndex((prev) =>
          prev < filteredUsernames.length - 1 ? prev + 1 : prev
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedDropdownIndex((prev) => (prev > 0 ? prev - 1 : -1));
        break;
      case "Enter":
        e.preventDefault();
        if (
          selectedDropdownIndex >= 0 &&
          filteredUsernames[selectedDropdownIndex]
        ) {
          setOpponentInput(filteredUsernames[selectedDropdownIndex]);
          setShowOpponentDropdown(false);
          // compute shared leagues when selecting via keyboard
          computeAndSetSharedLeagueCount(
            filteredUsernames[selectedDropdownIndex]
          ).catch((err) =>
            console.error("Error computing shared leagues:", err)
          );
        }
        break;
      case "Escape":
        setShowOpponentDropdown(false);
        break;
      default:
        // Do nothing, so normal typing/backspace works
        break;
    }
  };

  // Resolve a username to a sleeper user_id using cached map or API
  const resolveUsernameToId = async (username) => {
    if (!username) return null;
    // build reverse map from usernameMap
    const lower = username.toLowerCase();
    for (const [id, name] of Object.entries(usernameMap)) {
      if (name && name.toLowerCase() === lower) return id;
    }

    // check localStorage backup
    const userMapKey = "sleeperUserMap";
    const stored = JSON.parse(localStorage.getItem(userMapKey) || "{}");
    for (const [id, name] of Object.entries(stored)) {
      if (name && name.toLowerCase() === lower) return id;
    }

    // fallback: call sleeper API to resolve username
    try {
      const resp = await fetch(`https://api.sleeper.app/v1/user/${username}`);
      if (resp.ok) {
        const data = await resp.json();
        const id = data.user_id;
        // save into cache
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

  const computeAndSetSharedLeagueCount = async (username) => {
    // wrapper to maintain backward compatibility — use computeHeadToHeadStats
    const results = await computeHeadToHeadStats(username);
    return results ? results.sharedCount : null;
  };

  // Compute all head-to-head stats for the given opponent username using current filteredLeagues
  const computeHeadToHeadStats = async (username) => {
    // reset when missing
    if (!username || !userId) {
      setSharedLeagueCount(null);
      setNo1UserCount(null);
      setNo1OpponentCount(null);
      setRank1qbUserAvg(null);
      setRank1qbOpponentAvg(null);
      setRank2qbUserAvg(null);
      setRank2qbOpponentAvg(null);
      setH2hUserPoints(null);
      setH2hOpponentPoints(null);
      return null;
    }

    const opponentId = await resolveUsernameToId(username);
    if (!opponentId) {
      // opponent not found — set zeros where appropriate
      setSharedLeagueCount(0);
      setNo1UserCount(0);
      setNo1OpponentCount(0);
      setRank1qbUserAvg(null);
      setRank1qbOpponentAvg(null);
      setRank2qbUserAvg(null);
      setRank2qbOpponentAvg(null);
      setH2hUserPoints(0);
      setH2hOpponentPoints(0);
      return {
        sharedCount: 0,
      };
    }

    let sharedCount = 0;
    let no1User = 0;
    let no1Opp = 0;
    const rank1qbUser = [];
    const rank1qbOpp = [];
    const rank2qbUser = [];
    const rank2qbOpp = [];
    let h2hUser = 0;
    let h2hOpp = 0;

    // Use filtered leagues (respecting filters)
    const fl = filteredLeagues;

    fl.forEach((league) => {
      const owners = new Set((league.teams || []).map((t) => t.owner_id));
      if (!(owners.has(opponentId) && owners.has(userId))) return;
      sharedCount += 1;

      const userTeam = (league.teams || []).find((t) => t.owner_id === userId);
      const oppTeam = (league.teams || []).find(
        (t) => t.owner_id === opponentId
      );
      const userPos = userTeam ? userTeam.position : null;
      const oppPos = oppTeam ? oppTeam.position : null;

      if (userPos === 1) no1User += 1;
      if (oppPos === 1) no1Opp += 1;

      const is2QB = league.roster_positions.includes("SUPER_FLEX");
      if (is2QB) {
        if (userPos) rank2qbUser.push(userPos);
        if (oppPos) rank2qbOpp.push(oppPos);
      } else {
        if (userPos) rank1qbUser.push(userPos);
        if (oppPos) rank1qbOpp.push(oppPos);
      }

      if (userPos && oppPos) {
        if (userPos < oppPos) h2hUser += 1;
        else if (oppPos < userPos) h2hOpp += 1;
      }
    });

    const avg = (arr) =>
      arr.length
        ? (arr.reduce((s, v) => s + v, 0) / arr.length).toFixed(2)
        : null;

    setSharedLeagueCount(sharedCount);
    setNo1UserCount(no1User);
    setNo1OpponentCount(no1Opp);
    setRank1qbUserAvg(avg(rank1qbUser));
    setRank1qbOpponentAvg(avg(rank1qbOpp));
    setRank2qbUserAvg(avg(rank2qbUser));
    setRank2qbOpponentAvg(avg(rank2qbOpp));
    setH2hUserPoints(h2hUser);
    setH2hOpponentPoints(h2hOpp);

    return {
      sharedCount,
      no1User,
      no1Opp,
      rank1qbUser: avg(rank1qbUser),
      rank1qbOpp: avg(rank1qbOpp),
      rank2qbUser: avg(rank2qbUser),
      rank2qbOpp: avg(rank2qbOpp),
      h2hUser,
      h2hOpp,
    };
  };

  // Handle username selection from dropdown
  const handleUsernameSelect = (username) => {
    setOpponentInput(username);
    setShowOpponentDropdown(false);
    setSelectedDropdownIndex(-1);
    // compute shared leagues when a username is explicitly selected
    computeAndSetSharedLeagueCount(username).catch((e) =>
      console.error("Error computing shared leagues:", e)
    );
  };

  const LEAGUE_YEAR = 2025;

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

  const handleOwnerClick = (ownerId) => {
    setClickedOwnerId((prev) => (prev === ownerId ? null : ownerId));
  };

  const highlightedLeagueIds = React.useMemo(() => {
    const result = new Set();
    if (!clickedOwnerId || !userId) return result;
    leagues.forEach((league) => {
      const owners = new Set((league.teams || []).map((t) => t.owner_id));
      if (owners.has(clickedOwnerId) && owners.has(userId)) {
        result.add(league.league_id);
      }
    });
    return result;
  }, [clickedOwnerId, leagues, userId]);

  const fetchBestballPlayerData = useCallback(
    async (
      playerIds,
      playerCountMap,
      oneQBCountMap,
      twoQBCountMap,
      totalDrafts,
      oneQBDrafts,
      twoQBDrafts
    ) => {
      const requests = {
        playerlist: playerIds,
      };

      try {
        const response = await fetch(`${BASE_URL}/getplayers/data`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requests),
        });

        const data = await response.json();

        // Update the `name` field to combine `first_name` and `last_name`
        const playerData = Object.entries(data).map(([playerId, player]) => {
          const totalCount = playerCountMap[playerId] || 0;
          const oneQBCount = oneQBCountMap[playerId] || 0;
          const twoQBCount = twoQBCountMap[playerId] || 0;

          const totalPercentage =
            totalDrafts > 0 ? ((totalCount / totalDrafts) * 100).toFixed(0) : 0;
          const oneQBPercentage =
            oneQBDrafts > 0 ? ((oneQBCount / oneQBDrafts) * 100).toFixed(0) : 0;
          const twoQBPercentage =
            twoQBDrafts > 0 ? ((twoQBCount / twoQBDrafts) * 100).toFixed(0) : 0;

          return {
            name: `${player.first_name} ${player.last_name}`.trim(), // Combine first and last name
            position: player.position,
            totalCount,
            totalPercentage,
            oneQBCount,
            oneQBPercentage,
            twoQBCount,
            twoQBPercentage,
            pts_ppr: player.pts_ppr || null,
            pts_half_ppr: player.pts_half_ppr || null,
            pos_adp_2qb: player.adp_2qb_rank || null,
            pos_adp_ppr: player.adp_ppr_rank || null,
            pos_adp_half_ppr: player.adp_half_ppr_rank || null,
            pos_pts_ppr: player.pos_rank_ppr || null,
            pos_pts_half_ppr: player.pos_rank_half_ppr || null,
          };
        });

        setPortfolioData(playerData);
      } catch (error) {
        console.error("Error fetching bestball player data:", error);
      }
    },
    []
  );

  const fetchDraftPosition = async (draftId, userId) => {
    const cachedDraftData = localStorage.getItem(`draftData_${draftId}`);
    if (cachedDraftData) {
      return JSON.parse(cachedDraftData);
    }

    try {
      const response = await fetch(
        `https://api.sleeper.app/v1/draft/${draftId}`
      );
      const draftData = await response.json();

      // Extract draft positions for all users
      const draftPositions = Object.entries(draftData.draft_order).reduce(
        (acc, [userId, draftSlot]) => {
          acc[userId] = {
            draftSlot,
            rosterId: draftData.slot_to_roster_id[draftSlot],
          };
          return acc;
        },
        {}
      );

      // Cache the draft positions in localStorage
      localStorage.setItem(
        `draftData_${draftId}`,
        JSON.stringify(draftPositions)
      );

      return draftPositions;
    } catch (error) {
      console.error(`Error fetching draft data for draft ${draftId}:`, error);
      return null;
    }
  };

  const fetchLeagueData = useCallback(async () => {
    try {
      const userResponse = await fetch(
        `https://api.sleeper.app/v1/user/${userName}`
      );
      const userData = await userResponse.json();
      const userId = userData.user_id;
      setUserId(userId);

      const leaguesResponse = await fetch(
        `https://api.sleeper.app/v1/user/${userId}/leagues/nfl/${LEAGUE_YEAR}`
      );
      const leaguesData = await leaguesResponse.json();

      const filteredLeagues = leaguesData.filter(
        (league) =>
          league.settings.best_ball === 1 && league.status === "in_season"
      );

      // Update total drafts
      setTotalDrafts(filteredLeagues.length);

      let oneQBCount = 0;
      let twoQBCount = 0;

      const playerCountMap = {};
      const oneQBCountMap = {};
      const twoQBCountMap = {};

      const standingsPromises = filteredLeagues.map(async (league) => {
        const standingsResponse = await fetch(
          `https://api.sleeper.app/v1/league/${league.league_id}/rosters`
        );
        const standingsData = await standingsResponse.json();

        console.log(
          "Fetched standings data for league:",
          league.league_id,
          standingsData
        );

        const isTwoQBLeague = league.roster_positions.includes("SUPER_FLEX");

        if (isTwoQBLeague) {
          twoQBCount++;
        } else {
          oneQBCount++;
        }

        standingsData.forEach((roster) => {
          if (roster.owner_id === userId) {
            const players = roster.players || [];

            players.forEach((playerId) => {
              if (playerId !== 0) {
                playerCountMap[playerId] = (playerCountMap[playerId] || 0) + 1;

                if (isTwoQBLeague) {
                  twoQBCountMap[playerId] = (twoQBCountMap[playerId] || 0) + 1;
                } else {
                  oneQBCountMap[playerId] = (oneQBCountMap[playerId] || 0) + 1;
                }
              }
            });
          }
        });

        const sortedTeams = standingsData.sort(
          (a, b) => b.settings.fpts - a.settings.fpts
        );

        console.log("Sorted teams for league:", league.league_id, sortedTeams);

        sortedTeams.forEach((team, index) => {
          team.position = index + 1;
        });

        const userTeam = sortedTeams.find((team) => team.owner_id === userId);
        const userPosition = userTeam ? userTeam.position : null;

        console.log(
          "League ID:",
          league.league_id,
          "User Team:",
          userTeam,
          "User Position:",
          userPosition
        );

        console.log("League object before adding to leagues state:", {
          ...league,
          teams: sortedTeams,
          userPosition,
          userRosterSettings: userTeam ? userTeam.settings : {},
        });

        return {
          ...league,
          teams: sortedTeams,
          userPosition,
          userRosterSettings: userTeam ? userTeam.settings : {},
        };
      });

      const leaguesWithTeams = await Promise.all(standingsPromises);

      // Calculate "behind 1st" value for sorting
      const calculateBehindFirst = (league) => {
        if (!league.teams || league.teams.length === 0 || !league.userRosterSettings?.fpts) {
          return 0;
        }
        const userFpts = league.userRosterSettings.fpts;
        const firstPlaceFpts = league.teams[0]?.settings?.fpts || 0;
        
        if (league.userPosition === 1) {
          // User is in first place, calculate ahead of 2nd place
          const secondPlaceFpts = league.teams[1]?.settings?.fpts || firstPlaceFpts;
          return userFpts - secondPlaceFpts;
        } else {
          // User is not in first, calculate behind 1st place
          return firstPlaceFpts - userFpts;
        }
      };

      const sortedLeagues = leaguesWithTeams.sort((a, b) => {
        // First sort by position
        if (a.userPosition !== b.userPosition) {
          return a.userPosition - b.userPosition;
        }
        // Within the same position, sort by "behind 1st" value
        const aBehind = calculateBehindFirst(a);
        const bBehind = calculateBehindFirst(b);
        
        if (a.userPosition === 1) {
          // For position 1, sort descending (highest +value first)
          return bBehind - aBehind;
        } else {
          // For other positions, sort ascending (lowest value, closest to 1st, first)
          return aBehind - bBehind;
        }
      });

      // Add draft position to the sorted league data
      const leaguesWithDraftPositions = await Promise.all(
        sortedLeagues.map(async (league) => {
          const draftPositions = await fetchDraftPosition(
            league.draft_id,
            userId
          );

          const userDraftPosition =
            draftPositions?.[userId]?.draftSlot || "N/A";
          return {
            ...league,
            draftPositions,
            userDraftPosition,
          };
        })
      );

      setLeagues(leaguesWithDraftPositions);
      console.log("Updated leagues state:", leaguesWithDraftPositions);

      // Collect all owner IDs from the leagues we just set and fetch usernames for uncached ones
      try {
        const allUserIds = new Set();
        leaguesWithDraftPositions.forEach((lg) => {
          (lg.teams || []).forEach((t) => {
            if (t.owner_id) allUserIds.add(t.owner_id);
          });
        });

        if (allUserIds.size > 0) {
          await getAllUsernames(Array.from(allUserIds));
          console.log("Usernames fetched/loaded for owners");
        }
      } catch (e) {
        console.error("Error fetching owner usernames:", e);
      }

      setOneQBDrafts(oneQBCount);
      setTwoQBDrafts(twoQBCount);

      const playerIds = Object.keys(playerCountMap);
      fetchBestballPlayerData(
        playerIds,
        playerCountMap,
        oneQBCountMap,
        twoQBCountMap,
        filteredLeagues.length,
        oneQBCount,
        twoQBCount
      );

      console.log("Fetched league data:", sortedLeagues);
      console.log("Player count map:", playerCountMap);
    } catch (error) {
      console.error("Error fetching league data:", error);
    }
  }, [userName, LEAGUE_YEAR, fetchBestballPlayerData, getAllUsernames]);

  useEffect(() => {
    fetchLeagueData();
  }, [fetchLeagueData]);

  // Recompute shared league count when leagues or usernameMap change
  useEffect(() => {
    if (opponentInput) {
      computeAndSetSharedLeagueCount(opponentInput).catch((e) =>
        console.error("Error recomputing shared leagues:", e)
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagues, usernameMap]);

  useEffect(() => {
    if (activeTab === "Portfolio") {
      localStorage.setItem(
        "FantasyHelperBestballPortfolio",
        JSON.stringify(portfolioData)
      );
      console.log("Portfolio data saved to localStorage:", portfolioData);
    }
  }, [activeTab, portfolioData]);

  const totalOneQBLeagues = oneQBDrafts;
  const totalTwoQBLeagues = twoQBDrafts;
  const totalLeagues = totalDrafts;

  // Sorting function
  const handleSort = (key, defaultDirection = "ascending") => {
    setSortConfig((prevConfig) => {
      const isSameKey = prevConfig.key === key;
      const newDirection = isSameKey
        ? prevConfig.direction === "ascending"
          ? "descending"
          : "ascending"
        : defaultDirection;
      console.log("Is same key:", isSameKey);
      console.log("Previous config:", prevConfig);
      console.log("New config:", { key, direction: newDirection });
      return { key, direction: newDirection };
    });
  };

  // Revert sorting logic to handle values as they are
  const sortedPortfolioData = [...portfolioData].sort((a, b) => {
    if (!sortConfig.key) return 0;

    const aValue = a[sortConfig.key] ?? -Infinity;
    const bValue = b[sortConfig.key] ?? -Infinity;

    if (sortConfig.direction === "ascending") {
      return aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
    } else {
      return aValue < bValue ? 1 : aValue > bValue ? -1 : 0;
    }
  });

  // Ensure diff column is properly calculated and sortable
  portfolioData.forEach((player) => {
    player.diff =
      player.pts_ppr && player.pos_pts_ppr && player.pos_adp_2qb
        ? player.pos_adp_2qb - player.pos_pts_ppr
        : null;
  });

  const getSortIcon = (key) => {
    if (sortConfig.key !== key) return "\u2195"; // Up-down arrow for unsorted
    return sortConfig.direction === "ascending" ? "\u2191" : "\u2193"; // Up or down arrow
  };

  const handleOpenModal = (league) => {
    console.log("Opening modal for league:", league);
    setSelectedDraft(league);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    console.log("Closing modal");
    setSelectedDraft(null);
    setIsModalOpen(false);
  };

  const getFilteredLeagues = () => {
    return leagues.filter((league) => {
      // Determine team count from the league object (prefer teams array if present)
      const teamCount =
        league.teams?.length ??
        league.roster_count ??
        league.settings?.team_count ??
        null;
      const is12Team = teamCount === 12;
      const is1QB = !league.roster_positions.includes("SUPER_FLEX");
      const is2QB = league.roster_positions.includes("SUPER_FLEX");

      // If the user does not want non-12-team drafts, exclude any league that is not 12 teams
      if (!showNon12TeamDrafts && !is12Team) return false;

      // Apply 1QB/2QB filters
      if (!show1QB && is1QB) return false;
      if (!show2QB && is2QB) return false;

      return true;
    });
  };

  const calculateMyData = (filteredLeagues) => {
    const draftPositionStats = {};

    filteredLeagues.forEach((league) => {
      const userDraftPosition = league.userDraftPosition;
      const userFinalPosition = league.userPosition;
      
      if (userDraftPosition === "N/A" || !userFinalPosition) return;

      if (!draftPositionStats[userDraftPosition]) {
        draftPositionStats[userDraftPosition] = {
          count: 0,
          totalPosition: 0,
          no1: 0,
        };
      }

      draftPositionStats[userDraftPosition].count += 1;
      draftPositionStats[userDraftPosition].totalPosition += userFinalPosition;
      if (userFinalPosition === 1) {
        draftPositionStats[userDraftPosition].no1 += 1;
      }
    });

    return Object.entries(draftPositionStats).map(([position, stats]) => ({
      position,
      count: stats.count,
      averagePosition: (stats.totalPosition / stats.count).toFixed(2),
      no1: stats.no1,
    }));
  };

  const calculateGeneralData = (filteredLeagues) => {
    const draftPositionStats = {};

    filteredLeagues.forEach((league) => {
      // Skip if we don't have draft position data
      if (!league.draftPositions) return;

      league.teams.forEach((team) => {
        const finalPosition = team.position;
        if (!finalPosition) return;

        // Find the draft position for this team's owner
        const ownerId = team.owner_id;
        const draftPosition = league.draftPositions[ownerId]?.draftSlot;
        if (!draftPosition) return;

        if (!draftPositionStats[draftPosition]) {
          draftPositionStats[draftPosition] = {
            totalPosition: 0,
            count: 0,
            no1: 0,
          };
        }

        draftPositionStats[draftPosition].count += 1;
        draftPositionStats[draftPosition].totalPosition += finalPosition;
        if (finalPosition === 1) {
          draftPositionStats[draftPosition].no1 += 1;
        }
      });
    });

    return Object.entries(draftPositionStats).map(([position, stats]) => ({
      position,
      averagePosition: (stats.totalPosition / stats.count).toFixed(2),
      no1: stats.no1,
    }));
  };

  const filteredLeagues = getFilteredLeagues();
  const myData = calculateMyData(filteredLeagues);
  const generalData = calculateGeneralData(filteredLeagues);

  return (
    <div className="dashboard-container">
      <div className="header-container">
        <div className="draftname">
          <h1>Bestball Overview</h1>
          <span>{userName}</span>
        </div>
      </div>

      <div className="tab-container">
        <button
          className={`tab-button ${activeTab === "Results" ? "active" : ""}`}
          onClick={() => setActiveTab("Results")}
        >
          Results
        </button>
        <button
          className={`tab-button ${activeTab === "Portfolio" ? "active" : ""}`}
          onClick={() => setActiveTab("Portfolio")}
        >
          Portfolio
        </button>
        <button
          className={`tab-button ${activeTab === "Stats" ? "active" : ""}`}
          onClick={() => setActiveTab("Stats")}
        >
          Stats
        </button>
      </div>

      <div className="tab-content">
        {activeTab === "Results" && (
          <div className="bestball-grid">
            <div className="bestball-grid-header">League Name</div>
            <div className="bestball-grid-header">Draft Position</div>
            <div className="bestball-grid-header">Position</div>
            <div className="bestball-grid-header">Behind 1st</div>
            <div className="bestball-grid-header">Record</div>
            <div className="bestball-grid-header">Links</div>

            {leagues.length > 0 ? (
              leagues.map((league) => (
                <React.Fragment key={league.league_id}>
                  <div
                    className={`bestball-grid-item ${
                      highlightedLeagueIds.has(league.league_id)
                        ? "highlight-league"
                        : ""
                    }`}
                  >
                    <span
                      className="toggle-button"
                      onClick={() => handleToggle(league.league_id)}
                    >
                      {expandedLeagueIds.has(league.league_id) ? "▼" : "►"}{" "}
                      {league.name}
                    </span>
                  </div>
                  <div className="bestball-grid-item">
                    {league.userDraftPosition || "-"}
                  </div>
                  <div className="bestball-grid-item">
                    {console.log("JSX League:", league)}
                    {console.log(
                      "Rendering league.userPosition:",
                      league.userPosition
                    )}
                    {league.userPosition || "-"}
                    <span> </span>
                    {league.userPosition === 1 && (
                      <FontAwesomeIcon
                        icon={faTrophy}
                        style={{ color: "#FFD700", marginRight: "5px" }}
                      />
                    )}
                    {league.userPosition === 2 && (
                      <FontAwesomeIcon
                        icon={faTrophy}
                        style={{ color: "lightgrey", marginRight: "5px" }}
                      />
                    )}
                    {league.userPosition === 3 && (
                      <FontAwesomeIcon
                        icon={faTrophy}
                        style={{ color: "#cd7f32", marginRight: "5px" }}
                      />
                    )}
                  </div>
                  <div className="bestball-grid-item">
                    {(() => {
                      if (!league.teams || league.teams.length === 0 || !league.userRosterSettings?.fpts) {
                        return "-";
                      }
                      const userFpts = league.userRosterSettings.fpts;
                      const firstPlaceFpts = league.teams[0]?.settings?.fpts || 0;
                      
                      if (league.userPosition === 1) {
                        // User is in first place, calculate ahead of 2nd place
                        const secondPlaceFpts = league.teams[1]?.settings?.fpts || firstPlaceFpts;
                        const ahead = userFpts - secondPlaceFpts;
                        return ahead !== 0 ? `+${Math.round(ahead)}` : "0";
                      } else {
                        // User is not in first, calculate behind 1st place (no minus sign)
                        const behind = firstPlaceFpts - userFpts;
                        return behind !== 0 ? `${Math.round(behind)}` : "0";
                      }
                    })()}
                  </div>
                  <div className="bestball-grid-item">
                    {league.userRosterSettings?.wins || 0}-
                    {league.userRosterSettings?.losses || 0}-
                    {league.userRosterSettings?.ties || 0}
                  </div>
                  <div className="bestball-grid-item">
                    <a
                      href={`https://sleeper.app/leagues/${league.league_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ marginRight: "10px" }}
                    >
                      <FontAwesomeIcon icon={faExternalLinkAlt} />
                    </a>
                    {league.draft_id && (
                      <FontAwesomeIcon
                        icon={faTableCells}
                        className="league-action-icon"
                        onClick={() => handleOpenModal(league)}
                      />
                    )}
                  </div>
                  {expandedLeagueIds.has(league.league_id) && (
                    <div className="bestball-details">
                      <div className="team-grid">
                        <div className="team-grid-header">Position</div>
                        <div className="team-grid-header">Team Name</div>
                        <div className="team-grid-header">FPTS</div>
                        <div className="team-grid-header">Record</div>

                        {league.teams.map((team) => (
                          <React.Fragment key={team.roster_id}>
                            <div className="team-grid-item">
                              {team.position}
                            </div>
                            <div className="team-grid-item">
                              {(() => {
                                const ownerName = getUsername(team.owner_id);
                                const isMe = team.owner_id === userId;
                                const isClickable = Boolean(team.owner_id);
                                return (
                                  <span
                                    className={`${
                                      isMe ? "user-position" : ""
                                    } ${
                                      clickedOwnerId === team.owner_id
                                        ? "owner-clicked"
                                        : ""
                                    }`}
                                    onClick={() =>
                                      isClickable &&
                                      handleOwnerClick(team.owner_id)
                                    }
                                    style={{
                                      cursor: isClickable
                                        ? "pointer"
                                        : "default",
                                    }}
                                  >
                                    {ownerName || `Team ${team.position}`}
                                  </span>
                                );
                              })()}
                            </div>

                            <div className="team-grid-item">
                              {team.settings.fpts}
                            </div>
                            <div className="team-grid-item">
                              {team.settings.wins}-{team.settings.losses}-
                              {team.settings.ties}
                            </div>
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                  )}
                </React.Fragment>
              ))
            ) : (
              <div className="bestball-grid-item">
                No bestball leagues found.
              </div>
            )}
          </div>
        )}

        {activeTab === "Portfolio" && (
          <div className="portfolio-container">
            <div className="portfolio-left-section">
              <div className="portfolio-summary-grid">
                <div className="portfolio-summary-header">1QB Leagues</div>
                <div className="portfolio-summary-header">2QB Leagues</div>
                <div className="portfolio-summary-header">Total Leagues</div>

                <div className="portfolio-summary-item">
                  {totalOneQBLeagues}
                </div>
                <div className="portfolio-summary-item">
                  {totalTwoQBLeagues}
                </div>
                <div className="portfolio-summary-item">{totalLeagues}</div>
              </div>

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
            </div>

            <div className="portfolio-grid">
              {/* Header row with spacers */}
              <div
                className={`portfolio-grid-header ${
                  sortConfig.key === "name" ? "active" : ""
                }`}
                onClick={() => handleSort("name", "ascending")}
              >
                Player Name{" "}
                <span className="sort-icon">{getSortIcon("name")}</span>
              </div>
              <div className="portfolio-grid-spacer" />
              <div
                className={`portfolio-grid-header ${
                  sortConfig.key === "position" ? "active" : ""
                }`}
                onClick={() => handleSort("position", "ascending")}
              >
                POS <span className="sort-icon">{getSortIcon("position")}</span>
              </div>
              <div
                className={`portfolio-grid-header ${
                  sortConfig.key === "oneQBCount" ? "active" : ""
                }`}
                onClick={() => handleSort("oneQBCount", "descending")}
              >
                1QB{" "}
                <span className="sort-icon">{getSortIcon("oneQBCount")}</span>
              </div>
              <div
                className={`portfolio-grid-header ${
                  sortConfig.key === "twoQBCount" ? "active" : ""
                }`}
                onClick={() => handleSort("twoQBCount", "descending")}
              >
                2QB{" "}
                <span className="sort-icon">{getSortIcon("twoQBCount")}</span>
              </div>
              <div
                className={`portfolio-grid-header ${
                  sortConfig.key === "totalCount" ? "active" : ""
                }`}
                onClick={() => handleSort("totalCount", "descending")}
              >
                Total{" "}
                <span className="sort-icon">{getSortIcon("totalCount")}</span>
              </div>
              <div className="portfolio-grid-spacer" />
              <div
                className={`portfolio-grid-header ${
                  sortConfig.key === "pos_adp_2qb" ? "active" : ""
                }`}
                onClick={() => handleSort("pos_adp_2qb", "ascending")}
              >
                Drafted As{" "}
                <span className="sort-icon">{getSortIcon("pos_adp_2qb")}</span>
              </div>
              <div
                className={`portfolio-grid-header ${
                  sortConfig.key === "pos_pts_ppr" ? "active" : ""
                }`}
                onClick={() => handleSort("pos_pts_ppr", "ascending")}
              >
                Points As{" "}
                <span className="sort-icon">{getSortIcon("pos_pts_ppr")}</span>
              </div>
              <div
                className={`portfolio-grid-header ${
                  sortConfig.key === "pts_ppr" ? "active" : ""
                }`}
                onClick={() => handleSort("pts_ppr", "descending")}
              >
                Points{" "}
                <span className="sort-icon">{getSortIcon("pts_ppr")}</span>
              </div>
              <div
                className={`portfolio-grid-header ${
                  sortConfig.key === "diff" ? "active" : ""
                }`}
                onClick={() => handleSort("diff", "descending")}
              >
                Diff <span className="sort-icon">{getSortIcon("diff")}</span>
              </div>

              {/* Data rows with spacers */}
              {sortedPortfolioData
                .filter((player) =>
                  selectedPosition ? player.position === selectedPosition : true
                )
                .map((player) => (
                  <React.Fragment key={player.name}>
                    <div className="portfolio-grid-item">{player.name}</div>
                    <div className="portfolio-grid-spacer" />
                    <div className="portfolio-grid-item">{player.position}</div>
                    <div className="portfolio-grid-item">
                      <span className="count">{player.oneQBCount}</span>{" "}
                      <span className="percentage">
                        ({player.oneQBPercentage}%)
                      </span>
                    </div>
                    <div className="portfolio-grid-item">
                      <span className="count">{player.twoQBCount}</span>{" "}
                      <span className="percentage">
                        ({player.twoQBPercentage}%)
                      </span>
                    </div>
                    <div className="portfolio-grid-item">
                      <span className="count">{player.totalCount}</span>{" "}
                      <span className="percentage">
                        ({player.totalPercentage}%)
                      </span>
                    </div>
                    <div className="portfolio-grid-spacer" />
                    <div className="portfolio-grid-item">
                      {player.position}
                      {player.pos_adp_2qb ? player.pos_adp_2qb : ""}
                    </div>
                    <div className="portfolio-grid-item">
                      {player.pts_ppr
                        ? `${player.position}${player.pos_pts_ppr || ""}`
                        : "-"}
                    </div>
                    <div className="portfolio-grid-item">
                      {player.pts_ppr || "-"}
                    </div>
                    <div
                      className={`portfolio-grid-item diff-column ${
                        player.pts_ppr &&
                        player.pos_pts_ppr &&
                        player.pos_adp_2qb
                          ? player.pos_adp_2qb - player.pos_pts_ppr > 0
                            ? "positive-diff"
                            : player.pos_adp_2qb - player.pos_pts_ppr < 0
                            ? "negative-diff"
                            : "neutral-diff"
                          : "neutral-diff"
                      }`}
                    >
                      {player.pts_ppr &&
                      player.pos_pts_ppr &&
                      player.pos_adp_2qb
                        ? player.pos_adp_2qb - player.pos_pts_ppr
                        : "-"}
                    </div>
                  </React.Fragment>
                ))}
            </div>
          </div>
        )}

        {activeTab === "Stats" && (
          <div className="stats-container">
            <div className="stats-filters">
              <label>
                <input
                  type="checkbox"
                  checked={showNon12TeamDrafts}
                  onChange={() => setShowNon12TeamDrafts((prev) => !prev)}
                />
                Show non-12 team drafts
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={show1QB}
                  onChange={() => setShow1QB((prev) => !prev)}
                />
                1QB
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={show2QB}
                  onChange={() => setShow2QB((prev) => !prev)}
                />
                2QB
              </label>
            </div>

            <div className="stats-tables">
              <div className="stats-column-1">
                <div className="my-general-stats">
                  <h3>My general statistics</h3>
                  <table>
                    <thead>
                      <tr>
                        <th>Statistic</th>
                        <th>Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>No1 %</td>
                        <td>
                          {filteredLeagues.length === 0
                            ? "-"
                            : `${(
                                (myData.reduce((sum, row) => sum + row.no1, 0) / filteredLeagues.length) *
                                100
                              ).toFixed(1)}% (${myData.reduce((sum, row) => sum + row.no1, 0)})`}
                        </td>
                      </tr>
                      <tr>
                        <td>1QB Rank</td>
                        <td>
                          {(() => {
                            const oneQbLeagues = filteredLeagues.filter(league => !league.roster_positions.includes("SUPER_FLEX"));
                            const oneQbPositions = oneQbLeagues.map(league => league.userPosition).filter(pos => pos);
                            const avg = oneQbPositions.length > 0 
                              ? (oneQbPositions.reduce((sum, pos) => sum + pos, 0) / oneQbPositions.length).toFixed(2)
                              : null;
                            return avg || "-";
                          })()}
                        </td>
                      </tr>
                      <tr>
                        <td>2QB Rank</td>
                        <td>
                          {(() => {
                            const twoQbLeagues = filteredLeagues.filter(league => league.roster_positions.includes("SUPER_FLEX"));
                            const twoQbPositions = twoQbLeagues.map(league => league.userPosition).filter(pos => pos);
                            const avg = twoQbPositions.length > 0 
                              ? (twoQbPositions.reduce((sum, pos) => sum + pos, 0) / twoQbPositions.length).toFixed(2)
                              : null;
                            return avg || "-";
                          })()}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="head-to-head">
                <h3>Head to Head</h3>
                <table>
                  <thead>
                    <tr>
                      <th>Comparison</th>
                      <th>{userName}</th>
                      <th>
                        <div className="opponent-input-container">
                          <input
                            type="text"
                            placeholder="Opponent"
                            className="opponent-input"
                            value={opponentInput}
                            onChange={handleOpponentInputChange}
                            onKeyDown={handleOpponentInputKeydown}
                            onBlur={() =>
                              setTimeout(
                                () => setShowOpponentDropdown(false),
                                100
                              )
                            }
                          />
                          {showOpponentDropdown && (
                            <div className="opponent-dropdown">
                              {filteredUsernames.map((username, index) => (
                                <div
                                  key={username}
                                  className={`opponent-option ${
                                    index === selectedDropdownIndex
                                      ? "selected"
                                      : ""
                                  }`}
                                  onMouseDown={(e) =>
                                    e.preventDefault()
                                  } /* prevent blur before click */
                                  onClick={() => handleUsernameSelect(username)}
                                >
                                  {username}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Bestballs together</td>
                      <td colSpan="2">
                        {sharedLeagueCount === null ? "-" : sharedLeagueCount}
                      </td>
                    </tr>
                    <tr>
                      <td>No1 %</td>
                      <td>
                        {sharedLeagueCount === null || sharedLeagueCount === 0
                          ? "-"
                          : `${(
                              (no1UserCount / sharedLeagueCount) *
                              100
                            ).toFixed(1)}% (${no1UserCount})`}
                      </td>
                      <td>
                        {sharedLeagueCount === null || sharedLeagueCount === 0
                          ? "-"
                          : `${(
                              (no1OpponentCount / sharedLeagueCount) *
                              100
                            ).toFixed(1)}% (${no1OpponentCount})`}
                      </td>
                    </tr>
                    <tr>
                      <td>Rank 1QB</td>
                      <td>{rank1qbUserAvg === null ? "-" : rank1qbUserAvg}</td>
                      <td>
                        {rank1qbOpponentAvg === null ? "-" : rank1qbOpponentAvg}
                      </td>
                    </tr>
                    <tr>
                      <td>Rank 2QB</td>
                      <td>{rank2qbUserAvg === null ? "-" : rank2qbUserAvg}</td>
                      <td>
                        {rank2qbOpponentAvg === null ? "-" : rank2qbOpponentAvg}
                      </td>
                    </tr>
                    <tr>
                      <td>
                        H2H Rank
                        <span
                          className="stat-info"
                          title="Higher rank in league than opponent"
                        >
                          ⓘ
                        </span>
                      </td>
                      <td>{h2hUserPoints === null ? "-" : h2hUserPoints}</td>
                      <td>
                        {h2hOpponentPoints === null ? "-" : h2hOpponentPoints}
                      </td>
                    </tr>
                  </tbody>
                </table>
                </div>
              </div>

              <div className="stats-column-2">
                <div className="my-data">
                  <h3>My position ranks</h3>
                  <table>
                    <thead>
                      <tr>
                        <th>Draft Position</th>
                        <th>Count</th>
                        <th>Average Position</th>
                        <th>No1</th>
                      </tr>
                    </thead>
                    <tbody>
                      {myData.length > 0 ? (
                        myData.map((row) => (
                          <tr key={row.position}>
                            <td>{row.position}</td>
                            <td>{row.count}</td>
                            <td>{row.averagePosition}</td>
                            <td>{row.no1}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="4">No data available</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="stats-column-3">
                <div className="general-data">
                  <h3>General position ranks</h3>
                  <table>
                    <thead>
                      <tr>
                        <th>Draft Position</th>
                        <th>Average Position</th>
                        <th>No1</th>
                      </tr>
                    </thead>
                    <tbody>
                      {generalData.map((row) => (
                        <tr key={row.position}>
                          <td>{row.position}</td>
                          <td>{row.averagePosition}</td>
                          <td>{row.no1}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {isModalOpen && selectedDraft && (
        <DraftModal
          league={{
            ...selectedDraft,
            teams: selectedDraft.teams.length, // Convert teams array to number
          }}
          draftId={selectedDraft.draft_id}
          userId={userId}
          onClose={handleCloseModal}
        />
      )}

      <span hidden>{userId}</span>
    </div>
  );
}

export default BestballList;

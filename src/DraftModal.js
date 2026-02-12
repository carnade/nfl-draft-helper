import React, { useEffect, useState, useCallback } from "react";
import PropTypes from "prop-types";
import "./DraftModal.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSquare } from "@fortawesome/free-regular-svg-icons";
import ResultsGrid from "./ResultsGrid";
import { GiGoat } from "react-icons/gi";
import { GiAmericanFootballPlayer, GiSheep, GiTurd } from "react-icons/gi";
import { GiFireworkRocket } from "react-icons/gi";
import { TbArrowsLeftRight } from "react-icons/tb";
import { FaTrashAlt, FaCopy } from "react-icons/fa";

// Add a mock flag
const mock = false; // Set to true for localhost, false for production

// Define the base URL based on the mock flag
const BASE_URL = mock
  ? "http://localhost:5000"
  : "https://shaggy-latashia-carnade-2ea2054a.koyeb.app";

function DraftModal({ league, draftId, onClose, userId }) {
  // Debug: Log the league prop on mount
  useEffect(() => {
    console.log("[DraftModal] league prop:", league);
  }, [league]);

  // State for scoring type and pts/ranks switch
  const [scoringType, setScoringType] = useState("");
  const [isRanksMode, setIsRanksMode] = useState(false); // true = Ranks, false = Pts
  const [picks, setPicks] = useState([]);
  const [playerData, setPlayerData] = useState({});
  const [draftType, setDraftType] = useState(null);
  const [reversalRound, setReversalRound] = useState(null);
  const [draftOrder, setDraftOrder] = useState(null);
  const [playerResults, setPlayerResults] = useState({});
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [isRedGreenActive, setIsRedGreenActive] = useState(false);
  const [isGoatActive, setIsGoatActive] = useState(false); // Add Goat toggle state
  const [isLoading, setIsLoading] = useState(true); // Add loading state
  const [qbCount, setQbCount] = useState(0); // Add QbCount state
  const [usernames, setUsernames] = useState({}); // Store username mapping: userId -> username
  const [leagueId, setLeagueId] = useState(null); // Store league_id from draft

  const calculateGoatValues = useCallback(
    (picks, draftType) => {
      const results = {}; // Object to store counts per user

      // Initialize all userIds to 0 for goat categories based on draft order
      Object.entries(draftOrder || {}).forEach(([userId, position]) => {
        results[position] = {
          userId,
          goat: 0,
          hero: 0,
          decent: 0,
          neutral: 0,
          bad: 0,
          horrible: 0,
          turd: 0,
        };
      });

      picks.forEach((pick) => {
        const player = playerData[pick.player_id] || {};
        const pickNumber = pick.pick_no;
        const pickedBy = pick.picked_by;
        const position = draftOrder[pickedBy];
        const round = Math.ceil(pickNumber / (league.teams || 12));

        if (isRanksMode) {
          // Original KTC/FC rank calculation
          const ktcRank = player.ktcRankCalculated;
          const fcRank = player.fcRankCalculated;

          if (!isNaN(pickNumber) && !isNaN(ktcRank) && !isNaN(fcRank)) {
            const averageRank = (ktcRank + fcRank) / 2;
            const rankDifference = pickNumber - averageRank;

            if (draftType === "linear") {
              let adjustedRankDifference = rankDifference / round;

              if (qbCount >= 2 && player.position === "QB") {
                adjustedRankDifference += 1.5;
              }

              if (adjustedRankDifference >= 4) {
                results[position].goat++;
              } else if (adjustedRankDifference >= 3) {
                results[position].hero++;
              } else if (adjustedRankDifference >= 2) {
                results[position].decent++;
              } else if (adjustedRankDifference <= -4) {
                results[position].turd++;
              } else if (adjustedRankDifference <= -3) {
                results[position].horrible++;
              } else if (adjustedRankDifference <= -2) {
                results[position].bad++;
              } else if (adjustedRankDifference > -2 && adjustedRankDifference < 2) {
                results[position].neutral++;
              }
            } else if (draftType === "snake") {
              const factor = 1.25 * round;
              let adjustedRankDifference = rankDifference / factor;

              if (qbCount >= 2 && player.position === "QB") {
                adjustedRankDifference += 1.5;
              }

              if (adjustedRankDifference >= 4) {
                results[position].goat++;
              } else if (adjustedRankDifference >= 3) {
                results[position].hero++;
              } else if (adjustedRankDifference >= 2) {
                results[position].decent++;
              } else if (adjustedRankDifference <= -4) {
                results[position].turd++;
              } else if (adjustedRankDifference <= -3) {
                results[position].horrible++;
              } else if (adjustedRankDifference <= -2) {
                results[position].bad++;
              } else if (adjustedRankDifference > -2 && adjustedRankDifference < 2) {
                results[position].neutral++;
              }
            }
          }
        } else {
          // Position rank calculation
          const currentPosition = player.position;
          if (currentPosition && pickNumber) {
            const numPrior = picks.filter(
              (p) => {
                const pdata = playerData[p.player_id] || {};
                return (
                  p.pick_no < pickNumber &&
                  pdata.position === currentPosition
                );
              }
            ).length;
            const draftPosRank = numPrior + 1;


            // Get the player's points based on scoring type
            const playerPoints = scoringType?.toLowerCase().includes("half_ppr")
              ? player.pts_half_ppr
              : player.pts_ppr;

            // Get the player's position rank
            const playerPosRank = scoringType?.toLowerCase().includes("half_ppr")
              ? player.pos_rank_half_ppr
              : player.pos_rank_ppr;
            if (playerPoints && playerPosRank) {
              // Find the player that was picked at the player's position rank
              const expectedPlayer = Object.values(playerData).find(p => {
                const pPosRank = scoringType?.toLowerCase().includes("half_ppr")
                  ? p.pos_rank_half_ppr
                  : p.pos_rank_ppr;
                return p.position === currentPosition && draftPosRank === pPosRank;
              });

              if (expectedPlayer) {
                // Get the expected player's points
                const expectedPoints = scoringType?.toLowerCase().includes("half_ppr")
                  ? expectedPlayer.pts_half_ppr
                  : expectedPlayer.pts_ppr;

                if (expectedPoints) {
                  // Calculate point differential
                  const pointDiff = playerPoints - expectedPoints;

                  if (draftType === "linear") {
                    let adjustedPointDiff = pointDiff;

                    if (adjustedPointDiff >= 50) {
                      results[position].goat++;
                      console.debug(`[GOAT] ${player.first_name} ${player.last_name} (pick_no: ${pick.pick_no}) adjustedPointDiff: ${adjustedPointDiff}`);
                    } else if (adjustedPointDiff >= 35) {
                      results[position].hero++;
                      console.debug(`[HERO] ${player.first_name} ${player.last_name} (pick_no: ${pick.pick_no}) adjustedPointDiff: ${adjustedPointDiff}`);
                    } else if (adjustedPointDiff >= 20) {
                      results[position].decent++;
                      console.debug(`[DECENT] ${player.first_name} ${player.last_name} (pick_no: ${pick.pick_no}) adjustedPointDiff: ${adjustedPointDiff}`);
                    } else if (adjustedPointDiff <= -50) {
                      results[position].turd++;
                      console.debug(`[TURD] ${player.first_name} ${player.last_name} (pick_no: ${pick.pick_no}) adjustedPointDiff: ${adjustedPointDiff}`);
                    } else if (adjustedPointDiff <= -35) {
                      results[position].horrible++;
                      console.debug(`[HORRIBLE] ${player.first_name} ${player.last_name} (pick_no: ${pick.pick_no}) adjustedPointDiff: ${adjustedPointDiff}`);
                    } else if (adjustedPointDiff <= -20) {
                      results[position].bad++;
                      console.debug(`[BAD] ${player.first_name} ${player.last_name} (pick_no: ${pick.pick_no}) adjustedPointDiff: ${adjustedPointDiff}`);
                    } else if (adjustedPointDiff > -20 && adjustedPointDiff < 20) {
                      results[position].neutral++;
                      console.debug(`[NEUTRAL] ${player.first_name} ${player.last_name} (pick_no: ${pick.pick_no}) adjustedPointDiff: ${adjustedPointDiff}`);
                    }
                  } else if (draftType === "snake") {
                    const factor = 1;
                    let adjustedPointDiff = pointDiff / factor;

                    if (adjustedPointDiff >= 50) {
                      results[position].goat++;
                      console.debug(`[GOAT] ${player.first_name} ${player.last_name} (pick_no: ${pick.pick_no}) adjustedPointDiff: ${adjustedPointDiff}`);
                    } else if (adjustedPointDiff >= 35) {
                      results[position].hero++;
                      console.debug(`[HERO] ${player.first_name} ${player.last_name} (pick_no: ${pick.pick_no}) adjustedPointDiff: ${adjustedPointDiff}`);
                    } else if (adjustedPointDiff >= 20) {
                      results[position].decent++;
                      console.debug(`[DECENT] ${player.first_name} ${player.last_name} (pick_no: ${pick.pick_no}) adjustedPointDiff: ${adjustedPointDiff}`);
                    } else if (adjustedPointDiff <= -50) {
                      results[position].turd++;
                      console.debug(`[TURD] ${player.first_name} ${player.last_name} (pick_no: ${pick.pick_no}) adjustedPointDiff: ${adjustedPointDiff}`);
                    } else if (adjustedPointDiff <= -35) {
                      results[position].horrible++;
                      console.debug(`[HORRIBLE] ${player.first_name} ${player.last_name} (pick_no: ${pick.pick_no}) adjustedPointDiff: ${adjustedPointDiff}`);
                    } else if (adjustedPointDiff <= -20) {
                      results[position].bad++;
                      console.debug(`[BAD] ${player.first_name} ${player.last_name} (pick_no: ${pick.pick_no}) adjustedPointDiff: ${adjustedPointDiff}`);
                    } else if (adjustedPointDiff > -20 && adjustedPointDiff < 20) {
                      results[position].neutral++;
                      console.debug(`[NEUTRAL] ${player.first_name} ${player.last_name} (pick_no: ${pick.pick_no}) adjustedPointDiff: ${adjustedPointDiff}`);
                    }
                  }
                }
              }
              else {
                console.debug(`[BY RANKINGS] ${player.first_name} ${player.last_name} (pick_no: ${pick.pick_no}) posRank: ${playerPosRank}`);

                const factor = 0.4 * round;
                let posPickRank = getDraftPosRank(picks, playerData, pick.pick_no, player.position)
                let adjustedRankDifference = (posPickRank - playerPosRank) / factor;

                if (qbCount >= 2 && player.position === "QB") {
                  adjustedRankDifference += 1;
                }
  
                if (adjustedRankDifference >= 4) {
                  results[position].goat++;
                  console.debug(`[RANKINGS GOAT] ${player.first_name} ${player.last_name} (adjustedRankDifference: ${adjustedRankDifference}) (posPickRank: ${posPickRank}) posRank: ${playerPosRank}`);
                } else if (adjustedRankDifference >= 3) {
                  results[position].hero++;
                  console.debug(`[RANKINGS HERO] ${player.first_name} ${player.last_name} (adjustedRankDifference: ${adjustedRankDifference}) (posPickRank: ${posPickRank}) posRank: ${playerPosRank}`);
                } else if (adjustedRankDifference >= 2) {
                  results[position].decent++;
                  console.debug(`[RANKINGS DECENT] ${player.first_name} ${player.last_name} (adjustedRankDifference: ${adjustedRankDifference}) (posPickRank: ${posPickRank}) posRank: ${playerPosRank}`);
                } else if (adjustedRankDifference <= -4) {
                  results[position].turd++;
                  console.debug(`[RANKINGS TURD] ${player.first_name} ${player.last_name} (adjustedRankDifference: ${adjustedRankDifference}) (posPickRank: ${posPickRank}) posRank: ${playerPosRank}`);
                } else if (adjustedRankDifference <= -3) {
                  results[position].horrible++;
                  console.debug(`[RANKINGS HORRIBLE] ${player.first_name} ${player.last_name} (adjustedRankDifference: ${adjustedRankDifference}) (posPickRank: ${posPickRank}) posRank: ${playerPosRank}`);
                } else if (adjustedRankDifference <= -2) {
                  results[position].bad++;
                  console.debug(`[RANKINGS BAD] ${player.first_name} ${player.last_name} (adjustedRankDifference: ${adjustedRankDifference}) (posPickRank: ${posPickRank}) posRank: ${playerPosRank}`);
                } else if (adjustedRankDifference > -2 && adjustedRankDifference < 2) {
                  results[position].neutral++;
                  console.debug(`[RANKINGS NEUTRAL] ${player.first_name} ${player.last_name} (adjustedRankDifference: ${adjustedRankDifference}) (posPickRank: ${posPickRank}) posRank: ${playerPosRank}`);
                }}
            }
          }
        }
      });

      return results;
    },
    [draftOrder, playerData, league.teams, qbCount, scoringType, isRanksMode]
  );

  const updateGoatResults = useCallback(() => {
    if (!isGoatActive) {
      setPlayerResults({}); // Clear results if Goat is not active
      return;
    }

    const results = calculateGoatValues(picks, draftType);

    // Convert results back to an ordered array
    const orderedResults = Object.values(results).sort(
      (a, b) => a.position - b.position
    );
    setPlayerResults(orderedResults);

    // Log the counts per team
  }, [isGoatActive, picks, draftType, calculateGoatValues]);

  useEffect(() => {
    if (isGoatActive) {
      updateGoatResults();
    }
  }, [isGoatActive, updateGoatResults]);

  // Fetch league users to get usernames
  useEffect(() => {
    const fetchLeagueUsers = async () => {
      // Try league.league_id first, then fallback to leagueId state
      const targetLeagueId = league?.league_id || leagueId;
      if (!targetLeagueId) return;
      
      try {
        const response = await fetch(
          `https://api.sleeper.app/v1/league/${targetLeagueId}/users`
        );
        if (response.ok) {
          const users = await response.json();
          const usernameMap = {};
          users.forEach(user => {
            usernameMap[user.user_id] = user.display_name || user.username || `User_${user.user_id}`;
          });
          setUsernames(usernameMap);
        }
      } catch (error) {
        console.error("Error fetching league users:", error);
      }
    };

    fetchLeagueUsers();
  }, [league?.league_id, leagueId]);

  useEffect(() => {
    setIsLoading(true); // Set loading to true before fetching data
    if (draftId) {
      const fetchDraftDetails = async () => {
        try {
          const response = await fetch(
            `https://api.sleeper.app/v1/draft/${draftId}`
          );
          if (response.ok) {
            const data = await response.json();
            setDraftType(data.type);
            setReversalRound(data.settings.reversal_round);
            setDraftOrder(data.draft_order);
            // Store league_id from draft
            if (data.league_id) {
              setLeagueId(data.league_id);
            }

            // Extract scoring type from metadata
            const scoring =
              data.metadata && data.metadata.scoring_type
                ? data.metadata.scoring_type
                : "";
            setScoringType(scoring);
            // Set switch: dynasty = pts, else ranks
            if (scoring && scoring.toLowerCase().includes("dynasty")) {
              setIsRanksMode(true);
            } else {
              setIsRanksMode(false);
            }

            // Calculate and set QbCount
            const qbWeight = data.settings.slots_qb || 1;
            const superFlexWeight = data.settings.slots_super_flex || 0;
            const qbCount = qbWeight + superFlexWeight;
            setQbCount(qbCount);
          } else if (response.status === 404) {
            console.error("No draft found");
            setDraftType(null); // Indicate no draft found
          }
        } catch (error) {
          console.error("Error fetching draft details:", error);
          setDraftType(null); // Indicate no draft found on error
        } finally {
          setIsLoading(false); // Set loading to false after fetching data
        }
      };

      fetchDraftDetails();
    }
  }, [draftId]);

  useEffect(() => {
    if (draftId) {
      const fetchPicks = async () => {
        try {
          const response = await fetch(
            `https://api.sleeper.app/v1/draft/${draftId}/picks`
          );
          if (response.ok) {
            const data = await response.json();
            setPicks(data);
          } else {
            console.error("Error fetching draft picks: Not Found");
            setPicks([]); // Set picks to an empty array on error
          }
        } catch (error) {
          console.error("Error fetching draft picks:", error);
          setPicks([]); // Set picks to an empty array on error
        }
      };

      fetchPicks();
    }
  }, [draftId]);

  useEffect(() => {
    const fetchPlayerData = async () => {
      if (picks.length > 0) {
        const playerlist = picks.map((pick) => pick.player_id).filter(Boolean);
        try {
          const response = await fetch(`${BASE_URL}/getplayers/data`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ playerlist }),
          });
          const data = await response.json();
          setPlayerData(data);
          // Debug: Log playerData when fetched
          console.log("[DraftModal] playerData fetched:", data);
        } catch (error) {
          console.error("Error fetching player data:", error);
        }
      }
    };

    fetchPlayerData();
  }, [picks]);

  useEffect(() => {
    const calculateRanks = () => {
      const playersWithKTC = Object.values(playerData).filter(
        (player) => player["KTC Value"]
      );
      const playersWithFC = Object.values(playerData).filter(
        (player) => player["FC Value"]
      );

      playersWithKTC.sort((a, b) => b["KTC Value"] - a["KTC Value"]);
      playersWithFC.sort((a, b) => b["FC Value"] - a["FC Value"]);

      playersWithKTC.forEach((player, index) => {
        player.ktcRankCalculated = index + 1;
      });

      playersWithFC.forEach((player, index) => {
        player.fcRankCalculated = index + 1;
      });

      setPlayerData((prevData) => {
        const updatedData = { ...prevData };
        let hasChanges = false;

        playersWithKTC.forEach((player) => {
          if (
            !updatedData[player.sportradar_id] ||
            updatedData[player.sportradar_id].ktcRankCalculated !==
              player.ktcRankCalculated
          ) {
            hasChanges = true;
            updatedData[player.sportradar_id] = {
              ...updatedData[player.sportradar_id],
              ktcRankCalculated: player.ktcRankCalculated,
            };
          }
        });

        playersWithFC.forEach((player) => {
          if (
            !updatedData[player.sportradar_id] ||
            updatedData[player.sportradar_id].fcRankCalculated !==
              player.fcRankCalculated
          ) {
            hasChanges = true;
            updatedData[player.sportradar_id] = {
              ...updatedData[player.sportradar_id],
              fcRankCalculated: player.fcRankCalculated,
            };
          }
        });

        return hasChanges ? updatedData : prevData;
      });
    };

    calculateRanks();
  }, [playerData]);

  const calculatePresentationOrder = (
    picks,
    teamsCount,
    draftType,
    reversalRound
  ) => {
    if (!picks || picks.length === 0) return [];

    if (draftType !== "snake") {
      return [...picks];
    }

    // Sort picks by grid order (round, slot) so every pick is shown—no index→pick_no lookup that can drop picks.
    const getSortKey = (pickNo) => {
      const round = Math.ceil(pickNo / teamsCount);
      const slotInRound1Based = ((pickNo - 1) % teamsCount) + 1;
      const reverseSlot = teamsCount - slotInRound1Based + 1;
      let displaySlot;
      if (reversalRound && round === reversalRound) {
        displaySlot = reverseSlot;
      } else if (reversalRound && round > reversalRound) {
        displaySlot = round % 2 === 1 ? reverseSlot : slotInRound1Based;
      } else {
        displaySlot = round % 2 === 1 ? slotInRound1Based : reverseSlot;
      }
      return round * 1000 + displaySlot;
    };

    return [...picks].sort((a, b) => getSortKey(a.pick_no) - getSortKey(b.pick_no));
  };

  // For snake: odd rounds start left, even start right. Third-round reversal flips that round and all later rounds.
  const roundStartsLeft = (round, reversalRound) => {
    const normalStartsLeft = round % 2 === 1;
    if (!reversalRound) return normalStartsLeft;
    if (round < reversalRound) return normalStartsLeft;
    return !normalStartsLeft; // reversal round and every round after: flip direction
  };

  const filteredPicks = (picks || []).map((pick) => {
    const player = playerData[pick.player_id] || {};
    const pickNumber = pick.pick_no;
    const ktcRank = player.ktcRankCalculated;
    const fcRank = player.fcRankCalculated;

    if (!isNaN(pickNumber) && !isNaN(ktcRank) && !isNaN(fcRank)) {
      const averageRank = (ktcRank + fcRank) / 2;
      const rankDifference = pick.pick_no - averageRank;
      return {
        ...pick,
        rankDifference,
        isDimmed: selectedTeam && pick.picked_by !== selectedTeam, // Dim background for non-selected teams
        isIconDimmed:
          isGoatActive && selectedTeam && pick.picked_by !== selectedTeam, // Dim icons for non-selected teams when Goat is active
      };
    }

    return {
      ...pick,
      isDimmed: selectedTeam && pick.picked_by !== selectedTeam, // Dim background for non-selected teams
      isIconDimmed:
        isGoatActive && selectedTeam && pick.picked_by !== selectedTeam, // Dim icons for non-selected teams when Goat is active
    };
  });

  const calculateBorders = (pick) => {
    if (!isRedGreenActive) {
      return { border: "2px solid #999" };
    }

    if (pick.isDimmed) {
      return { border: "2px solid #999" };
    }

    const player = playerData[pick.player_id] || {};

    if (isRanksMode) {
      const pickNumber = pick.pick_no;
      const ktcRank = player.ktcRankCalculated;
      const fcRank = player.fcRankCalculated;

      if (!isNaN(pickNumber) && !isNaN(ktcRank) && !isNaN(fcRank)) {
        const averageRank = (ktcRank + fcRank) / 2;
        if (pickNumber > averageRank) {
          return { border: "4px solid rgb(45, 222, 39)" };
        } else if (pickNumber < averageRank) {
          return { border: "4px solid red" };
        }
      }
    } else {
      const currentPickNo = pick.pick_no;
      const currentPosition = player.position;
      
      if (currentPosition && currentPickNo) {
        const draftPosRank = getDraftPosRank(picks, playerData, currentPickNo, currentPosition);

        const posRank = scoringType?.toLowerCase().includes("half_ppr")
          ? player.pos_rank_half_ppr
          : player.pos_rank_ppr;

        if (posRank) {
          console.debug(
            `Border - Player: ${player.first_name} ${player.last_name} (${currentPosition})`,
            `Draft Pos Rank: ${draftPosRank}`,
            `Pos Rank: ${posRank}`,
            `Difference: ${draftPosRank - posRank}`
          );

          if (draftPosRank > posRank) {
            return { border: "4px solid rgb(45, 222, 39)" };
          } else if (draftPosRank < posRank) {
            return { border: "4px solid red" };
          }
        }
      }
    }

    return { border: "2px solid #999" };
  };

  const calculateBackground = (pick) => {
    if (pick.isDimmed) {
      return { backgroundColor: "transparent" };
    }
    return { backgroundColor: "" }; // Default background
  };

  const handleTeamButtonClick = (selectedUserId) => {
    if (selectedTeam === selectedUserId) {
      setSelectedTeam(null);
    } else {
      setSelectedTeam(selectedUserId);
    }
  };

  const handleRedGreenToggle = (event) => {
    const isChecked = event.target.checked;
    console.debug("RedGreen toggle changed:", isChecked);

    if (isChecked) {
      setIsGoatActive(false); // Turn off Goat switch first
      setIsRedGreenActive(true); // Then activate RedGreen
      console.debug("RedGreen toggle activated. Updating ResultsGrid.");
      updateResultsGrid(true); // Ensure results are updated for RedGreen
    } else {
      setIsRedGreenActive(false);
      console.debug("RedGreen toggle deactivated. Clearing ResultsGrid.");
      updateResultsGrid(false); // Clear results when RedGreen is deactivated
    }
  };

  const handleGoatToggle = (event) => {
    const isChecked = event.target.checked;
    console.debug("Goat toggle changed:", isChecked);
    setIsGoatActive(isChecked);

    if (isChecked) {
      setIsRedGreenActive(false); // Turn off RedGreen switch if Goat is activated
      console.debug("Goat toggle activated. Updating Goat Results.");
      updateResultsGrid(false); // Clear results when Goat is activated
      updateGoatResults(); // Update Goat results
    } else {
      console.debug(
        "Goat toggle deactivated. Restoring RedGreen Results if active."
      );
      updateResultsGrid(isRedGreenActive); // Restore RedGreen results if active
    }
  };

  const updateResultsGrid = useCallback((isActive) => {
    console.debug(
      "updateResultsGrid called with isActive:",
      isActive,
      "isGoatActive:",
      isGoatActive
    );

    if (!isActive) {
      setPlayerResults({});
      console.debug("RedGreen toggle is off. Clearing results.");
      return;
    }

    const results = {};

    Object.entries(draftOrder || {}).forEach(([userId, position]) => {
      results[position] = { userId, green: 0, red: 0 };
    });

    picks.forEach((pick) => {
      const player = playerData[pick.player_id] || {};
      const pickedBy = pick.picked_by;
      const position = draftOrder[pickedBy];

      if (isRanksMode) {
        // Rank-based calculation
        const pickNumber = pick.pick_no;
        const ktcRank = player.ktcRankCalculated;
        const fcRank = player.fcRankCalculated;

        if (!isNaN(pickNumber) && !isNaN(ktcRank) && !isNaN(fcRank)) {
          const averageRank = (ktcRank + fcRank) / 2;
          if (pickNumber > averageRank) {
            results[position].green++;
          } else if (pickNumber < averageRank) {
            results[position].red++;
          }
        }
      } else {
        // Points-based calculation
        const currentPickNo = pick.pick_no;
        const currentPosition = player.position;
        
        if (currentPosition && currentPickNo) {
          const draftPosRank = getDraftPosRank(picks, playerData, currentPickNo, currentPosition);

          const posRank = scoringType?.toLowerCase().includes("half_ppr")
            ? player.pos_rank_half_ppr
            : player.pos_rank_ppr;

          if (posRank) {

            if (draftPosRank > posRank) {
              results[position].green++;
            } else if (draftPosRank < posRank) {
              results[position].red++;
            }
          }
        }
      }
    });

    const orderedResults = Object.values(results).sort(
      (a, b) => a.position - b.position
    );
    setPlayerResults(orderedResults);
  }, [isRanksMode, isGoatActive, draftOrder, picks, playerData, scoringType]);

  useEffect(() => {
    if (isRedGreenActive) {
      updateResultsGrid(true);
    }
  }, [isRanksMode, isRedGreenActive, updateResultsGrid]);

  const renderTeamButtons = (draftOrder) => {
    if (!draftOrder || typeof draftOrder !== "object") {
      return null;
    }

    const sortedDraftOrder = Object.entries(draftOrder).sort(
      (a, b) => a[1] - b[1]
    );

    return (
      <div className="team-buttons-grid">
        {sortedDraftOrder.map(([uid, position]) => {
          // Get username, fallback to position number if not available yet
          const username = usernames[uid] || `Team ${position}`;
          const buttonLabel = uid === userId ? usernames[uid] || "You" : username;
          return (
            <button
              key={uid}
              className={`team-button ${
                selectedTeam === uid ? "selected" : ""
              }`}
              title={usernames[uid] || `Team ${position}`}
              onClick={() => handleTeamButtonClick(uid)}
            >
              {buttonLabel}
            </button>
          );
        })}
      </div>
    );
  };

  function iconForPick(pick, draftType) {
    const player = playerData[pick.player_id] || {};
    const pickNumber = pick.pick_no;
    const round = Math.ceil(pickNumber / (league.teams || 12));

    if (isRanksMode) {
      // Original KTC/FC rank calculation
      const ktcRank = player.ktcRankCalculated;
      const fcRank = player.fcRankCalculated;

      if (!isNaN(pickNumber) && !isNaN(ktcRank) && !isNaN(fcRank)) {
        const averageRank = (ktcRank + fcRank) / 2;
        const rankDifference = pickNumber - averageRank;

        if (draftType === "linear") {
          let adjustedRankDifference = rankDifference / round;

          if (qbCount >= 2 && player.position === "QB") {
            adjustedRankDifference += 1.5;
          }

          if (adjustedRankDifference >= 4) {
            return <GiGoat className="result-icon golden" />;
          } else if (adjustedRankDifference >= 3) {
            return <GiFireworkRocket className="result-icon" />;
          } else if (adjustedRankDifference >= 2) {
            return <GiAmericanFootballPlayer className="result-icon" />;
          } else if (adjustedRankDifference > -2 && adjustedRankDifference < 2) {
            return <TbArrowsLeftRight className="result-icon" />;
          } else if (adjustedRankDifference <= -2 && adjustedRankDifference > -3) {
            return <GiSheep className="result-icon" />;
          } else if (adjustedRankDifference <= -3 && adjustedRankDifference > -4) {
            return <FaTrashAlt className="result-icon" />;
          } else if (adjustedRankDifference <= -4) {
            return <GiTurd className="result-icon brown" />;
          }
        } else if (draftType === "snake") {
          const factor = 1.25 * round;
          let adjustedRankDifference = rankDifference / factor;

          if (qbCount >= 2 && player.position === "QB") {
            adjustedRankDifference += 2.5;
          }

          if (adjustedRankDifference >= 4) {
            return <GiGoat className="result-icon golden" />;
          } else if (adjustedRankDifference >= 3) {
            return <GiFireworkRocket className="result-icon" />;
          } else if (adjustedRankDifference >= 2) {
            return <GiAmericanFootballPlayer className="result-icon" />;
          } else if (adjustedRankDifference > -2 && adjustedRankDifference < 2) {
            return <TbArrowsLeftRight className="result-icon" />;
          } else if (adjustedRankDifference <= -2 && adjustedRankDifference > -3) {
            return <GiSheep className="result-icon" />;
          } else if (adjustedRankDifference <= -3 && adjustedRankDifference > -4) {
            return <FaTrashAlt className="result-icon" />;
          } else if (adjustedRankDifference <= -4) {
            return <GiTurd className="result-icon brown" />;
          }
        }
      }
    } else {
      // Position rank calculation
      const currentPosition = player.position;
      
      if (currentPosition && pickNumber) {
        const draftPosRank = getDraftPosRank(picks, playerData, pickNumber, currentPosition);

        // Get the player's points based on scoring type
        const playerPoints = scoringType?.toLowerCase().includes("half_ppr")
          ? player.pts_half_ppr
          : player.pts_ppr;

        // Get the player's position rank
        const playerPosRank = scoringType?.toLowerCase().includes("half_ppr")
          ? player.pos_rank_half_ppr
          : player.pos_rank_ppr;

        if (playerPoints && playerPosRank) {
          // Find the player that was picked at the player's position rank
          const expectedPlayer = Object.values(playerData).find(p => {
            const pPosRank = scoringType?.toLowerCase().includes("half_ppr")
              ? p.pos_rank_half_ppr
              : p.pos_rank_ppr;
            return p.position === currentPosition && draftPosRank === pPosRank;
          });

          if (expectedPlayer) {
            // Get the expected player's points
            const expectedPoints = scoringType?.toLowerCase().includes("half_ppr")
              ? expectedPlayer.pts_half_ppr
              : expectedPlayer.pts_ppr;

            if (expectedPoints) {
              // Calculate point differential
              const pointDiff = playerPoints - expectedPoints;

              if (draftType === "linear") {
                let adjustedPointDiff = pointDiff;

                if (adjustedPointDiff >= 50) {
                  return <GiGoat className="result-icon golden" />;
                } else if (adjustedPointDiff >= 35) {
                  return <GiFireworkRocket className="result-icon" />;
                } else if (adjustedPointDiff >= 20) {
                  return <GiAmericanFootballPlayer className="result-icon" />;
                } else if (adjustedPointDiff <= -50) {
                  return <GiTurd className="result-icon brown" />;
                } else if (adjustedPointDiff <= -35) {
                  return <FaTrashAlt className="result-icon" />;
                } else if (adjustedPointDiff <= -20) {
                  return <GiSheep className="result-icon" />;
                } else if (adjustedPointDiff > -20 && adjustedPointDiff <20) {
                  return <TbArrowsLeftRight className="result-icon" />;
                }
              } else if (draftType === "snake") {
                const factor = 1;
                let adjustedPointDiff = pointDiff / factor;

                if (adjustedPointDiff >= 50) {
                  return <GiGoat className="result-icon golden" />;
                } else if (adjustedPointDiff >= 35) {
                  return <GiFireworkRocket className="result-icon" />;
                } else if (adjustedPointDiff >= 20) {
                  return <GiAmericanFootballPlayer className="result-icon" />;
                } else if (adjustedPointDiff <= -50) {
                  return <GiTurd className="result-icon brown" />;
                } else if (adjustedPointDiff <= -35) {
                  return <FaTrashAlt className="result-icon" />;
                } else if (adjustedPointDiff <= -20) {
                  return <GiSheep className="result-icon" />;
                } else if (adjustedPointDiff > -20 && adjustedPointDiff <20) {
                  return <TbArrowsLeftRight className="result-icon" />;
                }
              }
            }
          } else {
            const factor = 0.4 * round;
            let posPickRank = getDraftPosRank(picks, playerData, pick.pick_no, player.position)
            let adjustedRankDifference = (posPickRank - playerPosRank) / factor;

            if (qbCount >= 2 && player.position === "QB") {
              adjustedRankDifference += 1;
            }

            if (adjustedRankDifference >= 4) {
              return <GiGoat className="result-icon golden" />;
            } else if (adjustedRankDifference >= 3) {
              return <GiFireworkRocket className="result-icon" />;
            } else if (adjustedRankDifference >= 2) {
              return <GiAmericanFootballPlayer className="result-icon" />;
            } else if (adjustedRankDifference <= -4) {
              return <GiTurd className="result-icon brown" />;
            } else if (adjustedRankDifference <= -3) {
              return <FaTrashAlt className="result-icon" />;
            } else if (adjustedRankDifference <= -2) {
              return <GiSheep className="result-icon" />;
            } else if (adjustedRankDifference > -2 && adjustedRankDifference < 2) {
              return <TbArrowsLeftRight className="result-icon" />;
            }
          }
        }
      }
    }

    return null;
  }

  // Add this helper function inside DraftModal, before useEffect hooks
  function getDraftPosRank(picks, playerData, pickNumber, position) {
    const numPrior = picks.filter(
      (p) => {
        const pdata = playerData[p.player_id] || {};
        return (
          p.pick_no < pickNumber &&
          pdata.position === position
        );
      }
    ).length;
    return numPrior + 1;
  }

  const renderPlayerCard = (pick, player, metadata, teamsCount, formattedRank) => (
    <div
      key={pick.pick_no}
      className={`player-card ${
        metadata.position?.toLowerCase() || "unknown"
      } ${pick.isDimmed ? "player-card-dimmed" : ""}`}
      data-picked-by={pick.picked_by}
      data-pick-no={pick.pick_no}
      style={{
        ...calculateBorders(pick),
        ...calculateBackground(pick),
      }}
    >
      <div className="pick-number">
        {formattedRank} :{pick.pick_no}
      </div>
      <div className="draftmodal-player-name">
        <div
          className="draftmodal-player-firstname autoshrink-text"
          title={
            (metadata.first_name || player.first_name || "Unknown") +
            " " +
            (metadata.last_name || player.last_name || "Player")
          }
        >
          {metadata.first_name || player.first_name || "Unknown"}
        </div>
        <div
          className="draftmodal-player-lastname autoshrink-text"
          title={
            (metadata.first_name || player.first_name || "Unknown") +
            " " +
            (metadata.last_name || player.last_name || "Player")
          }
        >
          {metadata.last_name || player.last_name || "Player"}
        </div>
      </div>
      {isRanksMode ? (
        <>
          <div className="player-info ktc">
            <div className="draft-modal-card-text">KTC:</div>
            {player["KTC Value"] || "N/A"}
          </div>
          <div className="player-info ktc-rank">
            <div className="draft-modal-card-text">R:</div>
            {player.ktcRankCalculated || "N/A"}
          </div>
          <div className="player-info fc">
            <div className="draft-modal-card-text">FAC:</div>
            {player["FC Value"] || "N/A"}
          </div>
          <div className="player-info fc-rank">
            <div className="draft-modal-card-text">R:</div>
            {player.fcRankCalculated || "N/A"}
          </div>
        </>
      ) : (
        <>
          <div className="player-info ktc">
            {scoringType && scoringType.toLowerCase().includes("half_ppr")
              ? Math.round(player.pts_half_ppr ?? 0)
              : Math.round(player.pts_ppr ?? 0)}
            p
          </div>
          <div className="player-info ktc-rank">
            <div className="draft-modal-card-text">Pk:</div>
            {(() => {
              const currentPickNo = pick.pick_no;
              const currentPosition = player.position;
              if (!currentPosition || !currentPickNo) return "-";
              const draftPosRank = getDraftPosRank(picks, playerData, currentPickNo, currentPosition);
              return ` ${draftPosRank}`;
            })()}
          </div>
          <div className="player-info fc">
            {scoringType && scoringType.toLowerCase().includes("half_ppr")
              ? (player.pts_half_ppr / player.gp ?? 0).toFixed(1)
              : (isNaN(player.pts_ppr / player.gp) ? 0 : (player.pts_ppr / player.gp)).toFixed(1)}
            /g
          </div>
          <div className="player-info fc-rank">
            <div className="draft-modal-card-text">Pts:</div>
            {(() => {
              const position = player.position;
              if (!position) return "-";
              const posRank = scoringType?.toLowerCase().includes("half_ppr")
                ? player.pos_rank_half_ppr
                : player.pos_rank_ppr;
              return posRank ? `${posRank}` : "-";
            })()}
          </div>
        </>
      )}
      {isGoatActive && (
        <div className={`player-card-icon ${pick.isIconDimmed ? "dimmed" : ""}`}>
          {iconForPick(pick, draftType)}
        </div>
      )}
    </div>
  );

  if (!league) return null;

  return (
    <div className="draft-modal-overlay">
      <div className="draft-modal-content">
        {isLoading ? (
          <div className="center-content">
            <div className="spinner"></div> {/* Add spinner while loading */}
          </div>
        ) : (
          <>
            <div
              className="header-container"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              {/* New Pts/Ranks switch on the left */}
              <div
                className="pts-ranks-switch-container"
                style={{ display: "flex", alignItems: "center", gap: "10px" }}
              >
                <span style={{ fontWeight: 500, marginRight: 4 }}>Ranks</span>
                <label className="draft-modal-switch">
                  <input
                    type="checkbox"
                    id="pts-ranks-toggle"
                    checked={!isRanksMode}
                    onChange={(e) => setIsRanksMode(!e.target.checked)}
                  />
                  <span className="draft-modal-slider round"></span>
                </label>
                <span style={{ fontWeight: 500, marginLeft: 4 }}>Pts</span>
              </div>
              <h2
                className="league-title"
                style={{ flex: 1, textAlign: "center", margin: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: "0.75rem" }}
              >
                {league.name}
                {draftId && (
                  <span style={{ fontSize: "0.875rem", fontWeight: 400, color: "hsl(var(--muted-foreground))", fontFamily: "monospace" }}>
                    ID: {draftId}
                  </span>
                )}
                {draftId && (
                  <button
                    className="copy-draft-id-button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(draftId);
                      } catch (error) {
                        console.error("Failed to copy draft ID to clipboard:", error);
                        alert("Failed to copy draft ID to clipboard");
                      }
                    }}
                    title="Copy draft ID to clipboard"
                    style={{ 
                      background: "none", 
                      border: "none", 
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      padding: "0.25rem",
                      color: "hsl(var(--muted-foreground))"
                    }}
                  >
                    <FaCopy />
                  </button>
                )}
              </h2>
              <div
                className="switches-container"
                style={{ display: "flex", alignItems: "center" }}
              >
                <div className="switch-container">
                  <FontAwesomeIcon
                    icon={faSquare}
                    style={{ color: "green", marginRight: "5px" }}
                  />
                  <FontAwesomeIcon
                    icon={faSquare}
                    style={{ color: "red", marginRight: "10px" }}
                  />
                  <label className="draft-modal-switch">
                    <input
                      type="checkbox"
                      id="redgreen-toggle"
                      checked={isRedGreenActive}
                      onChange={handleRedGreenToggle}
                    />
                    <span className="draft-modal-slider round"></span>
                  </label>
                </div>

                <div className="switch-container">
                  <GiGoat
                    size={33}
                    style={{ marginLeft: "10px", marginRight: "10px" }}
                  />
                  <label className="draft-modal-switch">
                    <input
                      type="checkbox"
                      id="goat-toggle"
                      checked={isGoatActive}
                      onChange={handleGoatToggle}
                    />
                    <span className="draft-modal-slider round"></span>
                  </label>
                </div>
              </div>
            </div>
            <div className="team-buttons-container">
              {renderTeamButtons(draftOrder)}
            </div>

            <ResultsGrid
              playerResults={Array.isArray(playerResults) ? playerResults : []}
              isRedGreenActive={isRedGreenActive}
              isGoatActive={isGoatActive}
            />

            <div className="draftmodal-gridscroll">
            <div className="draftmodal-gridcontainer">
              {draftType ? (
                (() => {
                  const teamsCount = league.teams || 12;
                  const ordered = calculatePresentationOrder(
                    filteredPicks,
                    teamsCount,
                    draftType,
                    reversalRound
                  );
                  if (draftType !== "snake") {
                    return (
                      <div className="draftmodal-round-row draftmodal-round-left">
                        {ordered.map((pick) => {
                          if (!pick) return null;
                          const player = playerData[pick.player_id] || {};
                          const metadata = pick.metadata || {};
                          const round = Math.floor((pick.pick_no - 1) / teamsCount) + 1;
                          const pickInRound = ((pick.pick_no - 1) % teamsCount) + 1;
                          const formattedRank = `${round}.${pickInRound.toString().padStart(2, "0")}`;
                          return renderPlayerCard(pick, player, metadata, teamsCount, formattedRank);
                        })}
                      </div>
                    );
                  }
                  // Snake: group by round, then each row left- or right-aligned
                  const byRound = new Map();
                  ordered.forEach((pick) => {
                    if (!pick) return;
                    const round = Math.ceil(pick.pick_no / teamsCount);
                    if (!byRound.has(round)) byRound.set(round, []);
                    byRound.get(round).push(pick);
                  });
                  const rounds = [...byRound.entries()].sort((a, b) => a[0] - b[0]);
                  return rounds.map(([roundNum, roundPicks]) => {
                    const startsLeft = roundStartsLeft(roundNum, reversalRound);
                    const rowSlots = teamsCount;
                    const filled = roundPicks.length;
                    const emptyCount = rowSlots - filled;
                    const slotItems = startsLeft
                      ? [...roundPicks, ...Array(emptyCount).fill(null)]
                      : [...Array(emptyCount).fill(null), ...roundPicks];
                    return (
                      <div
                        key={roundNum}
                        className={`draftmodal-round-row ${startsLeft ? "draftmodal-round-left" : "draftmodal-round-right"}`}
                      >
                        {slotItems.map((pick, idx) => {
                          if (!pick) return <div key={`r${roundNum}-e${idx}`} className="draftmodal-slot-empty" aria-hidden="true" />;
                          const player = playerData[pick.player_id] || {};
                          const metadata = pick.metadata || {};
                          const round = Math.floor((pick.pick_no - 1) / teamsCount) + 1;
                          const pickInRound = ((pick.pick_no - 1) % teamsCount) + 1;
                          const formattedRank = `${round}.${pickInRound.toString().padStart(2, "0")}`;
                          return renderPlayerCard(pick, player, metadata, teamsCount, formattedRank);
                        })}
                      </div>
                    );
                  });
                })()
              ) : (
                <div className="center-content draft-modal-not-found-text">
                  No draft found
                </div>
              )}
            </div>
            </div>
          </>
        )}
        <button className="close-modal-button" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

DraftModal.propTypes = {
  league: PropTypes.shape({
    draft_id: PropTypes.string.isRequired,
    name: PropTypes.string,
    teams: PropTypes.number,
    draft_order: PropTypes.object,
  }), // Made league optional
  draftId: PropTypes.string.isRequired,
  userId: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
};

export default DraftModal;

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
import { FaTrashAlt } from "react-icons/fa";

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
                adjustedRankDifference += 2.5;
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

            const posRank = scoringType?.toLowerCase().includes("half_ppr")
              ? player.pos_rank_half_ppr
              : player.pos_rank_ppr;

            if (posRank) {
              const rankDifference = draftPosRank - posRank;

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
                  adjustedRankDifference += 2.5;
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
    const orderedPicks = [];

    for (let i = 0; i < picks.length; i++) {
      const round = Math.floor(i / teamsCount) + 1;
      const draftPosition = (i % teamsCount) + 1;
      const reverseDraftPosition = teamsCount - draftPosition + 1;

      let draftPositionInRound;

      if (draftType === "snake") {
        if (reversalRound && round === reversalRound) {
          draftPositionInRound = reverseDraftPosition;
        } else if (reversalRound && round > reversalRound) {
          if (round % 2 === 1) {
            draftPositionInRound = reverseDraftPosition;
          } else {
            draftPositionInRound = draftPosition;
          }
        } else {
          if (round % 2 === 1) {
            draftPositionInRound = draftPosition;
          } else {
            draftPositionInRound = reverseDraftPosition;
          }
        }

        const pick = picks.find(
          (pick, index) =>
            Math.floor(index / teamsCount) + 1 === round &&
            (index % teamsCount) + 1 === draftPositionInRound
        );

        orderedPicks.push(pick);
      } else {
        orderedPicks.push(picks[i]);
      }
    }

    return orderedPicks;
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
        const numPrior = filteredPicks.filter(
          (p) => {
            const pdata = playerData[p.player_id] || {};
            return (
              p.pick_no < currentPickNo &&
              pdata.position === currentPosition
            );
          }
        ).length;
        const draftPosRank = numPrior + 1;

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
          const numPrior = picks.filter(
            (p) => {
              const pdata = playerData[p.player_id] || {};
              return (
                p.pick_no < currentPickNo &&
                pdata.position === currentPosition
              );
            }
          ).length;
          const draftPosRank = numPrior + 1;

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
          const buttonLabel = uid === userId ? "Myself" : position;
          return (
            <button
              key={uid}
              className={`team-button ${
                selectedTeam === uid ? "selected" : ""
              }`}
              title={`Team ${position}`}
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
        const numPrior = filteredPicks.filter(
          (p) => {
            const pdata = playerData[p.player_id] || {};
            return (
              p.pick_no < pickNumber &&
              pdata.position === currentPosition
            );
          }
        ).length;
        const draftPosRank = numPrior + 1;

        const posRank = scoringType?.toLowerCase().includes("half_ppr")
          ? player.pos_rank_half_ppr
          : player.pos_rank_ppr;

        if (posRank) {
          const rankDifference = draftPosRank - posRank;

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
      }
    }

    return null;
  }

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
                style={{ flex: 1, textAlign: "center", margin: 0 }}
              >
                {league.name}
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

            <div className="draftmodal-gridcontainer">
              {draftType ? (
                calculatePresentationOrder(
                  filteredPicks,
                  league.teams || 12,
                  draftType,
                  reversalRound
                ).map((pick, index) => {
                  const player = playerData[pick.player_id] || {};
                  const metadata = pick.metadata || {};
                  const round = Math.floor(index / (league.teams || 12)) + 1;
                  const pickInRound = (index % (league.teams || 12)) + 1;
                  const formattedRank = `${round}.${pickInRound
                    .toString()
                    .padStart(2, "0")}`;

                  return (
                    <div
                      key={pick.pick_no}
                      className={`player-card ${
                        metadata.position?.toLowerCase() || "unknown"
                      }`}
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
                            (metadata.first_name ||
                              player.first_name ||
                              "Unknown") +
                            " " +
                            (metadata.last_name || player.last_name || "Player")
                          }
                        >
                          {metadata.first_name ||
                            player.first_name ||
                            "Unknown"}
                        </div>
                        <div
                          className="draftmodal-player-lastname autoshrink-text"
                          title={
                            (metadata.first_name ||
                              player.first_name ||
                              "Unknown") +
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
                            {scoringType &&
                            scoringType.toLowerCase().includes("half_ppr")
                              ? Math.round(player.pts_half_ppr ?? 0)
                              : Math.round(player.pts_ppr ?? 0)}
                            p
                          </div>
                          <div className="player-info ktc-rank">
                            Pk: 
                            {(() => {
                              const currentPickNo = pick.pick_no;
                              const currentPosition = player.position;
                              if (!currentPosition || !currentPickNo) return "-";
                              
                              // Calculate draft position rank
                              const numPrior = filteredPicks.filter(
                                (p) => {
                                  const pdata = playerData[p.player_id] || {};
                                  return (
                                    p.pick_no < currentPickNo &&
                                    pdata.position === currentPosition
                                  );
                                }
                              ).length;
                              const draftPosRank = numPrior + 1;

                              return ` ${draftPosRank}`;
                            })()}
                          </div>
                          <div className="player-info fc">
                          {scoringType &&
                            scoringType.toLowerCase().includes("half_ppr")
                              ? (player.pts_half_ppr / player.gp ?? 0).toFixed(1)
                              : (isNaN(player.pts_ppr / player.gp) ? 0 : (player.pts_ppr / player.gp)).toFixed(1)}
                              /g               
                         </div>
                          <div className="player-info fc-rank">
                            Pts: 
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
                        <div
                          className={`player-card-icon ${
                            pick.isIconDimmed ? "dimmed" : ""
                          }`}
                        >
                          {iconForPick(pick, draftType)}
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="center-content draft-modal-not-found-text">
                  No draft found
                </div>
              )}
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

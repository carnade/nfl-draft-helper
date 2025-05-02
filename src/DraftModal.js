import React, { useEffect, useState } from "react";
import PropTypes from "prop-types";
import "./DraftModal.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSquare } from "@fortawesome/free-regular-svg-icons";
import ResultsGrid from "./ResultsGrid";

// Add a mock flag
const mock = false; // Set to true for localhost, false for production

// Define the base URL based on the mock flag
const BASE_URL = mock
  ? "http://localhost:5000"
  : "https://shaggy-latashia-carnade-2ea2054a.koyeb.app";

function DraftModal({ league, draftId, onClose, userId }) {
  const [picks, setPicks] = useState([]);
  const [playerData, setPlayerData] = useState({});
  const [draftType, setDraftType] = useState(null);
  const [reversalRound, setReversalRound] = useState(null);
  const [draftOrder, setDraftOrder] = useState(null); // Added state for draftOrder
  const [playerResults, setPlayerResults] = useState({});

  useEffect(() => {
    if (league) {
      const fetchDraftDetails = async () => {
        try {
          const response = await fetch(
            `https://api.sleeper.app/v1/draft/${draftId}`
          );
          const data = await response.json();
          setDraftType(data.type);
          setReversalRound(data.settings.reversal_round);
          setDraftOrder(data.draft_order); // Set draftOrder from the response
        } catch (error) {
          console.error("Error fetching draft details:", error);
        }
      };

      fetchDraftDetails();
    }
  }, [league, draftId]); // Added 'draftId' as a dependency

  useEffect(() => {
    if (league) {
      const fetchPicks = async () => {
        try {
          const response = await fetch(
            `https://api.sleeper.app/v1/draft/${draftId}/picks`
          );
          const data = await response.json();
          setPicks(data);
        } catch (error) {
          console.error("Error fetching draft picks:", error);
        }
      };

      fetchPicks();
    }
  }, [league, draftId]); // Added 'draftId' as a dependency

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
          // Reversal round itself: reverse order
          draftPositionInRound = reverseDraftPosition;
        } else if (reversalRound && round > reversalRound) {
          // After the reversal round
          if (round % 2 === 1) {
            // Odd rounds after reversal: reverse order
            draftPositionInRound = reverseDraftPosition;
          } else {
            // Even rounds after reversal: normal order
            draftPositionInRound = draftPosition;
          }
        } else {
          // Before the reversal round or no reversal round
          if (round % 2 === 1) {
            // Odd rounds: normal order
            draftPositionInRound = draftPosition;
          } else {
            // Even rounds: reverse order
            draftPositionInRound = reverseDraftPosition;
          }
        }

        const pick = picks.find(
          (pick, index) =>
            Math.floor(index / teamsCount) + 1 === round &&
            (index % teamsCount) + 1 === draftPositionInRound
        );

        console.debug(
          `Round: ${round}, Draft Position: ${draftPosition}, Reverse Draft Position: ${reverseDraftPosition}, Draft Position In Round: ${draftPositionInRound}, Pick:`,
          pick
        );

        orderedPicks.push(pick);
      } else {
        // Linear draft
        orderedPicks.push(picks[i]);
      }
    }

    return orderedPicks;
  };

  const handleTeamButtonClick = (selectedUserId) => {
    const playerCards = document.querySelectorAll(".player-card");
    const isAlreadyFiltered =
      playerCards[0]?.style.backgroundColor === "transparent";

    if (isAlreadyFiltered) {
      // Reset all cards to their default background color
      playerCards.forEach((card) => {
        card.style.backgroundColor = "";
      });
    } else {
      // Filter cards based on the selected user ID
      playerCards.forEach((card) => {
        const pickedBy = card.getAttribute("data-picked-by");
        if (pickedBy !== selectedUserId) {
          card.style.backgroundColor = "transparent";
        } else {
          card.style.backgroundColor = ""; // Reset to default
        }
      });
    }
  };

  const renderTeamButtons = (draftOrder) => {
    if (!draftOrder || typeof draftOrder !== "object") {
      return <div>No draft order available</div>;
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
              className="team-button"
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

  useEffect(() => {
    const updateResultsGrid = () => {
      const redGreenToggle = document.getElementById("redgreen-toggle");
      if (!redGreenToggle.checked) {
        setPlayerResults({}); // Clear the results if toggle is off
        return;
      }

      const results = {}; // Object to store counts per user

      const playerCards = document.querySelectorAll(".player-card");
      playerCards.forEach((card) => {
        const pickedBy = card.getAttribute("data-picked-by");
        const borderColor = card.style.borderColor;

        if (!results[pickedBy]) {
          results[pickedBy] = { green: 0, red: 0 };
        }

        if (borderColor === "rgb(45, 222, 39)") {
          // Light green
          results[pickedBy].green++;
        } else if (borderColor === "red") {
          results[pickedBy].red++;
        }
      });

      setPlayerResults(results);
    };

    const redGreenToggle = document.getElementById("redgreen-toggle");

    redGreenToggle.addEventListener("change", (event) => {
      if (event.target.checked) {
        picks.forEach((pick) => {
          const player = playerData[pick.player_id] || {};
          const pickNumber = pick.pick_no;
          const ktcRank = player.ktcRankCalculated;
          const fcRank = player.fcRankCalculated;

          if (!isNaN(pickNumber) && !isNaN(ktcRank) && !isNaN(fcRank)) {
            const averageRank = (ktcRank + fcRank) / 2;
            const card = document.querySelector(
              `.player-card[data-pick-no='${pickNumber}']`
            );

            if (card) {
              if (pickNumber < averageRank) {
                card.style.border = "4px solid rgb(45, 222, 39)"; // Light green
              } else if (pickNumber > averageRank) {
                card.style.border = "4px solid red";
              } else {
                card.style.border = ""; // Reset border if equal
              }
            } else {
              console.warn(`Card not found for pick number: ${pickNumber}`);
            }
          }
        });
      } else {
        const playerCards = document.querySelectorAll(".player-card");
        playerCards.forEach((card) => {
          card.style.border = ""; // Reset border when toggle is off
        });
      }
      updateResultsGrid();
    });
  }, [picks, playerData]);

  if (!league) return null;

  return (
    <div className="draft-modal-overlay">
      <div className="draft-modal-content">
        <div className="header-container">
          <h2 className="league-title">{league.name}</h2>
          <div className="switches-container">
            <div className="switch-container">
              <FontAwesomeIcon
                icon={faSquare}
                style={{ color: "green", marginRight: "5px" }}
              />
              <FontAwesomeIcon
                icon={faSquare}
                style={{ color: "red", marginRight: "10px" }}
              />
              <label className="switch">
                <input type="checkbox" id="redgreen-toggle" />
                <span className="slider round"></span>
              </label>
            </div>

            <div className="switch-container">
              <label className="switch">
                <input type="checkbox" id="goat-toggle" />
                <span className="slider round"></span>
              </label>
              <label htmlFor="goat-toggle">Goat Toggle</label>
            </div>
          </div>
        </div>
        <div className="team-buttons-container">
          {renderTeamButtons(draftOrder, league.teams || 12)}
        </div>
        <div className="results-container">
          <ResultsGrid playerResults={playerResults} />
        </div>

        <div className="draftmodal-gridcontainer">
          {calculatePresentationOrder(
            picks,
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
              >
                <div className="pick-number">
                  {formattedRank} :{pick.pick_no}
                </div>
                <div className="draftmodal-player-name">
                  <div>
                    {metadata.first_name || player.first_name || "Unknown"}
                  </div>
                  <div>
                    {metadata.last_name || player.last_name || "Player"}
                  </div>
                </div>
                <div className="player-info ktc">
                  KTC: {player["KTC Value"] || "N/A"}
                </div>
                <div className="player-info ktc-rank">
                  R: {player.ktcRankCalculated || "N/A"}
                </div>
                <div className="player-info fc">
                  FAC: {player["FC Value"] || "N/A"}
                </div>
                <div className="player-info fc-rank">
                  R: {player.fcRankCalculated || "N/A"}
                </div>
              </div>
            );
          })}
        </div>
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
    name: PropTypes.string.isRequired,
    teams: PropTypes.number, // Added validation for 'teams'
    draft_order: PropTypes.object.isRequired, // Added validation for 'draft_order'
  }).isRequired,
  draftId: PropTypes.string.isRequired,
  userId: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
};

export default DraftModal;

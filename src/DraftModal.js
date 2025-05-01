import React, { useEffect, useState } from "react";
import PropTypes from "prop-types";
import "./DraftModal.css";

// Add a mock flag
const mock = false; // Set to true for localhost, false for production

// Define the base URL based on the mock flag
const BASE_URL = mock
  ? "http://localhost:5000"
  : "https://shaggy-latashia-carnade-2ea2054a.koyeb.app";

function DraftModal({ league, onClose }) {
  const [picks, setPicks] = useState([]);
  const [playerData, setPlayerData] = useState({});
  const [draftType, setDraftType] = useState(null);
  const [reversalRound, setReversalRound] = useState(null);

  useEffect(() => {
    if (league) {
      const fetchDraftDetails = async () => {
        try {
          const response = await fetch(
            `https://api.sleeper.app/v1/draft/${league.draft_id}`
            //`https://api.sleeper.app/v1/draft/1109079449594814464`
          );
          const data = await response.json();
          setDraftType(data.type);
          setReversalRound(data.settings.reversal_round);
        } catch (error) {
          console.error("Error fetching draft details:", error);
        }
      };

      fetchDraftDetails();
    }
  }, [league?.draft_id]); // Updated dependency array to avoid unnecessary re-renders

  useEffect(() => {
    if (league) {
      const fetchPicks = async () => {
        try {
          const response = await fetch(
            `https://api.sleeper.app/v1/draft/${league.draft_id}/picks`
            //`https://api.sleeper.app/v1/draft/1109079449594814464/picks`
          );
          const data = await response.json();
          setPicks(data);
        } catch (error) {
          console.error("Error fetching draft picks:", error);
        }
      };

      fetchPicks();
    }
  }, [league?.draft_id]); // Updated dependency array to avoid unnecessary re-renders

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

  if (!league) return null;

  return (
    <div className="draft-modal-overlay">
      <div className="draft-modal-content">
        <h2 className="league-title">{league.name}</h2>
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
  }).isRequired,
  onClose: PropTypes.func.isRequired,
};

export default DraftModal;

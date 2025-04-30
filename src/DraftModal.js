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

  useEffect(() => {
    if (league) {
      const fetchPicks = async () => {
        try {
          const response = await fetch(
            `https://api.sleeper.app/v1/draft/${league.draft_id}/picks`
          );
          const data = await response.json();
          setPicks(data);
        } catch (error) {
          console.error("Error fetching draft picks:", error);
        }
      };

      fetchPicks();
    }
  }, [league]);

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
        playersWithKTC.forEach((player) => {
          updatedData[player.sportradar_id] = {
            ...updatedData[player.sportradar_id],
            ktcRankCalculated: player.ktcRankCalculated,
          };
        });
        playersWithFC.forEach((player) => {
          updatedData[player.sportradar_id] = {
            ...updatedData[player.sportradar_id],
            fcRankCalculated: player.fcRankCalculated,
          };
        });
        return updatedData;
      });
    };

    calculateRanks();
  }, [playerData]);

  if (!league) return null;

  return (
    <div className="draft-modal-overlay">
      <div className="draft-modal-content">
        <h2>{league.name}</h2>
        <div className="grid-container">
          {picks.map((pick) => {
            const player = playerData[pick.player_id] || {};
            const metadata = pick.metadata || {};
            return (
              <div
                key={pick.pick_no}
                className={`player-card ${
                  metadata.position?.toLowerCase() || "unknown"
                }`}
                style={{
                  display: "grid",
                  gridTemplateAreas: "'name team' 'ktc ktc-rank' 'fc fc-rank'",
                  gridTemplateColumns: "1fr auto",
                  gridTemplateRows: "auto auto auto",
                  gap: "5px",
                }}
              >
                <div
                  className="player-name"
                  style={{
                    gridArea: "name",
                    color: "inherit",
                    textAlign: "left",
                  }}
                >
                  <div>
                    {metadata.first_name || player.first_name || "Unknown"}
                  </div>
                  <div>
                    {metadata.last_name || player.last_name || "Player"}
                  </div>
                </div>
                <div
                  className="player-team"
                  style={{
                    gridArea: "team",
                    color: "inherit",
                    textAlign: "right",
                  }}
                >
                  {metadata.team || player.team || "N/A"}
                </div>
                <div
                  className="player-info"
                  style={{
                    gridArea: "ktc",
                    color: "inherit",
                    textAlign: "left",
                  }}
                >
                  KTC: {player["KTC Value"] || "N/A"}
                </div>
                <div
                  className="player-info"
                  style={{
                    gridArea: "ktc-rank",
                    color: "inherit",
                    textAlign: "right",
                  }}
                >
                  R: {player.ktcRankCalculated || "N/A"}
                </div>
                <div
                  className="player-info"
                  style={{
                    gridArea: "fc",
                    color: "inherit",
                    textAlign: "left",
                  }}
                >
                  FC: {player["FC Value"] || "N/A"}
                </div>
                <div
                  className="player-info"
                  style={{
                    gridArea: "fc-rank",
                    color: "inherit",
                    textAlign: "right",
                  }}
                >
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
  }).isRequired,
  onClose: PropTypes.func.isRequired,
};

export default DraftModal;

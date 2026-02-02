import React, { useEffect, useState, useCallback } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faExternalLinkAlt,
  faSyncAlt,
  faTableCells,
} from "@fortawesome/free-solid-svg-icons";
import { useParams } from "react-router-dom";
import { Link } from "react-router-dom";
import DraftModal from "./DraftModal";
import "./DraftsList.css";

function DraftPage() {
  const { userName } = useParams();
  const [userId, setUserId] = useState(null);
  const [drafts, setDrafts] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedLeague, setSelectedLeague] = useState(null);
  const [draftIdInput, setDraftIdInput] = useState("");
  const [positionCounts, setPositionCounts] = useState({}); // draft_id -> {QB: 1, RB: 2, ...}

  const formatMilliseconds = (milliseconds) => {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const seconds = totalSeconds % 60;
    const totalMinutes = Math.floor(totalSeconds / 60);
    const minutes = totalMinutes % 60;
    const hours = Math.floor(totalMinutes / 60);

    let formattedTime = "";

    if (hours > 0) {
      formattedTime += `${hours}h `;
    }

    if (minutes > 0) {
      formattedTime += `${minutes}min `;
    }

    if (seconds > 0 || formattedTime === "") {
      formattedTime += `${seconds}s`;
    }

    return formattedTime.trim();
  };

  const formatPositionCounts = (counts) => {
    if (!counts) return "";
    
    const parts = [];
    if (counts.QB > 0) {
      parts.push(
        <React.Fragment key="qb">
          <span className="position-label qb">QB</span>
          <span className="position-count">: {counts.QB}</span>
        </React.Fragment>
      );
    }
    if (counts.RB > 0) {
      parts.push(
        <React.Fragment key="rb">
          {parts.length > 0 && <span className="position-separator"> - </span>}
          <span className="position-label rb">RB</span>
          <span className="position-count">: {counts.RB}</span>
        </React.Fragment>
      );
    }
    if (counts.WR > 0) {
      parts.push(
        <React.Fragment key="wr">
          {parts.length > 0 && <span className="position-separator"> - </span>}
          <span className="position-label wr">WR</span>
          <span className="position-count">: {counts.WR}</span>
        </React.Fragment>
      );
    }
    if (counts.TE > 0) {
      parts.push(
        <React.Fragment key="te">
          {parts.length > 0 && <span className="position-separator"> - </span>}
          <span className="position-label te">TE</span>
          <span className="position-count">: {counts.TE}</span>
        </React.Fragment>
      );
    }
    if (counts.P > 0) {
      parts.push(
        <React.Fragment key="p">
          {parts.length > 0 && <span className="position-separator"> - </span>}
          <span className="position-label p">P</span>
          <span className="position-count">: {counts.P}</span>
        </React.Fragment>
      );
    }
    
    return parts.length > 0 ? parts : "";
  };

  const calcPicksToDraft = (
    picksCount,
    draftPosition,
    teams,
    type,
    reversalRound,
    max_rounds
  ) => {
    let picksToDraft;
    if (type === "linear") {
      // Linear draft logic
      if (picksCount % teams >= draftPosition) {
        picksToDraft = teams - (picksCount % teams) + draftPosition - 1;
      } else {
        picksToDraft = draftPosition - (picksCount % teams) - 1;
      }
      return picksToDraft;
    }

    if (type !== "snake") {
      // If not a snake draft, we'll assume a simple linear draft for now
      if (picksCount % teams > draftPosition) {
        picksToDraft = draftPosition + (teams - picksCount);
      } else {
        picksToDraft = draftPosition - (picksCount % teams);
      }
      return picksToDraft;
    }

    const round = Math.floor((picksCount - 1) / teams) + 1; // Calculate the current round

    let draftPositionInRound;
    let reverseDraftPosition = teams - draftPosition + 1;

    if (reversalRound === 3) {
      if (round < reversalRound) {
        // Before the reversal round
        if (round % 2 === 1) {
          // Odd rounds: normal order
          draftPositionInRound = draftPosition;
        } else {
          // Even rounds: reverse order
          draftPositionInRound = reverseDraftPosition;
        }
      } else if (round === reversalRound) {
        // Reversal round itself: reverse order
        draftPositionInRound = reverseDraftPosition;
      } else {
        // After the reversal round
        if (round % 2 === 1) {
          // Odd rounds after reversal: reverse order
          draftPositionInRound = reverseDraftPosition;
        } else {
          // Even rounds after reversal: normal order
          draftPositionInRound = draftPosition;
        }
      }
    } else {
      if (round % 2 === 1) {
        // Odd rounds: normal order
        draftPositionInRound = draftPosition;
      } else {
        // Even rounds: reverse order
        draftPositionInRound = reverseDraftPosition;
      }
    }

    // Calculate how many picks are left until it's the user's turn
    const picksInCurrentRound = ((picksCount - 1) % teams) + 1;
    console.log("round", round);
    console.log("picksInCurrentRound", picksInCurrentRound);
    console.log("draftPositionInRound", draftPositionInRound);
    if (picksInCurrentRound >= draftPositionInRound) {
      if (round === max_rounds) {
        return -99;
      }
      const nextPos =
        draftPositionInRound === draftPosition
          ? reverseDraftPosition
          : draftPosition;
      picksToDraft = teams - picksInCurrentRound + nextPos - 1;
    } else {
      picksToDraft = draftPositionInRound - picksInCurrentRound - 1;
    }

    return picksToDraft;
  };

  const fetchUserData = useCallback(async () => {
    try {
      // First API request to get user data
      const userResponse = await fetch(
        `https://api.sleeper.app/v1/user/${userName}`
      );
      const userData = await userResponse.json();
      const userId = userData.user_id;
      setUserId(userId);

      // Second API request to get draft data using user_id
      if (userId) {
        const draftsResponse = await fetch(
          `https://api.sleeper.app/v1/user/${userId}/drafts/nfl/2026`
        );
        const draftsData = await draftsResponse.json();

        // Extracting relevant draft information and fetch additional data
        const filteredDrafts = draftsData.filter(
          (draft) => draft.status === "drafting" || draft.status === "paused"
        );

        // First, fetch all picks data for position counting
        const picksPromises = filteredDrafts.map(async (draft) => {
          const picksResponse = await fetch(
            `https://api.sleeper.app/v1/draft/${draft.draft_id}/picks`
          );
          const picksData = await picksResponse.json();
          return {
            draftId: draft.draft_id,
            picks: picksData,
          };
        });
        const allPicksData = await Promise.all(picksPromises);

        // Calculate position counts only for picks the user has made
        const positionCountsMap = {};
        allPicksData.forEach(({ draftId, picks }) => {
          const counts = { QB: 0, RB: 0, WR: 0, TE: 0, P: 0 };
          
          // Filter picks to only include those made by the current user
          const userPicks = picks.filter((pick) => pick.picked_by === userId);
          
          userPicks.forEach((pick) => {
            // Position is in pick.metadata.position
            const position = pick.metadata?.position;
            if (position === "QB") counts.QB++;
            else if (position === "RB") counts.RB++;
            else if (position === "WR") counts.WR++;
            else if (position === "TE") counts.TE++;
            else if (position === "P" || position === "P/K" || position === "K") counts.P++;
          });
          
          positionCountsMap[draftId] = counts;
        });

        setPositionCounts(positionCountsMap);

        // Now fetch draft details and process
        const relevantDraftsPromises = filteredDrafts.map(async (draft) => {
            const draftId = draft.draft_id;

            // Fetch additional draft details
            const draftDetailsResponse = await fetch(
              `https://api.sleeper.app/v1/draft/${draftId}`
            );
            const draftDetails = await draftDetailsResponse.json();

            // Extract the draft position for the user
            const draftPosition = draftDetails.draft_order[userId];
            const { reversal_round, pick_timer, teams } = draftDetails.settings;

            // Get picks count from already fetched data
            const picksData = allPicksData.find(p => p.draftId === draftId)?.picks || [];
            const picksCount = picksData.length;

            const picksToDraft = calcPicksToDraft(
              picksCount,
              draftPosition,
              teams,
              draft.type,
              reversal_round,
              draftDetails.settings.rounds
            );
            const currentClock = formatMilliseconds(
              pick_timer * 1000 - (Date.now() - draftDetails.last_picked)
            );

            return {
              draft_id: draft.draft_id,
              scoring_type: draft.metadata.scoring_type,
              elapsed_pick_timer: draft.metadata.elapsed_pick_timer,
              type: draft.type,
              status: draft.status,
              name: draft.metadata.name,
              is_autopaused: draft.metadata.is_autopaused,
              last_picked: draftDetails.last_picked,
              draftPosition,
              reversal_round,
              pick_timer,
              teams,
              picksCount,
              picksToDraft,
              currentClock,
            };
          });

        let relevantDrafts = await Promise.all(relevantDraftsPromises);

        // Sort by picksToDraft
        relevantDrafts = relevantDrafts.sort(
          (a, b) => a.picksToDraft - b.picksToDraft
        );

        setDrafts(relevantDrafts);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    }
  }, [userName]);

  const handleRefresh = () => {
    // Re-fetch the data without changing the username
    fetchUserData();
  };

  // Ensure `league` object has all required properties in `handleOpenModal`
  const handleOpenModal = (draft = null) => {
    if (draft) {
      console.log("Opening modal with draft:", draft);
      setSelectedLeague({
        draft_id: draft.draft_id,
        name: draft.name || "Unknown League", // Ensure name is set
        teams: draft.teams || 12,
        draft_order: draft.draft_order || {},
      });
      setIsModalOpen(true);
    } else if (draftIdInput.trim()) {
      console.log("Opening modal with draftIdInput:", draftIdInput.trim());
      setSelectedLeague({
        draft_id: draftIdInput.trim(),
        name: "Unknown League", // Default name for input-based modal
        teams: 12, // Default teams value
        draft_order: {}, // Default empty draft order
      });
      setIsModalOpen(true);
    } else {
      console.error("Draft ID input is empty or invalid");
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedLeague(null);
  };

  useEffect(() => {
    fetchUserData();
  }, [userName, fetchUserData]);

  return (
    <div className="draft-container">
      <div className="draftname">
        <h1>Drafts Overview</h1>
        <span>{userName}</span>
      </div>
      <div className="button-container">
        <button onClick={handleRefresh} className="refresh-button">
          <FontAwesomeIcon icon={faSyncAlt} /> Refresh
        </button>
        <div className="input-container">
          <input
            type="text"
            placeholder="Enter Draft ID"
            value={draftIdInput}
            onChange={(e) => setDraftIdInput(e.target.value)}
            className="draft-id-input"
          />
          <div className="draftlist-input-icon">
            <FontAwesomeIcon
              icon={faTableCells}
              className="calendar-icon"
              onClick={() => handleOpenModal({ draft_id: draftIdInput.trim() })} // Pass draftIdInput explicitly
            />
          </div>
        </div>
      </div>
      <div className="draft-grid">
        <div className="draft-grid-header">Name</div>
        <div className="draft-grid-header">Drafted Positions</div>
        <div className="draft-grid-header">Picks Before You</div>
        <div className="draft-grid-header">Round</div>
        <div className="draft-grid-header">Current Clock</div>
        <div className="draft-grid-header">Links</div>
        {drafts.length > 0
          ? drafts.map((draft, index) => (
              <React.Fragment key={index}>
                <div className="draft-grid-item draft-grid-name">
                  {draft.name}
                </div>
                <div className="draft-grid-item draft-grid-positions">
                  {formatPositionCounts(positionCounts[draft.draft_id])}
                </div>
                <div className="draft-grid-item">
                  {draft.picksToDraft === 0 ? (
                    <span className="highlight-green">
                      It&apos;s your turn to pick!
                    </span>
                  ) : draft.picksToDraft === -99 ? (
                    <span className="highlight-red">
                      Your last pick is made!
                    </span>
                  ) : (
                    draft.picksToDraft
                  )}
                </div>
                <div className="draft-grid-item">
                  {Math.floor((draft.picksCount - 1) / draft.teams) + 1}
                </div>
                <div className="draft-grid-item">
                  {draft.status === "paused" ? (
                    <span className="highlight-red">Paused</span>
                  ) : (
                    draft.currentClock
                  )}
                </div>
                <div className="draft-grid-item">
                  <a
                    href={`https://sleeper.app/draft/nfl/${draft.draft_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="draft-grid-link"
                  >
                    <FontAwesomeIcon icon={faExternalLinkAlt} />
                  </a>
                  <Link
                    to={`/drafthelper/${draft.draft_id}`}
                    state={{ scoringType: draft.scoring_type }}
                  >
                    <span>{draft.metadatascoring_type}</span>
                    <img
                      src="/favicon.ico"
                      alt="Icon"
                      className="draft-grid-icon"
                    />
                  </Link>
                  <FontAwesomeIcon
                    icon={faTableCells}
                    className="league-action-icon"
                    onClick={() => handleOpenModal(draft)} // Ensure the draft object is passed correctly
                  />
                  <span hidden>{userId}</span>
                </div>
              </React.Fragment>
            ))
          : null}
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
    </div>
  );
}

export default DraftPage;

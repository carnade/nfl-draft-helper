import React, { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faExternalLinkAlt } from "@fortawesome/free-solid-svg-icons";

function DraftPage({ userName }) {
  const [userId, setUserId] = useState(null);
  const [drafts, setDrafts] = useState([]);

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

  const calcPicksToDraft = (picksCount, draftPosition, teams, type, reversalRound) => {
    let picksToDraft;
    if (type !== "snake") {
      // If not a snake draft, we'll assume a simple linear draft for now
      if ((picksCount % teams) > draftPosition) {
        picksToDraft = draftPosition + (teams - picksCount)
      } else {
        picksToDraft = draftPosition - (picksCount % teams)
      }
      return picksToDraft;
    };
  
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

    if (picksInCurrentRound > draftPositionInRound) {
      const nextPos = draftPositionInRound === draftPosition ? reverseDraftPosition : draftPosition;
      picksToDraft = teams - picksInCurrentRound + nextPos - 1;
    } else {
      picksToDraft = draftPositionInRound - picksInCurrentRound - 1;
    }

    return picksToDraft;
  };

  useEffect(() => {
    const fetchUserData = async () => {
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
            `https://api.sleeper.app/v1/user/${userId}/drafts/nfl/2024`
          );
          const draftsData = await draftsResponse.json();

          // Extracting relevant draft information and fetch additional data
          const relevantDraftsPromises = draftsData
            .filter((draft) => draft.status === "drafting" || draft.status === "paused")
            .map(async (draft) => {
              const draftId = draft.draft_id;

              // Fetch additional draft details
              const draftDetailsResponse = await fetch(
                `https://api.sleeper.app/v1/draft/${draftId}`
              );
              const draftDetails = await draftDetailsResponse.json();

              // Extract the draft position for the user
              const draftPosition = draftDetails.draft_order[userId];
              const { reversal_round, pick_timer, teams } = draftDetails.settings;

              // Fetch picks count
              const picksResponse = await fetch(
                `https://api.sleeper.app/v1/draft/${draftId}/picks`
              );
              const picksData = await picksResponse.json();
              const picksCount = picksData.length;

              const picksToDraft = calcPicksToDraft(picksCount, draftPosition, teams, draft.type, reversal_round);
              const currentClock = formatMilliseconds((pick_timer * 1000) - (Date.now() - draftDetails.last_picked));

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
                currentClock
              };
            });

          let relevantDrafts = await Promise.all(relevantDraftsPromises);

          // Sort by picksToDraft
          relevantDrafts = relevantDrafts.sort((a, b) => a.picksToDraft - b.picksToDraft);

          setDrafts(relevantDrafts);

        }
      } catch (error) {
        console.error("Error fetching data:", error);
      }
    };

    fetchUserData();
  }, [userName]);

  return (
    <div className="draft-container">
      <div className="draftname">
        <h1>Drafts Overview</h1>
        <span>{userName}</span>
      </div>
      <div className="draft-grid">
        <div className="draft-grid-header">Name</div>
        <div className="draft-grid-header">Picks Before You</div>
        <div className="draft-grid-header">Round</div>
        <div className="draft-grid-header">Current Clock</div>
        <div className="draft-grid-header">Links</div>
        {drafts.length > 0 ? (
          drafts.map((draft, index) => (
            <React.Fragment key={index}>
              <div className="draft-grid-item draft-grid-name">{draft.name}</div>
              <div className="draft-grid-item">
                {draft.picksToDraft === 0 ? (
                  <span className="highlight-green">It's your turn to pick!</span>
                ) : (
                  draft.picksToDraft
                )}
              </div>
              <div className="draft-grid-item">{Math.floor((draft.picksCount-1) / draft.teams) + 1}</div>
              <div className="draft-grid-item">
                {draft.status === "paused" ? (
                  <span className="highlight-red">Paused</span>
                ) : (
                  draft.currentClock
                )}
              </div>
              <div className="draft-grid-item">
                <a href={`https://sleeper.app/draft/nfl/${draft.draft_id}`} target="_blank" rel="noopener noreferrer">
                  <FontAwesomeIcon icon={faExternalLinkAlt} />
                </a>
                <img src="/favicon.ico" alt="Icon" className="draft-grid-icon" />
                <span hidden>{userId}</span>
              </div>
            </React.Fragment>
          ))
        ) : (
          <div className="draft-grid-item">No drafts found.</div>
        )}
      </div>
    </div>
  );
}

export default DraftPage;

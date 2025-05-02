import React from "react";
import PropTypes from "prop-types";
import "./ResultsGrid.css";

function ResultsGrid({ playerResults }) {
  return (
    <div className="results-grid">
      {Object.entries(playerResults).map(([userId, counts]) => (
        <div className="player-results" key={userId}>
          <div className="flex-center">
            <div className="css-square css-square-green">{counts.green}</div>
            <div className="css-square css-square-red">{counts.red}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

ResultsGrid.propTypes = {
  playerResults: PropTypes.object.isRequired,
};

export default ResultsGrid;

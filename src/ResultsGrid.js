import React from "react";
import PropTypes from "prop-types";
import {
  GiGoat,
  GiAmericanFootballPlayer,
  GiAmericanFootballHelmet,
  GiSheep,
  GiTurd,
} from "react-icons/gi";
import { FaTrashAlt } from "react-icons/fa";
import { TbArrowsLeftRight } from "react-icons/tb";
import "./ResultsGrid.css";

function ResultsGrid({ playerResults, isRedGreenActive, isGoatActive }) {
  const results = Array.isArray(playerResults) ? playerResults : [];

  return (
    <div className="results-container">
      {isRedGreenActive && (
        <div className="results-grid-redgreen">
          {results.map((result, index) => (
            <div key={index} className="player-results-redgreen">
              <div className="result-square green">{result.green}</div>
              <div className="result-square red">{result.red}</div>
            </div>
          ))}
        </div>
      )}

      {isGoatActive && (
        <div className="results-grid-goat">
          {results.map((result, index) => (
            <div key={index} className="player-results-goat">
              <div className="result-row">
                <div className="result-icon golden">
                  <GiGoat size={33} />
                </div>
                <div className="result-square green1">{result.goat}</div>
                <div className="result-square red1">{result.turd}</div>
                <div className="result-icon brown">
                  <GiTurd size={33} />
                </div>
              </div>

              <div className="result-row">
                <div className="result-icon">
                  <GiAmericanFootballPlayer size={28} />
                </div>
                <div className="result-square green2">{result.hero}</div>
                <div className="result-square red2">{result.horrible}</div>
                <div className="result-icon">
                  <FaTrashAlt size={28} />
                </div>
              </div>

              <div className="result-row">
                <div className="result-icon">
                  <GiAmericanFootballHelmet size={25} />
                </div>
                <div className="result-square green3">{result.decent}</div>
                <div className="result-square red3">{result.bad}</div>
                <div className="result-icon">
                  <GiSheep size={25} />
                </div>
              </div>

              <div className="result-row">
                <div className="result-icon">
                  <TbArrowsLeftRight size={36} />
                </div>
                <div className="result-square grey">{result.neutral}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

ResultsGrid.propTypes = {
  playerResults: PropTypes.array.isRequired,
  isRedGreenActive: PropTypes.bool.isRequired,
  isGoatActive: PropTypes.bool.isRequired,
};

export default ResultsGrid;

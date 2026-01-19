import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./DraftSetup.css";

function DraftSetup({ setCsvData, setCsvFileName, isRankingsPage }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedOption, setSelectedOption] = useState("adp_2qb.csv"); // Set default value
  const navigate = useNavigate();

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      setSelectedFile(file);
      // Automatically start with the selected CSV file
      const reader = new FileReader();
      reader.onload = (e) => {
        const csvData = e.target.result;
        setCsvData(csvData); // Passing CSV data
        if (isRankingsPage) {
          navigate("/rankings");
        } else {
          navigate("/drafthelper"); // Navigate to /draft
        }
      };
      reader.readAsText(file);
    }
  };


  const handlePresetClick = (optionValue) => {
    setSelectedOption(optionValue);
    setCsvData("");
    setCsvFileName(optionValue); // Use default CSV data
    if (isRankingsPage) {
      navigate("/rankings");
    } else {
      navigate("/drafthelper"); // Navigate to /draft
    }
  };

  const presetOptions = [
    { value: "adp_ppr.csv", label: "Sleeper PPR" },
    { value: "adp_2qb.csv", label: "Sleeper SF" },
    { value: "adp_half_ppr.csv", label: "Sleeper half-PPR" },
    { value: "adp_dynasty_ppr.csv", label: "Sleeper Dynasy PPR" },
    { value: "adp_dynasty_2qb.csv", label: "Sleeper Dynasy SF" },
    { value: "adp_dynasty_half_ppr.csv", label: "Sleeper Dynasty half-PPR" },
    { value: "adp_rookies.csv", label: "Rookies" },
  ];

  return (
    <div className="start-page">
      {isRankingsPage ? (
        <h1>Create Rankings Setup</h1>
      ) : (
        <h1>Draft Helper Setup</h1>
      )}
      <hr className="separator" />
      
      <div className="setup-section">
        <h3>Use Preset Rankings</h3>
        <div className="preset-list-container">
          {presetOptions.map((option) => (
            <div
              key={option.value}
              className={`preset-option ${selectedOption === option.value ? "selected" : ""}`}
              onClick={() => handlePresetClick(option.value)}
            >
              {option.label}
            </div>
          ))}
        </div>
      </div>

      <div className="setup-section">
        <h3>Load Custom Rankings</h3>
        <div className="file-input-container">
          <label htmlFor="file-input" className="file-input-label">
            <span>Start with CSV</span>
            <input
              type="file"
              accept=".csv"
              id="file-input"
              style={{ display: "none" }}
              onChange={handleFileChange}
            />
          </label>
        </div>
      </div>
    </div>
  );
}

export default DraftSetup;

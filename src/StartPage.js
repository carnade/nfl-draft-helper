import React, { useState } from "react";

function StartPage({
  onStartWithCSV,
  onStartDefault,
  useTierForOverall,
  setUseTierForOverall,
}) {
  const [selectedFile, setSelectedFile] = useState(null);

  const handleFileChange = (event) => {
    setSelectedFile(event.target.files[0]);
  };

  const handleStartWithCSV = () => {
    if (selectedFile) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const csvData = e.target.result;
        onStartWithCSV(csvData, useTierForOverall);
      };
      reader.readAsText(selectedFile);
    } else {
      alert("Please select a CSV file.");
    }
  };

  const handleStartDefault = () => {
    onStartDefault(useTierForOverall);
  };

  const handleButtonClick = () => {
    document.getElementById("file-input").click(); // Trigger the file input click
  };

  return (
    <div className="start-page">
      <h1>Welcome to the Draft Helper App</h1>
      <div className="file-input-container">
        <input
          type="file"
          accept=".csv"
          id="file-input"
          style={{ display: "none" }}
          onChange={handleFileChange}
        />
        <button
          type="button"
          onClick={handleButtonClick}
          className="load-csv-button"
        >
          Load CSV
        </button>
        {selectedFile && <span className="file-name">{selectedFile.name}</span>}
      </div>
      <div className="action-buttons">
        <button
          onClick={handleStartWithCSV}
          disabled={!selectedFile}
          className={!selectedFile ? "disabled-button" : ""}
        >
          Start with CSV
        </button>
        <button onClick={handleStartDefault}>Start Default</button>
      </div>

      <div className="checkbox-container">
        <input
          type="checkbox"
          id="use-tier-checkbox"
          checked={useTierForOverall}
          onChange={() => setUseTierForOverall(!useTierForOverall)}
        />
        <label htmlFor="use-tier-checkbox">
          Use own tier for overall list (add OverallTier column to your CSV)
        </label>
      </div>
      <p></p>
      <div>
        CSV uses format same as www.cheatsheetking.com. It has the following
        headers
      </div>
      <div>
        Overall Rank,Name,Position,Team,Bye,Position Rank,Tier,OverallTier
      </div>
      <p></p>
      <div>
        The last column(OverallTier) is optional but can be used if one wants to
        manually set tiers for the overall list.{" "}
      </div>
    </div>
  );
}

export default StartPage;

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

function StartPage({
  setCsvData,
  setCsvFileName,
  useTierForOverall,
  setUseTierForOverall,
  userName,
  setUserName,
}) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedOption, setSelectedOption] = useState("original.csv"); // Set default value
  const navigate = useNavigate();

  const handleLoadCsvClick = () => {
    document.getElementById("file-input").click(); // Trigger the file input click
  };

  const handleDropdownChange = (event) => {
    setSelectedOption(event.target.value);
  };

  const handleFileChange = (event) => {
    setSelectedFile(event.target.files[0]);
  };

  const handleCheckDrafts = () => {
    navigate("/drafts");
  };

  const handleCheckLeagues = () => {
    navigate("/leagues"); // Navigate to /leagues
  };

  const handleDownloadCSV = () => {
    if (!selectedOption.endsWith(".csv")) {
      alert("Please select a valid CSV file.");
      return;
    }

    const link = document.createElement("a");
    link.href = `/path/to/your/csv/files/${selectedOption}`; // Replace with the actual path to your files
    link.download = selectedOption;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleStartWithCSV = () => {
    if (selectedFile) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const csvData = e.target.result;
        setCsvData(csvData); // Passing CSV data
        navigate("/drafthelper"); // Navigate to /draft
      };
      reader.readAsText(selectedFile);
    } else {
      alert("Please select a CSV file.");
    }
  };

  const handleStartDefault = () => {
    setCsvFileName(selectedOption); // Use default CSV data
    navigate("/drafthelper"); // Navigate to /draft
  };

  return (
    <div className="start-page">
      <h1>Welcome to the Draft Helper App</h1>
      <hr className="separator" />
      <h2>Tier based draft tool</h2>
      <div className="file-input-container">
        <div className="file-input-button">
          <button
            onClick={handleStartWithCSV}
            disabled={!selectedFile} // Disable button until a file is selected
          >
            Start with CSV
          </button>
        </div>
        <label htmlFor="file-input" className="file-input-label">
          <button type="button" onClick={handleLoadCsvClick}>
            Load CSV
          </button>
        </label>
        <input
          type="file"
          accept=".csv"
          id="file-input"
          style={{ display: "none" }}
          onChange={handleFileChange}
        />

        {selectedFile && <span className="file-name">{selectedFile.name}</span>}
      </div>
      <div className="action-buttons">
        <button onClick={handleStartDefault}>Start preset ranks</button>
        <select
          value={selectedOption}
          onChange={handleDropdownChange}
          className="modern-dropdown"
        >
          <option value="original.csv">Cheatsheet king rankings</option>
          <option value="redraft_ppr_adp.csv">Sleeper PPR</option>
          <option value="redraft_sf_adp.csv">Sleeper SF</option>
          <option value="redraft_half_ppr_adp.csv">Sleeper half-PPR</option>
          <option value="dynasty_ppr_adp.csv">Sleeper Dynasy PPR</option>
          <option value="dynasty_sf_adp.csv">Sleeper Dynasy SF</option>
          <option value="dynasty_half_ppr_adp.csv">
            Sleeper Dynasty half-PPR
          </option>
        </select>
        <button onClick={handleDownloadCSV}>Download CSV</button>
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
      <hr className="separator" />
      <h2>Draft list with pick timers</h2>
      <div className="base-container">
        <input
          type="text"
          value={userName}
          onChange={(e) => setUserName(e.target.value)} // Update userName state
          placeholder="Name"
          className="modern-input"
        />
        <button onClick={handleCheckDrafts} className="modern-button">
          Check Drafts
        </button>
        <button onClick={handleCheckLeagues} className="modern-button">
          Check Leagues
        </button>
      </div>
    </div>
  );
}

export default StartPage;

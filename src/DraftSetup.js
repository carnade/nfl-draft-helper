import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./DraftSetup.css";

function DraftSetup({ setCsvData, setCsvFileName, isRankingsPage }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedOption, setSelectedOption] = useState("adp_2qb.csv"); // Set default value
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
        if (isRankingsPage) {
          navigate("/rankings");
        } else {
          navigate("/drafthelper"); // Navigate to /draft
        }
      };
      reader.readAsText(selectedFile);
    } else {
      alert("Please select a CSV file.");
    }
  };

  const handleStartDefault = () => {
    setCsvData("");
    setCsvFileName(selectedOption); // Use default CSV data
    if (isRankingsPage) {
      navigate("/rankings");
    } else {
      navigate("/drafthelper"); // Navigate to /draft
    }
  };

  return (
    <div className="start-page">
      {isRankingsPage ? (
        <h1>Create Rankings setup</h1>
      ) : (
        <h1>Draft helper setup</h1>
      )}
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
          <option value="adp_ppr.csv">Sleeper PPR</option>
          <option value="adp_2qb.csv">Sleeper SF</option>
          <option value="adp_half_ppr.csv">Sleeper half-PPR</option>
          <option value="adp_dynasty_ppr.csv">Sleeper Dynasy PPR</option>
          <option value="adp_dynasty_2qb.csv">Sleeper Dynasy SF</option>
          <option value="adp_dynasty_half_ppr.csv">
            Sleeper Dynasty half-PPR
          </option>
          <option value="adp_rookies.csv">Rookies</option>
        </select>
        <button onClick={handleDownloadCSV}>Download CSV</button>
      </div>
      <p></p>
    </div>
  );
}

export default DraftSetup;

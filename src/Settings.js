import React, { useState, useEffect, useContext } from "react";
import { ThemeContext } from "./ThemeContext";
import "./Settings.css";

function Settings() {
  // New state for standard username
  const [username, setUsername] = useState("");

  // Existing states
  const [defaultRankings, setDefaultRankings] = useState({
    dynasty_sf: { name: "default", data: "" },
    dynasty_ppr: { name: "default", data: "" },
    dynasty_half_ppr: { name: "default", data: "" },
    redraft_sf: { name: "default", data: "" },
    redraft_ppr: { name: "default", data: "" },
    redraft_half_ppr: { name: "default", data: "" },
  });

  const { theme, setTheme } = useContext(ThemeContext);

  useEffect(() => {
    const saved = localStorage.getItem("FantasyHelperSettings");
    if (saved) {
      const parsed = JSON.parse(saved);
      // Restore username if present
      if (parsed.username) {
        setUsername(parsed.username);
      }
      // Restore defaultRankings if present
      if (parsed.defaultRankings) {
        setDefaultRankings(parsed.defaultRankings);
      }
    }
  }, []);

  const handleFileChange = (rankingKey, event) => {
    if (!event.target.files || event.target.files.length === 0) return;
    const file = event.target.files[0];
    // 1MB size limit
    if (file.size > 1_000_000) {
      alert("File exceeds 1MB limit. Please choose a smaller file.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const fileContent = e.target.result;
      setDefaultRankings((prev) => ({
        ...prev,
        [rankingKey]: { name: file.name, data: fileContent },
      }));
    };
    reader.readAsText(file);
  };

  const handleChooseClick = (rankingKey) => {
    document.getElementById(`file-input-${rankingKey}`).click();
  };

  /**
   * Resets all ranking keys to { name: "default", data: "" }
   * and sets theme back to "light", or any other defaults you prefer.
   */
  const handleResetDefaults = () => {
    setDefaultRankings({
      dynasty_sf: { name: "default", data: "" },
      dynasty_ppr: { name: "default", data: "" },
      dynasty_half_ppr: { name: "default", data: "" },
      redraft_sf: { name: "default", data: "" },
      redraft_ppr: { name: "default", data: "" },
      redraft_half_ppr: { name: "default", data: "" },
    });
    setUsername("");
    alert("Settings reset to defaults (REMEMBER to save).");
  };

  const handleSave = () => {
    // Include the new username in the object
    const settingsToSave = { username, defaultRankings };
    localStorage.setItem(
      "FantasyHelperSettings",
      JSON.stringify(settingsToSave)
    );
    console.log("Settings saved:", settingsToSave);
    alert("Settings saved!");
  };

  const handleThemeToggle = () => {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
  };

  return (
    <div className={`settings-container ${theme}`}>
      <h1>Settings</h1>
      <hr className="separator" />

      <div className="settings-container">
        {/* NEW: Standard Username Field */}
        <div className="settings-field">
          <label htmlFor="standard-username">Standard username:</label>
          <input
            className="standard-username"
            id="standard-username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Default username"
          />
        </div>
        <div className="separator-field">
          <hr className="separator" />
        </div>
        <div className="settings-field">
          <label>Default rankings</label>
        </div>

        {/* Rankings grid */}
        <div className="rankings-grid">
          {/* 1) Dynasty SF */}
          <div className="ranking-row">
            <div className="ranking-label">Dynasty SF</div>
            <div className="ranking-file">
              {defaultRankings.dynasty_sf.name}
              <input
                type="file"
                accept=".csv"
                id="file-input-dynasty_sf"
                style={{ display: "none" }}
                onChange={(e) => handleFileChange("dynasty_sf", e)}
              />
            </div>
            <button onClick={() => handleChooseClick("dynasty_sf")}>
              Choose
            </button>
          </div>
          {/* 2) Dynasty PPR */}
          <div className="ranking-row">
            <div className="ranking-label">Dynasty PPR</div>
            <div className="ranking-file">
              {defaultRankings.dynasty_ppr.name}
              <input
                type="file"
                accept=".csv"
                id="file-input-dynasty_ppr"
                style={{ display: "none" }}
                onChange={(e) => handleFileChange("dynasty_ppr", e)}
              />
            </div>
            <button onClick={() => handleChooseClick("dynasty_ppr")}>
              Choose
            </button>
          </div>
          {/* 3) Dynasty Half-PPR */}
          <div className="ranking-row">
            <div className="ranking-label">Dynasty Half-PPR</div>
            <div className="ranking-file">
              {defaultRankings.dynasty_half_ppr.name}
              <input
                type="file"
                accept=".csv"
                id="file-input-dynasty_half_ppr"
                style={{ display: "none" }}
                onChange={(e) => handleFileChange("dynasty_half_ppr", e)}
              />
            </div>
            <button onClick={() => handleChooseClick("dynasty_half_ppr")}>
              Choose
            </button>
          </div>
          {/* 4) Redraft SF */}
          <div className="ranking-row">
            <div className="ranking-label">Redraft SF</div>
            <div className="ranking-file">
              {defaultRankings.redraft_sf.name}
              <input
                type="file"
                accept=".csv"
                id="file-input-redraft_sf"
                style={{ display: "none" }}
                onChange={(e) => handleFileChange("redraft_sf", e)}
              />
            </div>
            <button onClick={() => handleChooseClick("redraft_sf")}>
              Choose
            </button>
          </div>
          {/* 5) Redraft PPR */}
          <div className="ranking-row">
            <div className="ranking-label">Redraft PPR</div>
            <div className="ranking-file">
              {defaultRankings.redraft_ppr.name}
              <input
                type="file"
                accept=".csv"
                id="file-input-redraft_ppr"
                style={{ display: "none" }}
                onChange={(e) => handleFileChange("redraft_ppr", e)}
              />
            </div>
            <button onClick={() => handleChooseClick("redraft_ppr")}>
              Choose
            </button>
          </div>
          {/* 6) Redraft Half-PPR */}
          <div className="ranking-row">
            <div className="ranking-label">Redraft Half-PPR</div>
            <div className="ranking-file">
              {defaultRankings.redraft_half_ppr.name}
              <input
                type="file"
                accept=".csv"
                id="file-input-redraft_half_ppr"
                style={{ display: "none" }}
                onChange={(e) => handleFileChange("redraft_half_ppr", e)}
              />
            </div>
            <button onClick={() => handleChooseClick("redraft_half_ppr")}>
              Choose
            </button>
          </div>
        </div>
        <div className="separator-field">
          <hr className="separator" />
        </div>

        <div className="settings-field">
          <label>Dark Mode:</label>
          <div className="theme-toggle-wrapper" onClick={handleThemeToggle}>
            <div className={`theme-toggle ${theme}`}>
              <div className="toggle-circle">
                {theme === "light" ? (
                  <span className="sun-icon">☀️</span>
                ) : (
                  <span className="moon-icon">🌙</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Two buttons in one row: "Reset to Defaults" (red, left) & "Save" (right) */}
        <div className="settings-actions">
          <button className="reset-button" onClick={handleResetDefaults}>
            Reset to Defaults
          </button>
          <button className="save-button" onClick={handleSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

export default Settings;

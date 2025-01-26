import React, { useState, useEffect } from "react";
import "./Settings.css";

function Settings() {
  const [theme, setTheme] = useState("light");
  const [defaultRankings, setDefaultRankings] = useState({
    dynasty_sf: { name: "default", data: "" },
    dynasty_ppr: { name: "default", data: "" },
    dynasty_half_ppr: { name: "default", data: "" },
    redraft_sf: { name: "default", data: "" },
    redraft_ppr: { name: "default", data: "" },
    redraft_half_ppr: { name: "default", data: "" },
  });

  useEffect(() => {
    const saved = localStorage.getItem("FantasyHelperSettings");
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.defaultRankings) {
        setDefaultRankings(parsed.defaultRankings);
      }
      if (parsed.theme) {
        setTheme(parsed.theme);
      }
    }
  }, []);

  const handleFileChange = (rankingKey, event) => {
    if (!event.target.files || event.target.files.length === 0) return;
    const file = event.target.files[0];
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
    setTheme("light");
    alert("Settings reset to defaults (not yet saved).");
  };

  const handleSave = () => {
    const settingsToSave = { defaultRankings, theme };
    localStorage.setItem(
      "FantasyHelperSettings",
      JSON.stringify(settingsToSave)
    );
    console.log("Settings saved:", settingsToSave);
    alert("Settings saved!");
  };

  return (
    <div className="start-page">
      <h1>Settings</h1>
      <hr className="separator" />

      <div className="settings-container">
        <hr className="separator" />
        <div className="settings-field">
          <label htmlFor="theme-select">Default rankings</label>
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
          <label htmlFor="theme-select">Theme:</label>
          <select
            id="theme-select"
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
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

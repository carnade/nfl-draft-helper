import React, { useEffect } from "react";
import "./StartPage.css";

function StartPage({ userName, setUserName }) {
  // On first render only, if userName is empty, load from localStorage
  useEffect(() => {
    // We only run this effect once (empty deps),
    // so it won't overwrite changes after initial load.
    if (!userName) {
      const saved = localStorage.getItem("FantasyHelperSettings");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.username) {
          setUserName(parsed.username);
        }
      }
    }
  }, []); // <-- empty dependency array so it runs only on mount

  return (
    <div className="start-page">
      <h1>Welcome to the NFL Fantasy Helper</h1>
      <img
        src="/fantasy_football.jpg"
        alt="NFL Fantasy Helper Logo"
        className="logo"
      />
      <hr className="separator" />

      <div className="base-container">
        <h3>Please enter your sleeper username</h3>
        <input
          type="text"
          value={userName}
          onChange={(e) => setUserName(e.target.value)}
          placeholder="Name"
          className="modern-input"
        />
      </div>
    </div>
  );
}

export default StartPage;

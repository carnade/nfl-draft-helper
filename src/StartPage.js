import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./StartPage.css";

function StartPage({ userName, setUserName }) {
  return (
    <div className="start-page">
      <h1>Welcome to the NFL Fantasy Helper</h1>
      <img
        src="/nflhelper_logo.png"
        alt="NFL Fantasy Helper Logo"
        className="logo"
      />
      <hr className="separator" />

      <div className="base-container">
        <h3>Please enter your sleeper username</h3>
        <input
          type="text"
          value={userName}
          onChange={(e) => setUserName(e.target.value)} // Update userName state
          placeholder="Name"
          className="modern-input"
        />
      </div>
    </div>
  );
}

export default StartPage;

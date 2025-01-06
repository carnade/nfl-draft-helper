// LeftMenu.js
import React, { useState } from "react";
import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBars, faTimes } from "@fortawesome/free-solid-svg-icons";

function LeftMenu({ userName, setUserName }) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div className={`left-menu ${isCollapsed ? "collapsed" : ""}`}>
      <div className="menu-header">
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="menu-toggle"
        >
          <FontAwesomeIcon icon={isCollapsed ? faBars : faTimes} />
        </button>
        {!isCollapsed && <h2>Menu</h2>}
      </div>
      {!isCollapsed && (
        <div className="menu-content">
          <div className="user-input">
            <label htmlFor="user-name">User Name</label>
            <input
              type="text"
              id="user-name"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="Enter your name"
            />
          </div>
          <ul className="menu-links">
            <li>
              <Link to="/drafts">Drafts</Link>
            </li>
            <li>
              <Link to="/lineups">Lineups & Injuries</Link>
            </li>
            <li>
              <Link to="/bestball">Bestball</Link>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}

export default LeftMenu;

// LeftMenu.js
import React, { useState } from "react";
import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faFlaskVial,
  faMedal,
  faFootball,
  faStopwatch,
  faLayerGroup,
  faHouse,
  faBars,
  faTimes,
} from "@fortawesome/free-solid-svg-icons";
import "./LeftMenu.css";

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
        {!isCollapsed && <h2 className="menu-title">Menu</h2>}
      </div>

      {!isCollapsed && (
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
      )}

      <ul className="menu-links">
        <li>
          <Link to={`/`} className="menu-link">
            <FontAwesomeIcon icon={faHouse} className="menu-icon" />
            <span>Home</span>
          </Link>
        </li>
        <li>
          <Link to={`/rankingssetup`} className="menu-link">
            <FontAwesomeIcon icon={faFlaskVial} className="menu-icon" />
            <span>Create Rankings</span>
          </Link>
        </li>
        <li>
          <Link to={`/draftsetup`} className="menu-link">
            <FontAwesomeIcon icon={faStopwatch} className="menu-icon" />
            <span>Draft Helper</span>
          </Link>
        </li>
        <li>
          <Link
            to={userName ? `/drafts/${userName}` : "/"}
            className="menu-link"
          >
            <FontAwesomeIcon icon={faLayerGroup} className="menu-icon" />
            <span>Draft List</span>
          </Link>
        </li>
        <li>
          <Link
            to={userName ? `/leagues/${userName}` : "/"}
            className="menu-link"
          >
            <FontAwesomeIcon icon={faFootball} className="menu-icon" />
            <span>Leagues</span>
          </Link>
        </li>
        <li>
          <Link
            to={userName ? `/bestball/${userName}` : "/"}
            className="menu-link"
          >
            <FontAwesomeIcon icon={faMedal} className="menu-icon" />
            <span>Bestball</span>
          </Link>
        </li>
      </ul>
    </div>
  );
}

export default LeftMenu;

// LeftMenu.js
import React, { useState, useEffect } from "react";
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
  faScroll,
  faCog, // <-- import the cog icon
  faArrowRightArrowLeft,
  faDollarSign,
} from "@fortawesome/free-solid-svg-icons";
import "./LeftMenu.css";

function LeftMenu({ userName, setUserName }) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [unreadChangelog, setUnreadChangelog] = useState(false);

  // Manually update this timestamp when you want the changelog to be considered "updated".
  // Edit this constant in the source and deploy/build to change the value.
  const MANUAL_LAST_UPDATED = "2025-10-08T00:00:00.000Z";

  const checkUnread = () => {
    try {
      const lastUpdated = localStorage.getItem("last_updated_changelog");
      const lastRead = localStorage.getItem("last_read_changelog");
      if (!lastUpdated) {
        setUnreadChangelog(false);
        return;
      }
      const u = new Date(lastUpdated);
      const r = lastRead ? new Date(lastRead) : null;
      setUnreadChangelog(!r || u > r);
    } catch (e) {
      setUnreadChangelog(false);
    }
  };

  useEffect(() => {
    // Ensure the runtime knows the package's last-updated changelog timestamp.
    try {
      localStorage.setItem("last_updated_changelog", MANUAL_LAST_UPDATED);
    } catch (e) {}
    checkUnread();
    const onStorage = () => checkUnread();
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

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
        <li>
          <Link to="/trade-analyzer" className="menu-link">
            <FontAwesomeIcon icon={faArrowRightArrowLeft} className="menu-icon" />
            <span>Trade Helper</span>
          </Link>
        </li>
        <li>
          <Link to="/dfs" className="menu-link">
            <FontAwesomeIcon icon={faDollarSign} className="menu-icon" />
            <span>DFS</span>
          </Link>
        </li>

        <li className="bottom-link">
          <Link to={`/changelog`} className="menu-link" aria-label="Changelog">
            <FontAwesomeIcon icon={faScroll} className="menu-icon" />
            <span>Changelog</span>
            {unreadChangelog && <span className="news-badge">News!</span>}
          </Link>
        </li>

        {/* ADD SETTINGS LINK AT THE BOTTOM */}
        <li className="settings-link">
          <Link to="/settings" className="menu-link">
            <FontAwesomeIcon icon={faCog} className="menu-icon" />
            <span>Settings</span>
          </Link>
        </li>
      </ul>
    </div>
  );
}

export default LeftMenu;

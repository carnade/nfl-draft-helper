import React, { useEffect } from "react";
import "./Changelog.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faScroll } from "@fortawesome/free-solid-svg-icons";

function ChangelogEntry({ date, title, items }) {
  return (
    <div className="changelog-entry">
      <div className="changelog-date">{date}</div>
      <h3 className="changelog-title">{title}</h3>
      <ul className="changelog-list">
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </div>
  );
}

export default function Changelog() {
  // Example entries — add new entries as needed
  const entries = [
    {
      date: "2025-09-01",
      title: "First changelog and Stats & Bestball improvements",
      items: [
        "Added Draft Position column to Bestball table and cached draft order in localStorage",
        "Cached usernames for owners under 'sleeperUserMap' to reduce API calls",
        "Added Stats tab with Head-to-Head checker and other stats",
        "Added a owners box to the leage page to check what leagues the owners are in",
      ],
    },
  ];

  return (
    <div className="changelog-page">
      <div className="changelog-header">
        <FontAwesomeIcon icon={faScroll} className="changelog-icon" />
        <div>
          <h2>Changelog</h2>
          <div className="changelog-sub">Recent changes and notes</div>
        </div>
      </div>

      <div className="changelog-entries">
        {entries.map((e, idx) => (
          <ChangelogEntry
            key={idx}
            date={e.date}
            title={e.title}
            items={e.items}
          />
        ))}
      </div>

      <div className="changelog-help">
        <h4>Adding entries</h4>
        <p>
          To add a changelog entry, add an object to the <code>entries</code>
          array in <code>src/Changelog.js</code>. Each entry has a{" "}
          <code>date</code>,<code>title</code>, and <code>items</code> (an array
          of bullet strings).
        </p>
      </div>
    </div>
  );
}

// When the user opens the changelog page we should mark it as read
// Use a side-effect so mount writes last_read_changelog
export function ChangelogWithReadMark() {
  useEffect(() => {
    try {
      localStorage.setItem("last_read_changelog", new Date().toISOString());
      // Dispatch a storage event for same-tab listeners
      window.dispatchEvent(new Event("storage"));
    } catch (e) {}
  }, []);
  return <Changelog />;
}

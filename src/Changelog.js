import React, { useEffect } from "react";
import "./Changelog.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faScroll } from "@fortawesome/free-solid-svg-icons";

function ChangelogEntry({ date, title, items }) {
  const renderItem = (item) => {
    if (typeof item === 'string') {
      return item;
    }
    // If item is an object with text and subitems
    if (item.text && item.subitems) {
      return (
        <>
          {item.text}
          <ul className="changelog-sublist">
            {item.subitems.map((subitem, j) => (
              <li key={j}>{subitem}</li>
            ))}
          </ul>
        </>
      );
    }
    return item;
  };

  return (
    <div className="changelog-entry">
      <div className="changelog-date">{date}</div>
      <h3 className="changelog-title">{title}</h3>
      <ul className="changelog-list">
        {items.map((it, i) => (
          <li key={i}>{renderItem(it)}</li>
        ))}
      </ul>
    </div>
  );
}

export default function Changelog() {
  // Example entries — add new entries as needed
  const entries = [
    {
      date: "2025-10-21",
      title: "DFS & League Page Enhancements",
      items: [
        {
          text: "DFS (Daily Fantasy Sports) - New Feature:",
          subitems: [
            "Build your DFS lineup with salary cap management ($50,000 cap)",
            "Live player data with weekly projections, salaries, and matchup info",
            "Advanced filters: salary range slider, team dropdown, position buttons, and player name search",
            "Visual roster builder with color-coded position badges",
            "Smart availability tracking - automatically disable players when positions are full or over salary cap",
            "Generate shareable lineup codes for competition tracking",
            "Results page to compare multiple lineups side-by-side with actual fantasy points",
            "Automatic ranking and podium medals (gold/silver/bronze) for top performers",
            "Week toggle to view results for current or previous week",
          ]
        },
        {
          text: "League Page Improvements:",
          subitems: [
            "Added FPTS/G (Fantasy Points Per Game) column showing season average",
            "Added Proj Pts column with this week's projected fantasy points",
            "Added DvP (Defense vs Position) column showing opponent defensive rank with ordinal suffixes",
            "Color-coded matchups: red for favorable (1st-10th), green for tough (22nd-32nd)",
            "Reordered columns to prioritize weekly performance data over dynasty values",
          ]
        },
      ],
    },
    {
      date: "2025-10-07",
      title: "Trade Helper",
      items: [
        "Search and add players or draft picks to both sides of a trade",
        "Compare dynasty values using KTC and FantasyCalc rankings",
        "Analyze projected vs actual 2025 points per game",
        "View average team age and see which side wins each metric",
        "Automatic league info display showing which teams own the players",
      ],
    },
    {
      date: "2025-09-01",
      title: "First changelog and Stats & Bestball improvements",
      items: [
        "Added Draft Position column to Bestball table",
        "Added owner names in Bestball table",
        "Added Stats tab with Head-to-Head checker and other stats",
        "Added a owners box to the leage page to check what leagues the owners are in",
        "Fuzzy search for players on league page",
      ],
    },
  ];

  return (
    <div className="changelog-page">
      <div className="changelog-header">
        <FontAwesomeIcon icon={faScroll} className="changelog-icon" />
        <div>
          <h2>Changelog</h2>
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

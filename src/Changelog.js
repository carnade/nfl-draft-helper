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
      date: "2025-12-09",
      title: "DFS PIN Codes & Reveal Updates",
      items: [
        {
          text: "PIN-protected lineups",
          subitems: [
            "Optional PIN (2-8 digits) when saving a lineup to tinyurl; validation enforces digits-only and minimum length when loading",
            "Load flow shows PIN-gated lineups in green; prompts for PIN and calls the data endpoint with username + pin",
            "Finish-lineup modal PIN input allows empty or 2-8 digits; load PIN modal requires 2+ digits"
          ]
        },
        {
          text: "Reveal & pre-game masking",
          subitems: [
            "Players whose games have not started are masked as TBD (name/salary/points hidden) with the same styling as pre-reveal",
            "Fallback TBD guard ensures players stay hidden until kickoff even if partial data arrives",
            "DST position is normalized so masking works while keeping the brown DST color"
          ]
        }
      ],
    },
    {
      date: "2025-11-13",
      title: "DFS League Management & Results Improvements",
      items: [
        {
          text: "DFS Results Page:",
          subitems: [
            "Added 'Your Leagues' section at the top showing all leagues you're a member of with quick navigation links",
            "Fixed results display to show all user submissions from leagues, not just one entry",
            "Added submission status indicator in Total Points column (green for Submitted, red for Not submitted) when reveal time hasn't passed",
          ]
        },
        {
          text: "DFS Lineup Submission:",
          subitems: [
            "Added ability to submit your DFS lineup to leagues you're a member of directly from the lineup modal",
            "View available leagues with submission status (green for new submission, yellow for overwrite existing)",
            "Confirmation modal when overwriting existing lineup data",
            "Load previously submitted lineups from your leagues in the 'Load Lineup' modal",
          ]
        },
        {
          text: "TinyURL Creation:",
          subitems: [
            "Support for creating leagues with mix of users who have submitted and users who haven't",
            "Default reveal time set to upcoming Sunday at 19:00 with clear button to remove",
          ]
        }
      ],
    },
    {
      date: "2025-11-06",
      title: "DFS Day Filter",
      items: [
        "Added day filter buttons to DFS page - filter players by game day (Thursday, Sunday, Monday, etc.)",
      ],
    },
    {
      date: "2025-10-25",
      title: "DFS Lineup Loading & Injury Filters",
      items: [
        "Added 'Load Lineup' button to DFS page - paste lineup codes to instantly load players",
        "Support for both formats: 'Username:Code' and raw lineup codes",
        "Added injury status filters: 'Hide Out' and 'Hide Questionable' toggles",
      ],
    },
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

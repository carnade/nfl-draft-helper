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
      date: "2026-07-01",
      title: "Odds Results Tab",
      items: [
        {
          text: "New Results tab on the Odds page:",
          subitems: [
            "Shows historical games with the betting lines that were available before kickoff",
            "Displays the final score, moneyline winner, and the actual over/under total",
            "Highlights whether our implied-total edge prediction was correct (green) or incorrect (red)",
            "Push outcomes are shown neutrally",
          ],
        },
      ],
    },
    {
      date: "2026-06-28",
      title: "Gameday Page & Improved DvP",
      items: [
        {
          text: "New Gameday page (football icon in the menu):",
          subitems: [
            "Shows your weekly matchup projections across all your dynasty and redraft leagues",
            "Summary header shows your predicted record for the week (e.g. 7W / 3L)",
            "Your projected score is always on the left, highlighted green if predicted to win or red if predicted to lose",
            "Leagues are grouped into Dynasty and Redraft sections",
            "Toggle between a card view and a list view",
            "Requires logging in via Settings with your Sleeper account",
          ],
        },
        {
          text: "Defense vs Position (DvP) on the Leagues page now uses stats-based data:",
          subitems: [
            "Ranks are now position-specific (separate rankings for QB, RB, WR, TE) based on fantasy points allowed this season",
            "Hover over any DvP value to see the last-5-game rolling rank",
          ],
        },
      ],
    },
    {
      date: "2026-06-28",
      title: "Odds Page",
      items: [
        {
          text: "New Odds page for tracking weekly betting opportunities:",
          subitems: [
            "Game Lines tab: view spread, total, and moneyline for each matchup, with an edge indicator comparing the book total to our own implied total",
            "Player Props tab: browse player prop lines (passing yards, rushing yards, receiving yards, anytime TD) alongside the best available over/under price across books",
            "Props include a 5-game rolling average per stat, with a value flag highlighting lines that deviate meaningfully from recent performance",
            "Filter props by position (QB/RB/WR/TE) and market type, or show value-flagged props only",
          ],
        },
        "Betting rules and recommendations are not yet active (off-season) but will be introduced when the season begins",
      ],
    },
    {
      date: "2026-05-25",
      title: "Stats Page & Sleeper Account Login",
      items: [
        {
          text: "New Stats page:",
          subitems: [
            "Browse live NFL player stats for the current season, filterable by position",
            "Receiver efficiency metrics (Target Share, Air Yards Share, WOPR, RACR) shown for WR, TE, and RB",
            "Toggle between season totals and per-game averages",
            "Team view with offensive efficiency across the league, with color-coded team badges",
            "Click a team to drill down and see all players on that roster",
          ],
        },
        {
          text: "Optional Sleeper account login (Settings):",
          subitems: [
            "Connect your Sleeper account with username and password or SMS verification",
            "When logged in as the active username, pending waiver claims appear in the Leagues page alongside completed and failed transactions",
            "Cancelled waiver claims are filtered out and not shown",
            "The pending count (P:) in the league summary is only visible when logged in",
          ],
        },
        "Waiver rows now show the date on the left for easier scanning",
      ],
    },
    {
      date: "2026-03-28",
      title: "Draft Helper Grid View",
      items: [
        {
          text: "New grid board view in Draft Helper:",
          subitems: [
            "Toggle between the standard position list view and a 12-wide draft board showing all picks round by round",
            "Each row shows one complete round — the same layout you'd see at a live draft table",
            "Drafted players appear greyed out on the board instead of disappearing, so you can see which slots are filled",
            "Click a greyed-out player to undraft them",
          ],
        },
        "Grid view supports both Snake and 3RR (Third Round Reversal) draft formats, with a toggle to switch between them",
        "3RR pick order correctly follows the format: round 1 forward, round 2 reversed, round 3 stays reversed, then snakes normally from round 4",
      ],
    },
    {
      date: "2026-02-02",
      title: "Create Rankings from Drafts, League Filters & Year Update",
      items: [
        {
          text: "Create Rankings from Drafts (Create Rankings Setup):",
          subitems: [
            "New section: enter one or more draft IDs (comma-separated), Add Drafts, then Compile Rankings to build rankings from average ADP across drafts",
            "Draft names from Sleeper draft metadata (no separate league API call)",
            "'My Leagues' dropdown: fetch your leagues for the current year (from Sleeper state endpoint, fallback 2026), then add a draft from the dropdown",
            "When compiling: position tiers use 5 players per tier; overall list tiers unchanged (12 per tier)",
          ]
        },
        "Draft Modal: draft ID and copy-to-clipboard icon shown next to the league title",
        {
          text: "League list:",
          subitems: [
            "'Dynasty only' checkbox (default on) filters leagues by Sleeper settings.type === 2",
          ]
        },
        {
          text: "Trade Helper:",
          subitems: [
            "Panel titles swapped: left box titled 'User gets', right box 'Trade Partner gets'; logic and league-info column unchanged",
          ]
        },
        "Year 2025 → 2026 across Trade Analyzer, Drafts List, League List, Bestball, and Create Rankings Setup (DEFAULT_LEAGUE_YEAR constant)",
        "Draft/Rankings Setup: preset options no longer show a selected state; clicking a preset navigates immediately",
        {
          text: "UI updates:",
          subitems: [
            "Create Rankings: player buttons use a single glassmorphism style (gradient, backdrop blur, colored border) for all positions at medium opacity",
            "League list: injured-player indicator is custom cross.png (medical cross) at 1.1rem, aligned with surrounding text",
            "Setup pages: preset choices no longer display a highlighted/selected style",
          ]
        },
      ],
    },
    {
      date: "2025-12-18",
      title: "Bestball & Tournament Enhancements",
      items: [
        {
          text: "Bestball Overview:",
          subitems: [
            "Added 'Behind 1st' column showing points difference from first place",
            "Shows positive value (+X) when in first place (points ahead of 2nd), negative value (X) when not in first (points behind 1st)",
            "Leagues sorted within each position by 'Behind 1st' value (closest to 1st first, except position 1 sorted by furthest ahead first)"
          ]
        },
        {
          text: "Tournament Creation:",
          subitems: [
            "Added league source selection: choose between manually entering Sleeper League IDs or selecting from 'My Own Leagues'",
            "'My Own Leagues' option fetches and displays your bestball leagues from Sleeper with a two-box selector interface",
            "Participant count now uses an input field allowing any number, with a quick-select dropdown for common values (2, 4, 8, 16, 32, 64)",
            "H2H mode automatically enforces even numbers only and adjusts participant count when switching from PTS mode"
          ]
        }
      ],
    },
    {
      date: "2025-12-15",
      title: "Tournament Feature",
      items: [
        {
          text: "Tournament Management:",
          subitems: [
            "View list of all tournaments with name, week, and participant count",
            "Create new tournaments with custom matchups between players from different Sleeper leagues",
            "Two-step creation process: first paste league IDs to load league data, then select matchups",
            "Select tournament week (current or next week)",
            "Choose number of participants in powers of 2 (2, 4, 8, 16, 32, or 64)",
            "Players sorted by total points with rankings (1#, 2#, etc.) in dropdown selections"
          ]
        },
        {
          text: "Tournament Results:",
          subitems: [
            "View tournament results with matchup-by-matchup point comparisons",
            "See league names, player rankings, usernames, and points for each matchup",
            "Results calculated using optimal lineup based on league roster settings and Sleeper matchup data"
          ]
        }
      ],
    },
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

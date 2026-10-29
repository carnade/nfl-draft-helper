// The Trade Helper page: two tabs over one trade.
//
// The Trade Helper prices a trade; the Player Finder finds the players to put
// in one. They are tabs rather than separate pages because the whole point is
// to move between them repeatedly while building a single offer.
//
// Both tabs stay mounted and the inactive one is hidden with CSS. That is a
// deliberate departure from the conditional-render tab pattern elsewhere in
// this app (BestballList, LeagueList): the Trade Helper keeps the trade in
// component state and refetches Sleeper's projections on mount, so unmounting
// it would empty the trade and refire those requests every time the Finder was
// opened — which, since players are usually added a few at a time, is the
// normal flow rather than an edge case.

import React, { useRef, useState } from "react";

import "./TradeHelperPage.css";
import TradeAnalyzer from "./TradeAnalyzer";
import PlayerFinder from "./PlayerFinder";

const TABS = [
  { id: "trade", label: "Trade Helper" },
  { id: "finder", label: "Player Finder" },
];

function TradeHelperPage({ userName, setUserName }) {
  const [activeTab, setActiveTab] = useState("trade");
  const trade = useRef(null);

  // Added to the other party's side, and the tab deliberately does not change:
  // several players are usually picked in a row, and jumping away after each
  // one would mean navigating back for the next.
  const addToTheirSide = (row) => {
    trade.current?.addPlayerById(row.id, "team2");
  };

  return (
    <div className="trade-helper-page">
      <h1>Trade Helper</h1>

      <div className="thp-tabs" role="tablist" aria-label="Trade Helper sections">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`thp-tab-${tab.id}`}
            aria-selected={activeTab === tab.id}
            aria-controls={`thp-panel-${tab.id}`}
            className={`thp-tab${activeTab === tab.id ? " thp-tab-on" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div
        id="thp-panel-trade"
        role="tabpanel"
        aria-labelledby="thp-tab-trade"
        className={activeTab === "trade" ? "" : "thp-hidden"}
      >
        <TradeAnalyzer ref={trade} userName={userName} setUserName={setUserName} />
      </div>

      <div
        id="thp-panel-finder"
        role="tabpanel"
        aria-labelledby="thp-tab-finder"
        className={activeTab === "finder" ? "" : "thp-hidden"}
      >
        <PlayerFinder onAddPlayer={addToTheirSide} />
      </div>
    </div>
  );
}

export default TradeHelperPage;

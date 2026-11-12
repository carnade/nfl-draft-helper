// The Trade Helper page: two tabs over one trade.
//
// The Trade Helper prices a trade; the Player Finder finds the players to put
// in one. They are tabs rather than separate pages because the whole point is
// to move between them repeatedly while building a single offer.
//
// All three tabs stay mounted and the inactive ones are hidden with CSS. That
// is a deliberate departure from the conditional-render tab pattern elsewhere
// in this app (BestballList, LeagueList): the Trade Helper keeps the trade in
// component state and refetches Sleeper's projections on mount, so unmounting
// it would empty the trade and refire those requests every time the Finder was
// opened — which, since players are usually added a few at a time, is the
// normal flow rather than an edge case.
//
// The cost of that choice is that a mounted tab fetches whether or not anyone
// looks at it, and the Contender Helper's horizon of weekly projections is far
// too expensive to download for a tab nobody opened. So it is told whether it
// is the active one and waits to be asked — see the note in ContenderTab.js.

import React, { useRef, useState } from "react";
import { useLocation } from "react-router-dom";

import "./TradeHelperPage.css";
import TradeAnalyzer from "./TradeAnalyzer";
import PlayerFinder from "./PlayerFinder";
import ContenderTab from "./ContenderTab";

const TABS = [
  { id: "trade", label: "Trade Helper" },
  { id: "finder", label: "Player Finder" },
  { id: "contender", label: "Contender Helper" },
];

function TradeHelperPage({ userName, setUserName }) {
  const location = useLocation();
  // A shared trade links straight to the tab that can read it. Read once, so
  // moving between tabs afterwards is not fought by the URL it arrived on.
  const [activeTab, setActiveTab] = useState(() => {
    const wanted = new URLSearchParams(location.search).get("tab");
    return TABS.some((tab) => tab.id === wanted) ? wanted : "trade";
  });
  const trade = useRef(null);

  // `team2` is the "<user> gets..." panel — what the trade brings in. The tab
  // deliberately does not change: several players are usually picked in a row,
  // and jumping away after each one would mean navigating back for the next.
  const addIncoming = (row) => {
    trade.current?.addPlayerById(row.id, "team2");
  };

  // A whole trade, from the Contender Helper. The sides have to be the right
  // way round: `team2` is what I get, `team1` is the panel headed "Trade
  // Partner gets...", so it takes what I give away.
  //
  // This one does switch tab, unlike the Finder's add. It is a single action
  // whose whole point is to see the trade priced the other way, and leaving the
  // user on a page that looks unchanged would read as nothing having happened.
  const sendTrade = ({ give = [], get = [] }) => {
    give.forEach((id) => trade.current?.addPlayerById(id, "team1"));
    get.forEach((id) => trade.current?.addPlayerById(id, "team2"));
    setActiveTab("trade");
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
        <PlayerFinder onAddPlayer={addIncoming} />
      </div>

      <div
        id="thp-panel-contender"
        role="tabpanel"
        aria-labelledby="thp-tab-contender"
        className={activeTab === "contender" ? "" : "thp-hidden"}
      >
        <ContenderTab
          userName={userName}
          active={activeTab === "contender"}
          onSendTrade={sendTrade}
        />
      </div>
    </div>
  );
}

export default TradeHelperPage;

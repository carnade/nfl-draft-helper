import React, { useState } from "react";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import { ThemeProvider } from "./ThemeContext"; // Import ThemeProvider
import StartPage from "./StartPage";
import LeftMenu from "./LeftMenu";
import CreateRankings from "./CreateRankings";
import DraftSetup from "./DraftSetup";
import DraftHelper from "./DraftHelper";
import DraftsList from "./DraftsList";
import LeagueList from "./LeagueList";
import BestballList from "./BestballList";
import TradeAnalyzer from "./TradeAnalyzer";
import DFS from "./DFS";
import DFSResults from "./DFSResults";
import DFSManage from "./DFSManage";
import Tournaments from "./Tournaments";
import TournamentCreate from "./TournamentCreate";
import TournamentResults from "./TournamentResults";
import Settings from "./Settings";
import { ChangelogWithReadMark } from "./Changelog";
import Stats from "./Stats";
import Odds from "./Odds";
import "./Layout.css";
import "./LeftMenu.css";
import "./GenericStyles.css";

console.log({
  StartPage,
  LeftMenu,
  CreateRankings,
  DraftSetup,
  DraftHelper,
  DraftsList,
  LeagueList,
  BestballList,
  TradeAnalyzer,
  Settings,
  Stats,
});

function App() {
  const [csvData, setCsvData] = useState(""); // Manage CSV data in App.js
  const [csvFileName, setCsvFileName] = useState(""); // Manage CSV data in App.js
  const [userName, setUserName] = useState("");

  return (
    <ThemeProvider>
      <Router>
        <div className="app-container">
          <LeftMenu userName={userName} setUserName={setUserName} />
          <div className="content">
            <Routes>
              {/* Route for the start page */}
              <Route
                path="/"
                element={
                  <StartPage userName={userName} setUserName={setUserName} />
                }
              />
              <Route
                path="/draftsetup"
                element={
                  <DraftSetup
                    setCsvData={setCsvData}
                    setCsvFileName={setCsvFileName}
                    userName={userName}
                    setUserName={setUserName}
                    isRankingsPage={false}
                  />
                }
              />

              {/* Route for the draft helper page */}
              <Route
                path="/drafthelper/:draftId"
                element={
                  <DraftHelper
                    csvData={csvData}
                    csvFileName={csvFileName} // Pass CSV data to DraftHelper
                  />
                }
              />
              <Route
                path="/drafthelper"
                element={
                  <DraftHelper
                    csvData={csvData}
                    csvFileName={csvFileName} // Pass CSV data to DraftHelper
                  />
                }
              />
              <Route
                path="/drafts/:userName"
                element={<DraftsList />} // Pass userName to DraftPage component
              />
              <Route path="/leagues/:userName" element={<LeagueList />} />

              <Route path="/bestball/:userName" element={<BestballList />} />
              <Route path="/trade-analyzer" element={<TradeAnalyzer userName={userName} setUserName={setUserName} />} />
              <Route path="/dfs" element={<DFS userName={userName} />} />
              <Route path="/dfs/manage" element={<DFSManage />} />
              <Route path="/dfs/results/tinyurl/:name" element={<DFSResults />} />
              <Route path="/dfs/results" element={<DFSResults />} />
              <Route path="/tournaments/create" element={<TournamentCreate userName={userName} />} />
              <Route path="/tournaments/:tournamentId/results" element={<TournamentResults />} />
              <Route path="/tournaments" element={<Tournaments />} />
              <Route
                path="/rankingssetup"
                element={
                  <DraftSetup
                    setCsvData={setCsvData}
                    setCsvFileName={setCsvFileName}
                    userName={userName}
                    setUserName={setUserName}
                    isRankingsPage={true}
                  />
                }
              />
              <Route
                path="/rankings"
                element={
                  <CreateRankings
                    csvData={csvData}
                    csvFileName={csvFileName} // Pass CSV data to DraftHelper
                  />
                }
              />
              <Route path="/stats" element={<Stats />} />
              <Route path="/odds" element={<Odds />} />
              <Route path="/changelog" element={<ChangelogWithReadMark />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </div>
        </div>
      </Router>
    </ThemeProvider>
  );
}

export default App;

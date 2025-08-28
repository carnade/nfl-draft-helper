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
import Settings from "./Settings";
import Changelog from "./Changelog";
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
  Settings,
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
              <Route path="/changelog" element={<Changelog />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </div>
        </div>
      </Router>
    </ThemeProvider>
  );
}

export default App;

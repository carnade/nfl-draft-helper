import React, { useState } from "react";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import StartPage from "./StartPage";
import DraftHelper from "./DraftHelper";
import DraftsList from "./DraftsList";
import LeagueList from "./LeagueList";
import BestballList from "./BestballList";
import "./App.css";

function App() {
  const [csvData, setCsvData] = useState(""); // Manage CSV data in App.js
  const [csvFileName, setCsvFileName] = useState(""); // Manage CSV data in App.js
  const [useTierForOverall, setUseTierForOverall] = useState(false);
  const [userName, setUserName] = useState("");

  return (
    <Router>
      <Routes>
        {/* Route for the start page */}
        <Route
          path="/"
          element={
            <StartPage
              setCsvData={setCsvData}
              setCsvFileName={setCsvFileName}
              useTierForOverall={useTierForOverall}
              setUseTierForOverall={setUseTierForOverall}
              userName={userName}
              setUserName={setUserName}
            />
          }
        />

        {/* Route for the draft helper page */}
        <Route
          path="/drafthelper"
          element={
            <DraftHelper
              csvData={csvData}
              csvFileName={csvFileName} // Pass CSV data to DraftHelper
              useTierForOverall={useTierForOverall}
            />
          }
        />
        <Route
          path="/drafts"
          element={<DraftsList userName={userName} />} // Pass userName to DraftPage component
        />
        <Route path="/leagues" element={<LeagueList userName={userName} />} />

        <Route path="/bestball/:userName" element={<BestballList />} />
      </Routes>
    </Router>
  );
}

export default App;

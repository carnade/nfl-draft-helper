import React, { useState } from "react";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import StartPage from "./StartPage";
import DraftHelper from "./DraftHelper";
import "./App.css";

function App() {
  const [csvData, setCsvData] = useState("");  // Manage CSV data in App.js
  const [csvFileName, setCsvFileName] = useState("");  // Manage CSV data in App.js
  const [useTierForOverall, setUseTierForOverall] = useState(false);

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
            />
          }
        />

        {/* Route for the draft helper page */}
        <Route
          path="/draft"
          element={
            <DraftHelper
              csvData={csvData}
              csvFileName={csvFileName} // Pass CSV data to DraftHelper
              useTierForOverall={useTierForOverall}
            />
          }
        />
      </Routes>
    </Router>
  );
}

export default App;

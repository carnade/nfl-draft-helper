import React, { createContext, useState, useEffect } from "react";

// Create the ThemeContext
export const ThemeContext = createContext();

// Create the ThemeProvider component
export function ThemeProvider({ children }) {
  // Dark unless the user has chosen otherwise. Read during initialisation rather
  // than in an effect, so the first paint is already the right theme instead of
  // flashing light and correcting itself.
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem("FantasyHelperTheme") || "dark";
    } catch {
      return "dark";
    }
  });

  useEffect(() => {
    localStorage.setItem("FantasyHelperTheme", theme);
    document.body.className = theme;
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

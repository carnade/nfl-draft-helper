// leagueVisibility.js — which leagues the user has chosen not to see.
//
// Stored as a list of hidden league ids rather than visible ones, so a league
// joined later shows up by default instead of quietly disappearing until it is
// ticked on.
//
// Best ball is never included: those leagues have no lineup to set and the pages
// that honour this already filter them out.

import { useState, useEffect } from "react";

const HIDDEN_STORAGE_KEY = "hidden_leagues";
const VISIBILITY_CHANGE_EVENT = "league-visibility-changed";

export function loadHiddenLeagues() {
  try {
    const raw = JSON.parse(localStorage.getItem(HIDDEN_STORAGE_KEY) || "[]");
    return new Set(Array.isArray(raw) ? raw.map(String) : []);
  } catch {
    return new Set();
  }
}

export function saveHiddenLeagues(hidden) {
  try {
    localStorage.setItem(HIDDEN_STORAGE_KEY, JSON.stringify([...hidden]));
  } catch {
    /* storage can be full or blocked; the pages still work, nothing is hidden */
  }
  notifyLeagueVisibilityChanged();
}

export function setLeagueHidden(leagueId, hidden) {
  const next = loadHiddenLeagues();
  if (hidden) next.add(String(leagueId));
  else next.delete(String(leagueId));
  saveHiddenLeagues(next);
}

// The native "storage" event only fires in *other* tabs, so pages in this one
// need telling directly — the same trick auth.js uses.
export function notifyLeagueVisibilityChanged() {
  window.dispatchEvent(new Event(VISIBILITY_CHANGE_EVENT));
}

export function useHiddenLeagues() {
  const [hidden, setHidden] = useState(() => loadHiddenLeagues());

  useEffect(() => {
    const refresh = () => setHidden(loadHiddenLeagues());
    window.addEventListener("storage", refresh);
    window.addEventListener(VISIBILITY_CHANGE_EVENT, refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener(VISIBILITY_CHANGE_EVENT, refresh);
    };
  }, []);

  return hidden;
}

// Convenience for the pages: drop anything the user has hidden.
export function visibleLeagues(leagues, hidden) {
  if (!hidden || hidden.size === 0) return leagues;
  return leagues.filter((l) => !hidden.has(String(l.league_id)));
}

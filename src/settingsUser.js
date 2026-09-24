// The name the app knows you by.
//
// It has been stored under two spellings. Settings saves `username`; the DFS
// page's own name prompt saved `userName`. Worse, Settings' save rebuilt the
// object from scratch (`{ username, defaultRankings }`) rather than merging, so
// saving settings silently dropped the other spelling.
//
// Readers disagreed too: DFS read only `userName`, so a name saved in Settings
// was invisible to it and the page fell back to 'Anonymous' — which is why the
// DFS tournament list came up empty for someone who had definitely set a name.
// TournamentCreate read `userName` first and DFSResults read `username` first,
// so the same person could resolve to different names on different pages.
//
// One reader, one writer, both spellings understood.
import { loadSleeperAuth } from "./auth";

const SETTINGS_KEY = "FantasyHelperSettings";

export function readSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") || {};
  } catch {
    // A corrupt blob should cost the settings, not the page.
    return {};
  }
}

/** The saved name, under either spelling. Empty string when there is none. */
export function savedUserName() {
  const settings = readSettings();
  return String(settings.username || settings.userName || "").trim();
}

/**
 * The name to act as: what the caller was given, else what is saved, else the
 * Sleeper account. Signing in is a statement of who you are, so it is a better
 * answer than none — and it is the name lineups are filed under anyway.
 */
export function effectiveUserName(preferred) {
  const given = String(preferred || "").trim();
  if (given) return given;
  return savedUserName() || String(loadSleeperAuth()?.display_name || "").trim();
}

/**
 * Store the name, keeping everything else in the settings object. Writes the
 * spelling Settings uses and clears the legacy one so the two cannot disagree.
 */
export function rememberUserName(name) {
  try {
    const settings = readSettings();
    settings.username = name;
    delete settings.userName;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Not being able to remember it is survivable; the session still has it.
  }
}

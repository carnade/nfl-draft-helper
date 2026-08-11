// auth.js — sitewide helpers for gating content behind a real Sleeper login
// (the Settings page "Connect" flow, which verifies against Sleeper's own
// login API), as opposed to the plain free-text "Standard username" field
// that anyone can type into.

import { useState, useEffect } from "react";

const AUTH_STORAGE_KEY = "sleeper_auth";
const AUTH_CHANGE_EVENT = "sleeper-auth-changed";

// Sleeper usernames (display_name, case-insensitive) allowed to see
// privileged/internal-only content. Add more as needed.
const PRIVILEGED_SLEEPER_USERS = ["carnade"];

export function loadSleeperAuth() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) || "null");
  } catch {
    return null;
  }
}

// Call this right after writing/removing the "sleeper_auth" localStorage key
// so components using useSleeperAuth() in the *same* tab pick up the change —
// the native "storage" event only fires in other tabs.
export function notifySleeperAuthChanged() {
  window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
}

export function useSleeperAuth() {
  const [auth, setAuth] = useState(() => loadSleeperAuth());

  useEffect(() => {
    const refresh = () => setAuth(loadSleeperAuth());
    window.addEventListener("storage", refresh);
    window.addEventListener(AUTH_CHANGE_EVENT, refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener(AUTH_CHANGE_EVENT, refresh);
    };
  }, []);

  return auth;
}

// True only for a real, non-expired Sleeper login matching the allowlist.
export function useIsPrivilegedUser() {
  const auth = useSleeperAuth();
  const name = auth?.display_name?.toLowerCase();
  const notExpired = !auth?.exp || auth.exp * 1000 > Date.now();
  return !!name && notExpired && PRIVILEGED_SLEEPER_USERS.includes(name);
}

// Convenience wrapper for JSX: <PrivilegedOnly>...only rendered if logged in
// as an allowed Sleeper user...</PrivilegedOnly>
export function PrivilegedOnly({ children }) {
  const isPrivileged = useIsPrivilegedUser();
  return isPrivileged ? children : null;
}

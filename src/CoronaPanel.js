// The Corona Masters commissioner panel, at the foot of the League page.
//
// Visible to carnade and Redhelge and nobody else, and — just as importantly —
// it fetches nothing at all for anyone else, so the page it sits on is
// unchanged for every other visitor.
//
// It answers three questions about all twelve teams at once: what is wrong with
// each lineup, by when each manager has to fix it, and will you tell them. The
// last of those posts to the league chat, which reaches fifteen people and
// cannot be unsent, so the exact text is on screen before anything is sent and
// there is a confirmation after that.

import React, { useCallback, useEffect, useState } from "react";

import "./CoronaPanel.css";
import { useIsPrivilegedUser, useSleeperAuth } from "./auth";
import { sleeperGraphql } from "./sleeperGraphql";
import { buildSlots } from "./startSitModel";
import { kickoffsByTeam, teamsPlayingIn } from "./nflSchedule";
import { parseGameStartToUtc } from "./dfsKickoff";
import { getCurrentWeek } from "./currentWeekCache";
import {
  CORONA_MASTERS_LEAGUE_ID,
  CORONA_MASTERS_NAME,
  leagueOverview,
  problemLabel,
  summaryMessage,
  whenLabel,
} from "./coronaMasters";

const BASE_URL = process.env.REACT_APP_MOCK
  ? "http://localhost:5000"
  : "https://shaggy-latashia-carnade-2ea2054a.koyeb.app";

const SLEEPER = "https://api.sleeper.app/v1";

// The mutation Sleeper's own web client sends. `client_id` is a per-message
// idempotency key: a fresh one each time, because repeating one risks the
// second message being swallowed as a duplicate, and a send that silently does
// nothing is worse than one that fails loudly.
const CREATE_MESSAGE = `mutation create_message($text: String) {
  create_message(
    parent_id: "${CORONA_MASTERS_LEAGUE_ID}",
    client_id: $client_id,
    parent_type: "league",
    text: $text
  ) {
    message_id
    parent_id
    text
    created
  }
}`;

function newClientId() {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    /* fall through to the arithmetic below */
  }
  // Good enough for an idempotency key where randomUUID is missing.
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

/** The mutation with its client id baked in, since Sleeper takes it as a literal. */
function createMessageDocument(clientId) {
  return CREATE_MESSAGE.replace("$client_id", JSON.stringify(clientId));
}

function ProblemList({ problems }) {
  return (
    <ul className="cm-problems">
      {problems.map((problem, i) => (
        <li key={`${problem.slot}-${problem.id || i}`} className={`cm-problem cm-${problem.kind}`}>
          {problemLabel(problem)}
        </li>
      ))}
    </ul>
  );
}

export function TeamRow({ team }) {
  const by = whenLabel(team.fixBy);
  return (
    <tr className={team.problems.length ? "cm-row-broken" : ""}>
      <td className="cm-manager">{team.manager}</td>
      <td className="ss-center ss-num">{team.problems.length || "—"}</td>
      <td className="cm-fixby">
        {by || <span className="ss-muted">no deadline</span>}
      </td>
      <td>
        {team.problems.length ? (
          <ProblemList problems={team.problems} />
        ) : (
          <span className="ss-muted">OK</span>
        )}
      </td>
    </tr>
  );
}

function CoronaPanel() {
  const isPrivileged = useIsPrivilegedUser();
  const auth = useSleeperAuth();

  const [state, setState] = useState({ status: "idle", overview: null, error: null });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(null);

  const load = useCallback(async (signal) => {
    setState((s) => ({ ...s, status: "loading", error: null }));
    try {
      const week = await getCurrentWeek();

      const [rosters, users] = await Promise.all([
        fetch(`${SLEEPER}/league/${CORONA_MASTERS_LEAGUE_ID}/rosters`, { signal })
          .then((r) => r.json()),
        fetch(`${SLEEPER}/league/${CORONA_MASTERS_LEAGUE_ID}/users`, { signal })
          .then((r) => r.json()),
      ]);

      const league = await fetch(`${SLEEPER}/league/${CORONA_MASTERS_LEAGUE_ID}`, { signal })
        .then((r) => r.json());

      const starters = new Set();
      for (const roster of Array.isArray(rosters) ? rosters : []) {
        for (const id of roster?.starters || []) if (id && id !== "0") starters.add(String(id));
      }

      // Not the per-league /getplayers, which only answers for the signed-in
      // manager's own roster — this one takes any ids.
      const [playerById, schedule] = await Promise.all([
        starters.size
          ? fetch(`${BASE_URL}/getplayers/data`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ playerlist: [...starters] }),
              signal,
            }).then((r) => (r.ok ? r.json() : {}))
          : Promise.resolve({}),
        // The one place a kickoff time can be had: Sleeper's own schedule
        // carries only a status, never a clock.
        fetch(`${BASE_URL}/stats/schedule/${week}`, { signal })
          .then((r) => (r.ok ? r.json() : []))
          .catch(() => []),
      ]);

      const rows = Array.isArray(schedule) ? schedule : schedule?.games || [];

      setState({
        status: "ready",
        error: null,
        overview: leagueOverview({
          rosters: Array.isArray(rosters) ? rosters : [],
          users: Array.isArray(users) ? users : [],
          slots: buildSlots(league?.roster_positions || []),
          playerById: playerById || {},
          playingTeams: teamsPlayingIn(rows),
          kickoffs: kickoffsByTeam(rows, parseGameStartToUtc),
          week,
        }),
      });
    } catch (e) {
      if (e.name === "AbortError") return;
      setState({ status: "failed", overview: null, error: e.message });
    }
  }, []);

  useEffect(() => {
    // Nothing is requested for a visitor who cannot see this.
    if (!isPrivileged) return undefined;
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [isPrivileged, load]);

  if (!isPrivileged) return null;

  const { status, overview, error } = state;
  const message = overview ? summaryMessage(overview) : "";

  const send = async () => {
    if (!auth?.token) {
      setSent({ ok: false, text: "Sign in to Sleeper first." });
      return;
    }
    // It reaches fifteen people and cannot be unsent.
    const ok = window.confirm(
      `Post this to the ${CORONA_MASTERS_NAME} league chat?\n\n${message}`
    );
    if (!ok) return;

    setSending(true);
    setSent(null);
    try {
      await sleeperGraphql({
        op: "create_message",
        query: createMessageDocument(newClientId()),
        variables: { text: message },
        token: auth.token,
      });
      setSent({ ok: true, text: "Posted to the league." });
    } catch (e) {
      setSent({ ok: false, text: e.message || "Sleeper rejected the message." });
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="cm-panel" aria-label={`${CORONA_MASTERS_NAME} commissioner overview`}>
      <div className="cm-head">
        <h2 className="cm-title">
          {CORONA_MASTERS_NAME} — lineup check
          {overview?.week ? <span className="ss-muted"> · week {overview.week}</span> : null}
        </h2>
        <button type="button" className="cm-refresh" onClick={() => load()} disabled={status === "loading"}>
          {status === "loading" ? "Checking…" : "Refresh"}
        </button>
      </div>

      {status === "failed" && <p className="cm-error">Could not load the league: {error}</p>}
      {status === "loading" && !overview && <p className="ss-muted">Reading twelve lineups…</p>}

      {overview && (
        <>
          <p className="cm-summary">
            {overview.broken.length === 0
              ? `All ${overview.teams.length} lineups look fine.`
              : `${overview.broken.length} of ${overview.teams.length} teams need attention.`}
            <span className="ss-muted">
              {" "}Statuses come from a feed refreshed hourly on gamedays, so one can be up to an
              hour behind.
            </span>
          </p>

          <div className="ss-table-wrap">
            <table className="ss-table cm-table">
              <thead>
                <tr>
                  <th>Manager</th>
                  <th className="ss-center">Issues</th>
                  <th>Fix by</th>
                  <th>What is wrong</th>
                </tr>
              </thead>
              <tbody>
                {overview.teams.map((team) => (
                  <TeamRow key={team.rosterId} team={team} />
                ))}
              </tbody>
            </table>
          </div>

          <h3 className="cm-subtitle">The message</h3>
          <pre className="cm-message">{message}</pre>
          <div className="cm-send-row">
            <button
              type="button"
              className="cm-send"
              onClick={send}
              disabled={sending || status !== "ready"}
            >
              {sending ? "Posting…" : `Post to ${CORONA_MASTERS_NAME}`}
            </button>
            {sent && (
              <span className={sent.ok ? "cm-sent-ok" : "cm-sent-bad"}>{sent.text}</span>
            )}
          </div>
        </>
      )}
    </section>
  );
}

export default CoronaPanel;

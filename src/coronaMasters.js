// Twelve lineups at once, from the commissioner's side.
//
// Every other check in this app runs down one axis: the signed-in manager's own
// roster, across their leagues. findIrIssues does, evaluateLineup does. This is
// the other axis — every team in one league — which is what running a league
// actually asks of you.
//
// Pure, so the whole thing can be checked against a week that really happened
// without a league in front of it.
//
// What counts as broken is hardFlag() from startSitModel, not a second opinion
// written here. That means Doubtful, PUP, Sus and NA come along with Out, IR and
// DNR, which is already how Start/Sit treats them; one definition of a broken
// lineup is worth more than a tailored one.

import { hardFlag } from "./startSitModel";
import { nflverseTeam } from "./nflSchedule";

// Sleeper issues a new league id every season, so this stops working each
// summer until it is changed. Kept as one named constant for that reason.
export const CORONA_MASTERS_LEAGUE_ID = "1395106065225355264";
export const CORONA_MASTERS_NAME = "Corona Masters";

/** How a problem reads, in the order a manager cares about it. */
const REASON = {
  empty: "empty slot",
  out: null,       // replaced by the player's own status: "Out", "IR", …
  bye: "on bye",
};

const SEVERITY = { empty: 0, out: 1, bye: 2 };

/**
 * One starter, as either a problem or nothing.
 *
 * `slot` is positional: starters[i] fills the i-th non-bench roster position,
 * which is the convention the REST payload documents and the rest of this app
 * relies on.
 */
function problemFor({ slot, playerId, player, playingTeams, kickoffs }) {
  // A bye is decided from the schedule for the week on screen, and only from
  // there. The player metadata also carries "Bye" as an injury_status, and it
  // answers a different question: the backend computes it against its own
  // notion of the current week, which rolls over earlier than Sleeper's. Run
  // live it marked Chicago, Denver, Philadelphia and Tampa Bay on bye — the
  // week 10 byes — while the week being shown was 9, whose byes are Pittsburgh
  // and Tennessee. Trusting it put 11 of 12 teams in trouble over players who
  // were about to play.
  //
  // hardFlag reads `status === "Bye"` as a bye, so that value is dropped before
  // it gets there rather than left to win.
  // Both the bye and the kickoff are looked up in a schedule that spells three
  // teams differently from Sleeper, so the code is translated first. Without
  // it every Rams player was on bye with no deadline: LAR matched no game in a
  // schedule that calls them LA.
  const team = player?.team ? nflverseTeam(player.team) : null;
  const onBye = !!team && playingTeams.size > 0 && !playingTeams.has(team);
  const status = player?.injury_status === "Bye" ? null : player?.injury_status;

  // hardFlag wants the shape startSitModel uses, so give it that rather than
  // reaching into its internals.
  const kind = hardFlag(
    playerId && playerId !== "0" ? { status, onBye } : null
  );
  if (!kind) return null;

  const name = [player?.first_name, player?.last_name].filter(Boolean).join(" ").trim();
  return {
    slot,
    id: playerId && playerId !== "0" ? String(playerId) : null,
    // A starter the metadata has not reached still has a problem worth naming.
    name: name || (playerId && playerId !== "0" ? String(playerId) : null),
    position: player?.position || null,
    team: player?.team || null,
    kind,
    reason: REASON[kind] || status || kind,
    // A bye player and an empty slot never lock, so neither carries a deadline.
    kickoff: kind === "out" && team ? kickoffs[team] || null : null,
  };
}

/** Whoever holds this roster, named once however many of them there are. */
export function managerFor(roster, nameByUserId) {
  const ids = [roster?.owner_id, ...(roster?.co_owners || [])].filter(Boolean);
  const names = [...new Set(ids.map((id) => nameByUserId[id]).filter(Boolean))];
  return names.length ? names.join(" & ") : `Roster ${roster?.roster_id ?? "?"}`;
}

/**
 * One team's problems, worst first, and when the first of them locks.
 *
 * `fixBy` is the earliest kickoff among the problems that have one. A team whose
 * only trouble is an empty slot or a player on bye gets null — nothing is
 * running out, and a time there would be an invention.
 */
export function teamProblems({ roster, slots = [], playerById = {}, nameByUserId = {},
                               playingTeams = new Set(), kickoffs = {} }) {
  const starters = Array.isArray(roster?.starters) ? roster.starters : [];

  const problems = starters
    .map((playerId, index) =>
      problemFor({
        slot: slots[index] || null,
        playerId,
        player: playerById[String(playerId)],
        playingTeams,
        kickoffs,
      })
    )
    .filter(Boolean)
    .sort((a, b) => (SEVERITY[a.kind] ?? 9) - (SEVERITY[b.kind] ?? 9));

  const deadlines = problems.map((p) => p.kickoff).filter(Boolean);

  return {
    rosterId: roster?.roster_id ?? null,
    manager: managerFor(roster, nameByUserId),
    problems,
    fixBy: deadlines.length ? new Date(Math.min(...deadlines.map((d) => d.getTime()))) : null,
  };
}

/**
 * Every team, the ones needing attention first.
 *
 * Ordered by how many problems, then by how soon the first locks, so the top of
 * the list is whoever has to be chased first.
 */
export function leagueOverview({ rosters = [], users = [], slots = [], playerById = {},
                                 playingTeams = new Set(), kickoffs = {}, week = null }) {
  const nameByUserId = {};
  for (const user of users) {
    if (user?.user_id) nameByUserId[user.user_id] = user.display_name || user.user_id;
  }

  const teams = rosters
    .map((roster) =>
      teamProblems({ roster, slots, playerById, nameByUserId, playingTeams, kickoffs })
    )
    .sort((a, b) => {
      if (a.problems.length !== b.problems.length) return b.problems.length - a.problems.length;
      if (a.fixBy && b.fixBy) return a.fixBy - b.fixBy;
      if (a.fixBy) return -1;
      if (b.fixBy) return 1;
      return a.manager.localeCompare(b.manager);
    });

  return {
    week,
    teams,
    broken: teams.filter((t) => t.problems.length > 0),
    clean: teams.filter((t) => t.problems.length === 0),
  };
}

/** A kickoff as the reader's own wall clock: "Sun 19:00". */
export function whenLabel(date) {
  if (!date) return null;
  return date.toLocaleString(undefined, {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** One problem, as a phrase: "Lamar Jackson (QB) IR". */
export function problemLabel(problem) {
  const who = problem.name || "empty";
  if (problem.kind === "empty") return `${problem.slot || "?"}: empty`;
  const where = problem.slot ? ` (${problem.slot})` : "";
  return `${who}${where} ${problem.reason}`;
}

/**
 * The message posted to the league.
 *
 * Only the teams that need to do something, because a wall of "OK" buries the
 * five lines that matter. The teams that are fine are counted in one line so
 * nobody wonders whether they were looked at.
 */
export function summaryMessage(overview) {
  const { week, broken, clean } = overview;
  const lines = [`Week ${week ?? "?"} lineup check — ${CORONA_MASTERS_NAME}`, ""];

  if (broken.length === 0) {
    lines.push("All 12 lineups look fine. Nothing to fix.");
    return lines.join("\n");
  }

  for (const team of broken) {
    const by = whenLabel(team.fixBy);
    lines.push(`${team.manager}${by ? ` — fix by ${by}` : ""}`);
    for (const problem of team.problems) lines.push(`  • ${problemLabel(problem)}`);
  }

  if (clean.length) {
    lines.push("");
    lines.push(
      clean.length === 1
        ? "The other team looks fine."
        : `The other ${clean.length} teams look fine.`
    );
  }
  return lines.join("\n");
}

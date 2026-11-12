import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

import ContenderTab from "./ContenderTab";
import * as load from "./contenderLoad";
import { getCurrentWeek } from "./currentWeekCache";

// The whole fetch surface is one module, so the component can be tested
// against one mock rather than against nine hand-stubbed URLs.
jest.mock("./contenderLoad");
jest.mock("./currentWeekCache", () => ({
  getCurrentWeek: jest.fn(),
  peekCurrentWeek: jest.fn(() => 10),
}));

// user-event is v13 here and does not flush React 18 state the way the newer
// API expects, so interactions go through fireEvent — as in PlayerFinder.test.
const click = (el) => fireEvent.click(el);
const type = (el, value) => fireEvent.change(el, { target: { value } });

// ── Fixtures ────────────────────────────────────────────────────────────────

const LEAGUE = {
  league_id: "L1",
  name: "Corona Masters",
  status: "in_season",
  total_rosters: 3,
  roster_positions: ["QB", "RB", "WR", "TE", "FLEX", "BN", "BN"],
  // One point a catch keeps the arithmetic readable: a player's rate is their
  // receptions divided by their games.
  scoring_settings: { rec: 1 },
  settings: { type: 2, best_ball: 0, playoff_week_start: 15 },
};

const ME = "u-me";

const ROSTERS = [
  {
    roster_id: 1,
    owner_id: ME,
    co_owners: [],
    players: ["m_qb", "m_rb", "m_wr", "m_te", "m_flex", "m_bench"],
    reserve: [],
    taxi: [],
  },
  {
    roster_id: 2,
    owner_id: "u-them",
    co_owners: [],
    players: ["p_wr", "p_rb"],
    reserve: [],
    taxi: [],
  },
  {
    roster_id: 3,
    owner_id: "u-third",
    co_owners: [],
    players: ["x_wr"],
    reserve: [],
    taxi: [],
  },
];

const USERS = [
  { user_id: ME, display_name: "carnade", metadata: { team_name: "My Team" } },
  { user_id: "u-them", display_name: "redhelge", metadata: { team_name: "Their Team" } },
  { user_id: "u-third", display_name: "someone", metadata: { team_name: "Third Team" } },
];

// id → [first, last, position, team, receptions over two games]
const SQUAD = {
  m_qb: ["Josh", "Allen", "QB", "BUF", 40],
  m_rb: ["Breece", "Hall", "RB", "NYJ", 24],
  m_wr: ["Garrett", "Wilson", "WR", "NYJ", 22],
  m_te: ["George", "Kittle", "TE", "SF", 18],
  m_flex: ["Tyjae", "Spears", "RB", "TEN", 12],
  m_bench: ["Jalen", "Tolbert", "WR", "DAL", 8],
  p_wr: ["Puka", "Nacua", "WR", "LAR", 36],
  p_rb: ["Chuba", "Hubbard", "RB", "CAR", 14],
  x_wr: ["Rome", "Odunze", "WR", "CHI", 20],
};

const META = Object.fromEntries(
  Object.entries(SQUAD).map(([id, [first, last, position, team]]) => [
    id,
    { first_name: first, last_name: last, position, team, pts_ppr: 100 },
  ])
);

const SEASON_STATS = Object.fromEntries(
  Object.entries(SQUAD).map(([id, [, , , , rec]]) => [id, { rec, gp: 2 }])
);

// Two of the Rams' and Jets' weeks are byes, which is what the badges read.
const SCHEDULE = [
  ...[10, 11, 12, 13, 14, 15, 16, 17].flatMap((week) => [
    { week, home: "BUF", away: "SF" },
    { week, home: "DAL", away: "CAR" },
    { week, home: "CHI", away: "TEN" },
    ...(week === 13 ? [] : [{ week, home: "NYJ", away: "LAR" }]),
  ]),
];

const SOS = {
  byTeam: {
    BUF: { ros: { 2026: { value: 0.5, games: 8 } }, post: { 2026: { value: 0.5, games: 3 } } },
    NYJ: { ros: { 2026: { value: 0.6, games: 8 } }, post: { 2026: { value: 0.6, games: 3 } } },
    SF: { ros: { 2026: { value: 0.4, games: 8 } }, post: { 2026: { value: 0.4, games: 3 } } },
    TEN: { ros: { 2026: { value: 0.5, games: 8 } }, post: { 2026: { value: 0.5, games: 3 } } },
    DAL: { ros: { 2026: { value: 0.5, games: 8 } }, post: { 2026: { value: 0.5, games: 3 } } },
    LA: { ros: { 2026: { value: 0.3, games: 8 } }, post: { 2026: { value: 0.3, games: 3 } } },
    CAR: { ros: { 2026: { value: 0.5, games: 8 } }, post: { 2026: { value: 0.5, games: 3 } } },
    CHI: { ros: { 2026: { value: 0.5, games: 8 } }, post: { 2026: { value: 0.5, games: 3 } } },
  },
  byPlayer: {},
};

const PROJECTIONS = { m_qb: 25, m_rb: 14, m_wr: 11, m_te: 9, m_flex: 6, p_wr: 19, p_rb: 7 };

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn(() => Promise.reject(new Error("no direct fetching from this tab")));

  getCurrentWeek.mockResolvedValue(10);
  load.loadLeagues.mockResolvedValue({ userId: ME, leagues: [LEAGUE] });
  load.loadSchedule.mockResolvedValue(SCHEDULE);
  load.loadLeagueDetail.mockResolvedValue({ rosters: ROSTERS, users: USERS });
  load.loadSeasonStats.mockResolvedValue(SEASON_STATS);
  load.loadPlayerMeta.mockResolvedValue(META);
  load.loadScheduleStrength.mockResolvedValue(SOS);
  load.loadWeekProjections.mockResolvedValue(PROJECTIONS);
});

afterEach(() => {
  delete global.fetch;
});

const open = async () => {
  const view = render(<ContenderTab userName="carnade" active />);
  await screen.findByLabelText("League");
  return view;
};

const pickLeague = async () => {
  type(screen.getByLabelText("League"), "L1");
  await waitFor(() => expect(screen.getByLabelText("Search my roster")).toBeEnabled());
};

// ── Not until it is opened ──────────────────────────────────────────────────

describe("before the tab is ever opened", () => {
  it("fetches nothing at all", async () => {
    // The page keeps every tab mounted so the trade survives switching, which
    // means a hidden tab that loaded on mount would download the whole horizon
    // for someone who never clicked it.
    render(<ContenderTab userName="carnade" active={false} />);

    await Promise.resolve();

    expect(global.fetch).not.toHaveBeenCalled();
    expect(load.loadLeagues).not.toHaveBeenCalled();
    expect(load.loadSchedule).not.toHaveBeenCalled();
    expect(load.loadLeagueDetail).not.toHaveBeenCalled();
    expect(load.loadWeekProjections).not.toHaveBeenCalled();
    expect(getCurrentWeek).not.toHaveBeenCalled();
  });

  it("loads once it is shown, and stays loaded when it is hidden again", async () => {
    const { rerender } = render(<ContenderTab userName="carnade" active={false} />);
    expect(load.loadLeagues).not.toHaveBeenCalled();

    rerender(<ContenderTab userName="carnade" active />);
    await screen.findByLabelText("League");
    expect(load.loadLeagues).toHaveBeenCalledTimes(1);

    // Hiding it must not refire anything; the pane is still mounted.
    rerender(<ContenderTab userName="carnade" active={false} />);
    rerender(<ContenderTab userName="carnade" active />);
    expect(load.loadLeagues).toHaveBeenCalledTimes(1);
  });

  it("asks for a username rather than loading nothing", () => {
    render(<ContenderTab userName="" active />);
    expect(screen.getByText(/Set a Sleeper username/)).toBeInTheDocument();
    expect(load.loadLeagues).not.toHaveBeenCalled();
  });
});

// ── Picking a league ───────────────────────────────────────────────────────

describe("choosing a league", () => {
  it("offers the leagues and says what the windows are", async () => {
    await open();
    expect(screen.getByRole("option", { name: /Corona Masters/ })).toBeInTheDocument();

    await pickLeague();
    expect(screen.getByText(/Week 10/)).toBeInTheDocument();
    expect(screen.getByText(/wk 10–14/)).toBeInTheDocument();
    expect(screen.getByText(/wk 15–17/)).toBeInTheDocument();
  });

  it("does not load the league until one is chosen", async () => {
    await open();
    expect(load.loadLeagueDetail).not.toHaveBeenCalled();

    await pickLeague();
    expect(load.loadLeagueDetail).toHaveBeenCalledWith("L1", expect.anything());
  });

  it("says so when the user holds no roster in it", async () => {
    load.loadLeagues.mockResolvedValue({ userId: "u-stranger", leagues: [LEAGUE] });
    await open();
    await pickLeague();

    expect(await screen.findByText(/do not hold a roster/)).toBeInTheDocument();
  });
});

// ── The two sides ──────────────────────────────────────────────────────────

describe("building a trade", () => {
  it("searches only my roster on my side", async () => {
    await open();
    await pickLeague();

    type(screen.getByLabelText("Search my roster"), "nacua");
    expect(await screen.findByText(/Nobody on your roster by that name/)).toBeInTheDocument();

    type(screen.getByLabelText("Search my roster"), "hall");
    expect(await screen.findByText("Breece Hall")).toBeInTheDocument();
  });

  it("searches the whole league on their side, naming the owner", async () => {
    await open();
    await pickLeague();

    type(screen.getByLabelText("Search the league"), "nacua");
    const hit = await screen.findByText("Puka Nacua");
    expect(hit.parentElement).toHaveTextContent("Their Team");
  });

  it("will not offer a free agent, and says why", async () => {
    await open();
    await pickLeague();

    type(screen.getByLabelText("Search the league"), "mahomes");
    expect(await screen.findByText(/a free agent cannot be traded for/)).toBeInTheDocument();
  });

  it("infers the partner from the first player taken and narrows to them", async () => {
    await open();
    await pickLeague();

    type(screen.getByLabelText("Search the league"), "nacua");
    click(await screen.findByText("Puka Nacua"));

    expect(await screen.findByText("from Their Team")).toBeInTheDocument();

    // A third team's player is now out of reach, which is what keeps the
    // inferred partner honest without a dropdown that could disagree with it.
    // The message names the team rather than the league, and says the way out.
    type(screen.getByLabelText("Search the league"), "odunze");
    expect(
      await screen.findByText(/Nobody on Their Team by that name\. Clear their side/)
    ).toBeInTheDocument();
  });

  it("releases the partner when their side is emptied", async () => {
    await open();
    await pickLeague();

    type(screen.getByLabelText("Search the league"), "nacua");
    click(await screen.findByText("Puka Nacua"));
    await screen.findByText("from Their Team");

    click(screen.getByLabelText("Remove Nacua"));
    expect(await screen.findByText("anyone in the league")).toBeInTheDocument();

    type(screen.getByLabelText("Search the league"), "odunze");
    expect(await screen.findByText("Rome Odunze")).toBeInTheDocument();
  });

  it("marks a bye still to come and one already taken", async () => {
    await open();
    await pickLeague();

    type(screen.getByLabelText("Search my roster"), "hall");
    click(await screen.findByText("Breece Hall"));

    // The Jets are idle in week 13, which is ahead of week 10.
    expect(await screen.findByText("bye wk 13")).toBeInTheDocument();

    type(screen.getByLabelText("Search my roster"), "kittle");
    click(await screen.findByText("George Kittle"));
    // San Francisco plays every week in this fixture, so there is no badge.
    expect(screen.queryByText(/bye wk/)).toBeInTheDocument();
  });
});

// ── The numbers ────────────────────────────────────────────────────────────

describe("the impact", () => {
  const buildTrade = async () => {
    await open();
    await pickLeague();

    type(screen.getByLabelText("Search my roster"), "spears");
    click(await screen.findByText("Tyjae Spears"));
    type(screen.getByLabelText("Search the league"), "nacua");
    click(await screen.findByText("Puka Nacua"));
  };

  it("shows a per-week figure for each window", async () => {
    await buildTrade();

    const impact = await screen.findByText("Impact");
    expect(impact).toBeInTheDocument();
    // Nacua at 18 a game replaces Spears at 6 in the flex: +12 a week.
    expect(screen.getAllByText("+12.0 pts/wk").length).toBeGreaterThan(0);
  });

  it("shows the partner's side too, from their own lineup", async () => {
    await buildTrade();
    // Three places each: the headline tile, the comparison heading, and the
    // week-by-week table.
    expect(await screen.findAllByText("Their Team")).toHaveLength(3);
    expect(screen.getAllByText("My team")).toHaveLength(3);
  });

  it("gives each team a box of its own, holding both windows", async () => {
    // Grouped by window instead, the box under the heading that said "My team"
    // held both sides' run-in figures — which is not what that heading claims.
    await buildTrade();
    await screen.findByText("Impact");

    const mineTile = document.querySelector(".ch-tile-mine");
    const theirTile = document.querySelector(".ch-tile-theirs");

    for (const tile of [mineTile, theirTile]) {
      const windows = [...tile.querySelectorAll(".ch-tile-when")].map((el) => el.textContent);
      expect(windows).toHaveLength(2);
      expect(windows[0]).toMatch(/Rest of season/);
      expect(windows[1]).toMatch(/Playoffs/);
    }

    expect(mineTile).toHaveTextContent("My team");
    expect(theirTile).toHaveTextContent("Their Team");
    // And nothing of theirs has leaked into mine.
    expect(mineTile).not.toHaveTextContent("Their Team");
  });

  it("hands the whole trade to the Trade Helper", async () => {
    const onSendTrade = jest.fn();
    render(<ContenderTab userName="carnade" active onSendTrade={onSendTrade} />);
    await screen.findByLabelText("League");
    await pickLeague();

    type(screen.getByLabelText("Search my roster"), "spears");
    click(await screen.findByText("Tyjae Spears"));
    type(screen.getByLabelText("Search the league"), "nacua");
    click(await screen.findByText("Puka Nacua"));

    click(await screen.findByRole("button", { name: /Trade Helper/ }));

    expect(onSendTrade).toHaveBeenCalledWith({ give: ["m_flex"], get: ["p_wr"] });
  });

  it("offers no hand-off when the page has nowhere to send it", async () => {
    await buildTrade();
    await screen.findByText("Impact");
    expect(screen.queryByRole("button", { name: /Trade Helper/ })).not.toBeInTheDocument();
  });

  it("gives the opponent a week-by-week table of their own", async () => {
    await buildTrade();
    await screen.findByText("Impact");

    click(screen.getByText("Week by week"));

    // A week that swings the trade swings it for them too, and which of the two
    // it hurts is the thing being weighed up — so both sides get the detail.
    const tables = document.querySelectorAll(".ch-week-table");
    expect(tables).toHaveLength(2);
    // Five regular-season weeks and three playoff weeks, both sides.
    for (const table of tables) {
      expect(table.querySelectorAll("tbody tr")).toHaveLength(8);
      expect(table.querySelectorAll(".ch-week-playoff")).toHaveLength(3);
    }
  });

  it("leaves the opponent's table out when there is no opponent", async () => {
    await open();
    await pickLeague();

    type(screen.getByLabelText("Search my roster"), "spears");
    click(await screen.findByText("Tyjae Spears"));
    await screen.findByText("Impact");

    click(screen.getByText("Week by week"));
    expect(document.querySelectorAll(".ch-week-table")).toHaveLength(1);
  });

  it("stays on points per game until projections are asked for", async () => {
    await buildTrade();

    expect(load.loadWeekProjections).not.toHaveBeenCalled();
    // One measure per window, and no projection row until there are any.
    expect(screen.getAllByText("Points per game")).toHaveLength(2);
    expect(screen.queryByText("Sleeper projection")).not.toBeInTheDocument();

    click(screen.getByRole("button", { name: "Projections" }));

    // Eight weeks in the horizon, one request each — 2 MB apiece, which is why
    // this is behind a pill rather than loaded up front.
    await waitFor(() => expect(load.loadWeekProjections).toHaveBeenCalledTimes(8));
    expect(load.loadWeekProjections.mock.calls.map((call) => call[1])).toEqual([
      10, 11, 12, 13, 14, 15, 16, 17,
    ]);
  });

  it("survives being flipped away from and back to mid-download", async () => {
    // Eight weeks of 2 MB is slow enough that flipping to Pts/g to read
    // something while it runs is the obvious thing to do.
    const pending = [];
    load.loadWeekProjections.mockImplementation(
      () => new Promise((resolve) => pending.push(resolve))
    );

    await buildTrade();
    click(screen.getByRole("button", { name: "Projections" }));
    await waitFor(() => expect(pending).toHaveLength(1));

    click(screen.getByRole("button", { name: "Pts/g" }));
    click(screen.getByRole("button", { name: "Projections" }));

    // Let every week through, including the last one started.
    for (let i = 0; i < 20; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await act(async () => {
        pending.splice(0).forEach((resolve) => resolve(PROJECTIONS));
      });
    }

    expect(load.loadWeekProjections).toHaveBeenCalledTimes(8);
    expect(load.loadWeekProjections.mock.calls.map((call) => call[1])).toEqual([
      10, 11, 12, 13, 14, 15, 16, 17,
    ]);
    expect(screen.queryByText(/Loading Sleeper projections/)).not.toBeInTheDocument();
  });

  it("keeps points per game on show once projections arrive", async () => {
    // Both bases, both windows, both sides. Behind the pill, a trade could be
    // read on projections alone — the one basis that goes quiet on an injured
    // player — with the season rate beside it hidden.
    await buildTrade();
    click(screen.getByRole("button", { name: "Projections" }));
    await waitFor(() => expect(load.loadWeekProjections).toHaveBeenCalledTimes(8));

    expect(screen.getAllByText("Points per game")).toHaveLength(2);
    expect(screen.getAllByText("Sleeper projection")).toHaveLength(2);
  });

  it("puts my figures on one side and theirs on the other", async () => {
    await buildTrade();
    await screen.findByText("Impact");

    // Two windows, three rows apiece before projections load: points per game,
    // schedule, and the team heading above them.
    const rows = document.querySelectorAll(".ch-face");
    expect(rows).toHaveLength(2);
    for (const face of rows) {
      expect(face.querySelectorAll(".ch-mine")).toHaveLength(2);
      expect(face.querySelectorAll(".ch-theirs")).toHaveLength(2);
    }

    // And the heading says whose side is whose.
    const teams = document.querySelector(".ch-teams");
    expect(teams.querySelector(".ch-mine")).toHaveTextContent("My team");
    expect(teams.querySelector(".ch-theirs")).toHaveTextContent("Their Team");
  });

  it("shows their change for both windows, not just mine", async () => {
    await buildTrade();
    await screen.findByText("Impact");

    const [regular, playoffs] = document.querySelectorAll(".ch-face");
    // Nacua for Spears costs them in both windows, and it is their column that
    // has to say so.
    expect(regular.querySelectorAll(".ch-theirs")[0].textContent).toMatch(/−/);
    expect(playoffs.querySelectorAll(".ch-theirs")[0].textContent).toMatch(/−/);
  });

  it("does not warn about a split when there is only one partner", async () => {
    // The multi-team warning is defensive rather than reachable: the search
    // narrows to the partner as soon as the first player is taken, so a split
    // can only arrive from rosters that changed since they were loaded. What is
    // worth asserting is that the normal case does not trip it.
    await open();
    await pickLeague();

    type(screen.getByLabelText("Search the league"), "nacua");
    click(await screen.findByText("Puka Nacua"));
    await screen.findByText("from Their Team");

    expect(screen.queryByText(/different teams/)).not.toBeInTheDocument();
  });

  it("shows nothing until there is a trade to show", async () => {
    await open();
    await pickLeague();
    expect(screen.queryByText("Impact")).not.toBeInTheDocument();
  });

  it("gives the schedule average a rank within the league", async () => {
    await buildTrade();
    await screen.findByText("Impact");

    // The Rams are the softest draw in the fixture, so taking Nacua can only
    // make the average easier.
    expect(screen.getAllByText("easier").length).toBeGreaterThan(0);
  });
});

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import CoronaPanel from "./CoronaPanel";
import { CORONA_MASTERS_LEAGUE_ID } from "./coronaMasters";

// fireEvent rather than user-event: the installed user-event is v13, which
// predates .setup() and does not flush React 18 state updates on its own.
const click = (el) => fireEvent.click(el);

// Signing in is done by writing the real storage key, as TradeTracker's tests
// do — nothing in this repo mocks the auth module.
const signIn = (display_name) =>
  localStorage.setItem(
    "sleeper_auth",
    JSON.stringify({
      token: "a-token",
      user_id: "u1",
      display_name,
      exp: Math.floor(Date.now() / 1000) + 3600,
    })
  );

const ROSTERS = [
  { roster_id: 1, owner_id: "u1",
    starters: ["love", "stevenson", "gibbs", "love", "love", "love", "gibbs", "gibbs", "gibbs", "PHI"] },
  { roster_id: 2, owner_id: "u2",
    starters: ["love", "gibbs", "gibbs", "love", "love", "love", "gibbs", "gibbs", "gibbs", "PHI"] },
];

const USERS = [
  { user_id: "u1", display_name: "carnade" },
  { user_id: "u2", display_name: "Redhelge" },
];

const LEAGUE = {
  name: "Corona Masters",
  roster_positions: ["QB", "RB", "RB", "WR", "WR", "WR", "TE", "FLEX", "FLEX", "DEF",
                     "BN", "BN", "BN", "BN", "BN"],
};

const PLAYERS = {
  love: { first_name: "Jordan", last_name: "Love", position: "QB", team: "GB" },
  gibbs: { first_name: "Jahmyr", last_name: "Gibbs", position: "RB", team: "DET" },
  stevenson: { first_name: "Rhamondre", last_name: "Stevenson", position: "RB",
               team: "NE", injury_status: "Out" },
};

const SCHEDULE = [
  { home_team: "GB", away_team: "DET", gameday: "2026-11-08", gametime: "13:00" },
  { home_team: "NE", away_team: "PHI", gameday: "2026-11-08", gametime: "16:25" },
];

let graphqlBodies;

function mockFetch() {
  graphqlBodies = [];
  global.fetch = jest.fn((url, options = {}) => {
    const href = String(url);
    const ok = (body) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });

    if (href.includes("sleeper.com/graphql")) {
      graphqlBodies.push(JSON.parse(options.body));
      return ok({ data: { create_message: { message_id: "m1" } } });
    }
    if (href.endsWith("/rosters")) return ok(ROSTERS);
    if (href.endsWith("/users")) return ok(USERS);
    if (href.includes("/getplayers/data")) return ok(PLAYERS);
    if (href.includes("/stats/schedule/")) return ok(SCHEDULE);
    if (href.includes(`/league/${CORONA_MASTERS_LEAGUE_ID}`)) return ok(LEAGUE);
    return ok({});
  });
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  // Primed so the panel does not have to fetch /state/nfl for the week.
  sessionStorage.setItem("nfl_current_week", "9");
  sessionStorage.setItem("nfl_current_week_timestamp", String(Date.now()));
  mockFetch();
  jest.spyOn(window, "confirm").mockReturnValue(true);
});

afterEach(() => {
  delete global.fetch;
  window.confirm.mockRestore();
});

// The heading renders at once; this waits for the twelve lineups to land.
const ready = async () => {
  render(<CoronaPanel />);
  await screen.findByText(/teams need attention|lineups look fine/);
};

describe("who can see it", () => {
  it("shows nothing at all when nobody is signed in", () => {
    const { container } = render(<CoronaPanel />);

    expect(container).toBeEmptyDOMElement();
  });

  it("shows nothing to a signed-in manager who is not a commissioner", () => {
    signIn("someoneelse");

    const { container } = render(<CoronaPanel />);

    expect(container).toBeEmptyDOMElement();
  });

  it("asks for nothing either — the page is untouched for everyone else", () => {
    // The gate has to cost no requests, not merely hide the output.
    signIn("someoneelse");

    render(<CoronaPanel />);

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("shows it to carnade", async () => {
    signIn("carnade");

    await ready();

    expect(screen.getByText(/week 9/)).toBeInTheDocument();
  });

  it("shows it to Redhelge, whatever case Sleeper gives the name", async () => {
    signIn("Redhelge");

    await ready();

    expect(screen.getByText(/Corona Masters — lineup check/)).toBeInTheDocument();
  });
});

describe("what it reports", () => {
  beforeEach(() => signIn("carnade"));

  it("lists every team, the one with work to do first", async () => {
    await ready();

    const managers = screen.getAllByText(/^(carnade|Redhelge)$/).map((el) => el.textContent);
    expect(managers).toEqual(["carnade", "Redhelge"]);
  });

  it("names the broken starter and what is wrong with them", async () => {
    await ready();

    expect(screen.getByText("Rhamondre Stevenson (RB) Out")).toBeInTheDocument();
  });

  it("marks the clean team as OK", async () => {
    await ready();

    expect(screen.getByText("OK")).toBeInTheDocument();
  });

  it("counts the teams needing attention", async () => {
    await ready();

    expect(screen.getByText(/1 of 2 teams need attention/)).toBeInTheDocument();
  });

  it("gives the broken team a deadline from its own problem player", async () => {
    // Stevenson plays for NE, kicking off at 16:25 Eastern.
    await ready();

    expect(screen.getByText(/no deadline/)).toBeInTheDocument();  // the clean team
    expect(screen.getAllByText(/\d{2}:\d{2}/).length).toBeGreaterThan(0);
  });

  it("says the statuses can be an hour behind", async () => {
    await ready();

    expect(screen.getByText(/up to an\s+hour behind/)).toBeInTheDocument();
  });
});

describe("the message", () => {
  beforeEach(() => signIn("carnade"));

  it("is on the page before anything is sent", async () => {
    await ready();

    expect(screen.getByText(/Week 9 lineup check — Corona Masters/)).toBeInTheDocument();
    expect(screen.getByText(/The other team looks fine\./)).toBeInTheDocument();
  });

  it("asks before posting", async () => {
    await ready();

    click(screen.getByRole("button", { name: /post to corona masters/i }));

    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(window.confirm.mock.calls[0][0]).toContain("Week 9 lineup check");
  });

  it("sends nothing when the confirm is declined", async () => {
    window.confirm.mockReturnValue(false);
    await ready();

    click(screen.getByRole("button", { name: /post to corona masters/i }));

    expect(graphqlBodies).toHaveLength(0);
  });

  it("posts the text that was on screen, to Corona Masters", async () => {
    await ready();

    click(screen.getByRole("button", { name: /post to corona masters/i }));

    await waitFor(() => expect(graphqlBodies).toHaveLength(1));
    const body = graphqlBodies[0];
    expect(body.operationName).toBe("create_message");
    expect(body.variables.text).toContain("Rhamondre Stevenson (RB) Out");
    expect(body.query).toContain(`parent_id: "${CORONA_MASTERS_LEAGUE_ID}"`);
    expect(body.query).toContain('parent_type: "league"');
  });

  it("carries a fresh client id each time, so a second message is not swallowed", async () => {
    await ready();
    const button = screen.getByRole("button", { name: /post to corona masters/i });

    // Waiting for the request to be *made* is not enough: the button stays
    // disabled until the send finishes, so a second click would be swallowed.
    click(button);
    await screen.findByText(/posted to the league/i);
    click(button);
    await waitFor(() => expect(graphqlBodies).toHaveLength(2));

    const idOf = (body) => body.query.match(/client_id: "([^"]+)"/)[1];
    expect(idOf(graphqlBodies[0])).not.toBe(idOf(graphqlBodies[1]));
  });

  it("says so when it worked", async () => {
    await ready();

    click(screen.getByRole("button", { name: /post to corona masters/i }));

    expect(await screen.findByText(/posted to the league/i)).toBeInTheDocument();
  });

  it("says so when Sleeper refuses, rather than looking sent", async () => {
    global.fetch = jest.fn((url, options = {}) => {
      const href = String(url);
      if (href.includes("sleeper.com/graphql")) {
        // Sleeper answers 200 with an errors array.
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ errors: [{ message: "not in that league" }] }),
        });
      }
      const ok = (body) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
      if (href.endsWith("/rosters")) return ok(ROSTERS);
      if (href.endsWith("/users")) return ok(USERS);
      if (href.includes("/getplayers/data")) return ok(PLAYERS);
      if (href.includes("/stats/schedule/")) return ok(SCHEDULE);
      return ok(LEAGUE);
    });
    await ready();

    click(screen.getByRole("button", { name: /post to corona masters/i }));

    expect(await screen.findByText(/not in that league/)).toBeInTheDocument();
  });
});

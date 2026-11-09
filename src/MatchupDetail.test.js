import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

import MatchupDetail, { SidePlayer, SlotRow, Totals } from "./MatchupDetail";
import { detailPair } from "./gamedayDetail";

// user-event is v13 here and does not flush React 18 state, so interactions go
// through fireEvent — the repo-wide convention.
const click = (el) => fireEvent.click(el);

const SLOTS = ["QB", "RB", "FLEX"];

const PLAYER_MAP = {
  "1": { first_name: "Jordan", last_name: "Love", position: "QB", team: "GB" },
  "2": { first_name: "Jahmyr", last_name: "Gibbs", position: "RB", team: "DET" },
  "3": { first_name: "Puka", last_name: "Nacua", position: "WR", team: "LAR" },
  "4": { first_name: "Patrick", last_name: "Mahomes", position: "QB", team: "KC" },
  "5": { first_name: "James", last_name: "Cook", position: "RB", team: "BUF" },
  "6": { first_name: "CeeDee", last_name: "Lamb", position: "WR", team: "DAL" },
};

const SCORING = { pass_yd: 0.04, pass_td: 4, rec: 0.5, rec_yd: 0.1 };
const PROJECTIONS = {
  "1": { pts_ppr: 21, pass_yd: 275, pass_td: 2 },
  "4": { pts_ppr: 19, pass_yd: 300, pass_td: 1 },
};

const STAT_LINES = {
  "1": { gp: 1, pass_yd: 242, pass_td: 1 },
  "2": { gp: 1, rush_att: 9, rush_yd: 85, rush_td: 1, rec: 3, rec_tgt: 3, rec_yd: 7 },
  "3": { gp: 1, rec: 4, rec_tgt: 6, rec_yd: 65 },
};

const pair = (over = {}) =>
  detailPair({
    mine: {
      roster_id: 1,
      starters: ["1", "2", "3"],
      starters_points: [18.5, 29.0, 12.1],
      players_points: {},
    },
    theirs: {
      roster_id: 2,
      starters: ["4", "5", "6"],
      starters_points: [24.1, 8.2, 0],
      players_points: {},
    },
    playerMap: PLAYER_MAP,
    slots: SLOTS,
    projections: PROJECTIONS,
    scoring: SCORING,
    ...over,
  });

const show = (props = {}) =>
  render(
    <MatchupDetail
      detail={pair()}
      oppName="rewbster"
      statLines={STAT_LINES}
      showStatLines={false}
      onToggleStatLines={() => {}}
      {...props}
    />
  );

describe("MatchupDetail", () => {
  it("shows both lineups", () => {
    show();

    expect(screen.getByText("Jordan Love")).toBeInTheDocument();
    expect(screen.getByText("Patrick Mahomes")).toBeInTheDocument();
    expect(screen.getByText("CeeDee Lamb")).toBeInTheDocument();
  });

  it("labels each row with its roster slot", () => {
    show();

    // PositionPill renders the slot; FLEX comes through as a split pill.
    expect(screen.getByText("QB")).toBeInTheDocument();
    expect(screen.getByText("RB")).toBeInTheDocument();
  });

  it("puts each player's points beside their projection", () => {
    show();

    expect(screen.getByText("18.5")).toBeInTheDocument();
    // 275 * 0.04 + 2 * 4 = 19.0, rendered as "/ 19.0" beside the actual.
    expect(screen.getAllByText("/ 19.0").length).toBeGreaterThan(0);
  });

  it("totals the rows rather than borrowing the score above", () => {
    // If these ever disagree with the card, the panel is wrong about something,
    // and a total that quoted the card would hide it.
    show();

    expect(screen.getByText("59.6")).toBeInTheDocument();  // 18.5 + 29.0 + 12.1
    expect(screen.getByText("32.3")).toBeInTheDocument();  // 24.1 + 8.2 + 0
  });

  it("names the opponent on their side of the totals", () => {
    show();

    expect(screen.getByText("rewbster")).toBeInTheDocument();
    expect(screen.getByText("You")).toBeInTheDocument();
  });

  it("says a player has no projection rather than showing nought", () => {
    show();

    // Gibbs, Nacua and the whole opposing side bar Mahomes have no projection
    // in this fixture. A dash, not 0.0, which would read as a forecast of none.
    expect(screen.getAllByText("/ —").length).toBe(4);
    expect(screen.queryByText("/ 0.0")).not.toBeInTheDocument();
  });

  it("hides the stat lines until asked", () => {
    show({ showStatLines: false });

    expect(screen.queryByText("242 pass yd, 1 TD")).not.toBeInTheDocument();
  });

  it("shows a position-shaped stat line when asked", () => {
    show({ showStatLines: true });

    expect(screen.getByText("242 pass yd, 1 TD")).toBeInTheDocument();
    expect(screen.getByText("9 car, 85 yd, 1 TD · 3/3, 7 yd")).toBeInTheDocument();
    expect(screen.getByText("4/6, 65 yd")).toBeInTheDocument();
  });

  it("dashes a stat line for a player with no stats yet", () => {
    // Before kickoff there is nothing to show, and a blank would read as broken.
    show({ showStatLines: true, statLines: { 1: STAT_LINES["1"] } });

    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThan(1);
  });

  it("offers the toggle and reports its state", () => {
    const onToggleStatLines = jest.fn();
    show({ showStatLines: false, onToggleStatLines });

    const toggle = screen.getByRole("button", { name: /show stat lines/i });
    expect(toggle).toHaveAttribute("aria-pressed", "false");

    click(toggle);

    expect(onToggleStatLines).toHaveBeenCalledTimes(1);
  });

  it("offers to hide them once they are on", () => {
    show({ showStatLines: true });

    expect(screen.getByRole("button", { name: /hide stat lines/i }))
      .toHaveAttribute("aria-pressed", "true");
  });

  it("says so on a bye rather than drawing half a table", () => {
    render(<MatchupDetail detail={pair({ theirs: null })} oppName="Bye" />);

    expect(screen.getByText(/bye week/i)).toBeInTheDocument();
    expect(screen.queryByText("Jordan Love")).not.toBeInTheDocument();
  });

  it("says so when there is no lineup at all", () => {
    render(<MatchupDetail detail={null} />);

    expect(screen.getByText(/no lineup to show/i)).toBeInTheDocument();
  });
});

describe("SidePlayer", () => {
  it("marks an unfilled slot as empty", () => {
    render(<SidePlayer row={{ slot: "RB", id: null }} align="mine" />);

    expect(screen.getByText("empty")).toBeInTheDocument();
  });

  it("carries the team in the hover text", () => {
    const row = { id: "2", name: "Jahmyr Gibbs", team: "DET", actual: 29, projected: 17.5,
                  hasProjection: true };
    render(<SidePlayer row={row} align="mine" />);

    expect(screen.getByTitle("Jahmyr Gibbs · DET")).toBeInTheDocument();
  });
});

describe("SlotRow", () => {
  it("renders a player either side of the slot", () => {
    const mine = { id: "1", name: "Jordan Love", actual: 18.5, hasProjection: false };
    const theirs = { id: "4", name: "Patrick Mahomes", actual: 24.1, hasProjection: false };

    render(<SlotRow slot="QB" mine={mine} theirs={theirs} statsFor={() => null} />);

    expect(screen.getByText("Jordan Love")).toBeInTheDocument();
    expect(screen.getByText("Patrick Mahomes")).toBeInTheDocument();
  });
});

describe("Totals", () => {
  it("adds up both sides", () => {
    const rows = [{ actual: 10, projected: 12 }, { actual: 5, projected: 6 }];

    render(<Totals mine={rows} theirs={rows} myName="You" oppName="Them" />);

    expect(screen.getAllByText("15.0")).toHaveLength(2);
    expect(screen.getAllByText("/ 18.0")).toHaveLength(2);
  });
});

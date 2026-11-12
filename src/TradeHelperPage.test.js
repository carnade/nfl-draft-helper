import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

import TradeHelperPage from "./TradeHelperPage";

// All three children fetch on mount, so they are stood in for here — this is a
// test of the wrapper: which pane is showing, whether the others are still
// alive, what happens to a player picked in the Finder, and whether the
// Contender pane is told it is the one being looked at.

// Reached through `global` because jest hoists mock factories above everything
// else in the file and refuses to let them close over ordinary module
// variables. `global` is on its allow-list.
global.__paneMounts = { trade: 0, finder: 0, contender: 0 };
global.__playersAdded = [];
global.__contenderActive = [];
const mounts = global.__paneMounts;
const added = global.__playersAdded;
const contenderActive = global.__contenderActive;

jest.mock("./TradeAnalyzer", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: React.forwardRef(function FakeTradeAnalyzer(_props, ref) {
      React.useEffect(() => {
        global.__paneMounts.trade += 1;
      }, []);
      React.useImperativeHandle(ref, () => ({
        addPlayerById: (id, team) => {
          global.__playersAdded.push([id, team]);
        },
      }));
      return <div data-testid="trade-pane">the trade</div>;
    }),
  };
});

jest.mock("./PlayerFinder", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: function FakePlayerFinder({ onAddPlayer }) {
      React.useEffect(() => {
        global.__paneMounts.finder += 1;
      }, []);
      return (
        <div data-testid="finder-pane">
          <button type="button" onClick={() => onAddPlayer({ id: "4034" })}>
            add a player
          </button>
        </div>
      );
    },
  };
});

jest.mock("./ContenderTab", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: function FakeContenderTab({ active, onSendTrade }) {
      React.useEffect(() => {
        global.__paneMounts.contender += 1;
      }, []);
      global.__contenderActive.push(active);
      return (
        <div data-testid="contender-pane">
          {String(active)}
          <button
            type="button"
            onClick={() => onSendTrade({ give: ["g1", "g2"], get: ["t1"] })}
          >
            send the trade
          </button>
        </div>
      );
    },
  };
});

const click = (el) => fireEvent.click(el);
const tab = (name) => screen.getByRole("tab", { name });

beforeEach(() => {
  mounts.trade = 0;
  mounts.finder = 0;
  mounts.contender = 0;
  added.length = 0;
  contenderActive.length = 0;
});

describe("TradeHelperPage", () => {
  it("shows the Trade Helper first", () => {
    render(<TradeHelperPage userName="carnade" setUserName={() => {}} />);

    expect(tab("Trade Helper")).toHaveAttribute("aria-selected", "true");
    expect(tab("Player Finder")).toHaveAttribute("aria-selected", "false");
    expect(tab("Contender Helper")).toHaveAttribute("aria-selected", "false");
  });

  it("mounts every pane immediately, not just the visible one", () => {
    render(<TradeHelperPage userName="carnade" setUserName={() => {}} />);

    expect(screen.getByTestId("trade-pane")).toBeInTheDocument();
    expect(screen.getByTestId("finder-pane")).toBeInTheDocument();
    expect(screen.getByTestId("contender-pane")).toBeInTheDocument();
    expect(mounts).toEqual({ trade: 1, finder: 1, contender: 1 });
  });

  it("hides the inactive pane rather than unmounting it", () => {
    render(<TradeHelperPage userName="carnade" setUserName={() => {}} />);

    click(tab("Player Finder"));

    expect(screen.getByTestId("trade-pane")).toBeInTheDocument();
    expect(screen.getByTestId("trade-pane").closest(".thp-hidden")).not.toBeNull();
    expect(screen.getByTestId("finder-pane").closest(".thp-hidden")).toBeNull();
  });

  it("does not remount the Trade Helper when the tab changes", () => {
    // The regression that would quietly undo the whole flow: the Trade Helper
    // keeps the trade in component state and refetches Sleeper's projections on
    // mount, so a remount would empty a half-built trade every time the Finder
    // was opened to add the next player.
    render(<TradeHelperPage userName="carnade" setUserName={() => {}} />);

    click(tab("Player Finder"));
    click(tab("Trade Helper"));
    click(tab("Player Finder"));

    expect(mounts).toEqual({ trade: 1, finder: 1, contender: 1 });
  });

  it("sends a picked player to the other party's side", () => {
    render(<TradeHelperPage userName="carnade" setUserName={() => {}} />);
    click(tab("Player Finder"));

    click(screen.getByRole("button", { name: "add a player" }));

    expect(added).toEqual([["4034", "team2"]]);
  });

  it("stays on the Finder after adding, so several can be picked", () => {
    render(<TradeHelperPage userName="carnade" setUserName={() => {}} />);
    click(tab("Player Finder"));

    click(screen.getByRole("button", { name: "add a player" }));
    click(screen.getByRole("button", { name: "add a player" }));

    expect(tab("Player Finder")).toHaveAttribute("aria-selected", "true");
    expect(added).toHaveLength(2);
  });

  // The Contender pane is mounted from the start like the others, but it is the
  // one with an eight-week, 17 MB horizon to download, so it is told whether
  // anyone is actually looking at it and waits to be asked.
  it("tells the Contender pane it is not being looked at", () => {
    render(<TradeHelperPage userName="carnade" setUserName={() => {}} />);

    expect(screen.getByTestId("contender-pane")).toBeInTheDocument();
    expect(contenderActive.every((value) => value === false)).toBe(true);
  });

  it("tells it when it becomes the visible tab", () => {
    render(<TradeHelperPage userName="carnade" setUserName={() => {}} />);

    click(tab("Contender Helper"));

    expect(tab("Contender Helper")).toHaveAttribute("aria-selected", "true");
    expect(contenderActive[contenderActive.length - 1]).toBe(true);
    expect(screen.getByTestId("contender-pane").closest(".thp-hidden")).toBeNull();
  });

  it("keeps it mounted when it is left again", () => {
    render(<TradeHelperPage userName="carnade" setUserName={() => {}} />);

    click(tab("Contender Helper"));
    click(tab("Trade Helper"));

    expect(screen.getByTestId("contender-pane")).toBeInTheDocument();
    expect(screen.getByTestId("contender-pane").closest(".thp-hidden")).not.toBeNull();
    expect(mounts.contender).toBe(1);
  });

  // The Contender Helper hands a whole trade over rather than one player.
  it("puts each side of a sent trade on the right panel", () => {
    render(<TradeHelperPage userName="carnade" setUserName={() => {}} />);
    click(tab("Contender Helper"));

    click(screen.getByRole("button", { name: "send the trade" }));

    // team2 is the "<user> gets..." panel, so it takes what the trade brings
    // in; team1 is headed "Trade Partner gets..." and takes what goes out.
    // Backwards, this would read every trade as its own mirror image.
    expect(added).toEqual([
      ["g1", "team1"],
      ["g2", "team1"],
      ["t1", "team2"],
    ]);
  });

  it("switches to the Trade Helper after sending, unlike the Finder's add", () => {
    // A single action whose whole point is to see the trade priced the other
    // way. Staying put would look like nothing had happened.
    render(<TradeHelperPage userName="carnade" setUserName={() => {}} />);
    click(tab("Contender Helper"));

    click(screen.getByRole("button", { name: "send the trade" }));

    expect(tab("Trade Helper")).toHaveAttribute("aria-selected", "true");
    expect(mounts).toEqual({ trade: 1, finder: 1, contender: 1 });
  });
});

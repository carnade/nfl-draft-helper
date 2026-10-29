import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

import TradeHelperPage from "./TradeHelperPage";

// Both children fetch on mount, so they are stood in for here — this is a test
// of the wrapper: which pane is showing, whether the other one is still alive,
// and what happens to a player picked in the Finder.

// Reached through `global` because jest hoists mock factories above everything
// else in the file and refuses to let them close over ordinary module
// variables. `global` is on its allow-list.
global.__paneMounts = { trade: 0, finder: 0 };
global.__playersAdded = [];
const mounts = global.__paneMounts;
const added = global.__playersAdded;

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

const click = (el) => fireEvent.click(el);
const tab = (name) => screen.getByRole("tab", { name });

beforeEach(() => {
  mounts.trade = 0;
  mounts.finder = 0;
  added.length = 0;
});

describe("TradeHelperPage", () => {
  it("shows the Trade Helper first", () => {
    render(<TradeHelperPage userName="carnade" setUserName={() => {}} />);

    expect(tab("Trade Helper")).toHaveAttribute("aria-selected", "true");
    expect(tab("Player Finder")).toHaveAttribute("aria-selected", "false");
  });

  it("mounts both panes immediately, not just the visible one", () => {
    render(<TradeHelperPage userName="carnade" setUserName={() => {}} />);

    expect(screen.getByTestId("trade-pane")).toBeInTheDocument();
    expect(screen.getByTestId("finder-pane")).toBeInTheDocument();
    expect(mounts).toEqual({ trade: 1, finder: 1 });
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

    expect(mounts).toEqual({ trade: 1, finder: 1 });
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
});

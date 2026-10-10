import React from "react";
import { render, screen, within, fireEvent } from "@testing-library/react";
import LeagueIssues from "./LeagueIssues";

const issue = (over = {}) => ({
  leagueId: "L1",
  leagueName: "Fantasy Fools",
  rosterId: 7,
  reserve: ["already1", "already2"],
  freeSlots: 2,
  oversubscribed: false,
  candidates: [
    { id: "a", name: "Xavier Legette", status: "IR", position: "WR" },
    { id: "b", name: "Michael Pittman", status: "IR", position: "WR" },
  ],
  ...over,
});

const boxes = () => screen.getAllByRole("checkbox");

// fireEvent rather than user-event: the installed user-event is v13, which
// predates .setup() and does not flush React 18 state updates on its own.
const click = (el) => fireEvent.click(el);
const fixButton = () => screen.getByRole("button", { name: "Fix" });

function setup(props = {}) {
  const onApplyIr = jest.fn().mockResolvedValue(undefined);
  render(
    <LeagueIssues issues={[issue()]} canEdit onApplyIr={onApplyIr} {...props} />
  );
  return { onApplyIr };
}

describe("the panel", () => {
  it("renders nothing when there is nothing wrong", () => {
    const { container } = render(
      <LeagueIssues issues={[]} canEdit onApplyIr={jest.fn()} />
    );
    // An empty "no issues" box is just something to scroll past every week.
    expect(container).toBeEmptyDOMElement();
  });

  it("states the problem and names the league", () => {
    setup();
    expect(
      screen.getByText("2 players on the bench could be on injured reserve")
    ).toBeInTheDocument();
    expect(screen.getByText(/Fantasy Fools — 2 slots free/)).toBeInTheDocument();
  });

  it("uses the singular for one player and one slot", () => {
    setup({
      issues: [issue({ freeSlots: 1, candidates: [issue().candidates[0]] })],
    });
    expect(
      screen.getByText("A player on the bench could be on injured reserve")
    ).toBeInTheDocument();
    expect(screen.getByText(/1 slot free/)).toBeInTheDocument();
  });

  it("offers no Fix button without a Sleeper login", () => {
    setup({ canEdit: false });
    expect(screen.queryByRole("button", { name: "Fix" })).not.toBeInTheDocument();
    expect(screen.getByText("sign in to fix")).toBeInTheDocument();
  });
});

describe("the dialog", () => {
  it("pre-ticks everyone when they all fit", async () => {
    setup();
    click(fixButton());
    expect(boxes().every((b) => b.checked)).toBe(true);
    expect(screen.getByText("2 of 2 selected")).toBeInTheDocument();
  });

  it("pre-ticks only as many as fit, and closes off the rest", async () => {
    setup({
      issues: [
        issue({
          freeSlots: 1,
          oversubscribed: true,
          candidates: [
            { id: "a", name: "First", status: "IR", position: "WR" },
            { id: "b", name: "Second", status: "IR", position: "RB" },
            { id: "c", name: "Third", status: "PUP", position: "TE" },
          ],
        }),
      ],
    });
    click(fixButton());

    const [first, second, third] = boxes();
    expect(first.checked).toBe(true);
    expect(second.checked).toBe(false);
    expect(third.checked).toBe(false);
    // Closed off rather than hidden, so you can see who else qualifies.
    expect(second).toBeDisabled();
    expect(third).toBeDisabled();
  });

  it("re-opens the others when one is un-ticked", async () => {
    setup({
      issues: [
        issue({
          freeSlots: 1,
          oversubscribed: true,
          candidates: [
            { id: "a", name: "First", status: "IR", position: "WR" },
            { id: "b", name: "Second", status: "IR", position: "RB" },
          ],
        }),
      ],
    });
    click(fixButton());
    expect(boxes()[1]).toBeDisabled();

    click(boxes()[0]);
    expect(boxes()[1]).toBeEnabled();
    expect(screen.getByText("0 of 1 selected")).toBeInTheDocument();

    click(boxes()[1]);
    expect(boxes()[0]).toBeDisabled();
    expect(boxes()[1].checked).toBe(true);
  });

  it("sends the players already on reserve along with the new ones", async () => {
    // The whole list is sent, not a delta — anyone left out comes straight
    // back off reserve.
    const { onApplyIr } = setup();
    click(fixButton());
    click(screen.getByRole("button", { name: "Continue" }));

    expect(onApplyIr).toHaveBeenCalledTimes(1);
    const [sentIssue, ids] = onApplyIr.mock.calls[0];
    expect(ids).toEqual(["a", "b"]);
    expect(sentIssue.reserve).toEqual(["already1", "already2"]);
  });

  it("will not continue with nothing selected", async () => {
    setup();
    click(fixButton());
    click(boxes()[0]);
    click(boxes()[1]);
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  it("says plainly that this touches the real roster", async () => {
    setup();
    click(fixButton());
    expect(screen.getByText("This changes your roster on Sleeper.")).toBeInTheDocument();
  });

  it("closes on Cancel without applying anything", async () => {
    const { onApplyIr } = setup();
    click(fixButton());
    click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onApplyIr).not.toHaveBeenCalled();
  });

  it("keeps the dialog open and shows why when Sleeper refuses", async () => {
    const onApplyIr = jest.fn().mockRejectedValue(new Error("Roster is locked"));
    render(<LeagueIssues issues={[issue()]} canEdit onApplyIr={onApplyIr} />);

    click(fixButton());
    click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByText("Roster is locked")).toBeInTheDocument();
    // Still open, with the selection it refers to still on screen.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("shows each candidate's status and position", async () => {
    setup();
    click(fixButton());
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getAllByText("IR")).toHaveLength(2);
    expect(within(dialog).getAllByTitle("WR")).toHaveLength(2);
  });
});

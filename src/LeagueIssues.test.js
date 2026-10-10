import React from "react";
import {
  render,
  screen,
  within,
  fireEvent,
  waitForElementToBeRemoved,
} from "@testing-library/react";
import LeagueIssues from "./LeagueIssues";

const fools = {
  leagueId: "L1",
  leagueName: "Fantasy Fools",
  rosterId: 5,
  reserve: ["already1", "already2"],
  freeSlots: 2,
  oversubscribed: false,
  candidates: [
    { id: "a", name: "Xavier Legette", status: "IR", position: "WR" },
    { id: "b", name: "Barion Brown", status: "PUP", position: "WR" },
  ],
};

const swedish = {
  leagueId: "L2",
  leagueName: "Swedish Dynasty Super League",
  rosterId: 3,
  reserve: ["r1", "r2"],
  freeSlots: 1,
  oversubscribed: true,
  candidates: [
    { id: "c", name: "Jaxson Dart", status: "IR", position: "QB" },
    { id: "d", name: "Jadarian Price", status: "IR", position: "RB" },
  ],
};

// fireEvent rather than user-event: the installed user-event is v13, which
// predates .setup() and does not flush React 18 state updates on its own.
const click = (el) => fireEvent.click(el);
const fixButton = () => screen.getByRole("button", { name: "Fix" });
const continueButton = () => screen.getByRole("button", { name: /Continue|Moving/ });
// Scoped to the dialog: each league name now appears on the card as well, so
// an unscoped lookup matches two elements.
const leagueBlock = (name) =>
  within(screen.getByRole("dialog")).getByText(name).closest("section");

function setup({ issues = [fools, swedish], onApplyIr, ...rest } = {}) {
  const apply = onApplyIr || jest.fn().mockResolvedValue([]);
  render(<LeagueIssues issues={issues} canEdit onApplyIr={apply} {...rest} />);
  return { onApplyIr: apply };
}

describe("the panel", () => {
  it("renders nothing when there is nothing wrong", () => {
    const { container } = render(
      <LeagueIssues issues={[]} canEdit onApplyIr={jest.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("is one card for every league, not one per league", () => {
    setup();
    expect(screen.getAllByRole("button", { name: "Fix" })).toHaveLength(1);
    expect(screen.getByText("4 players could be on injured reserve")).toBeInTheDocument();
    // One league per line, not run together into a single phrase.
    // One league per line, each with the room it has, and the singular for one.
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Fantasy Fools2 slots free",
      "Swedish Dynasty Super League1 slot free",
    ]);
  });

  it("uses the singular for one player", () => {
    setup({ issues: [{ ...fools, candidates: [fools.candidates[0]] }] });
    expect(screen.getByText("1 player could be on injured reserve")).toBeInTheDocument();
  });

  it("offers no Fix button without a Sleeper login", () => {
    setup({ canEdit: false });
    expect(screen.queryByRole("button", { name: "Fix" })).not.toBeInTheDocument();
    expect(screen.getByText("sign in to fix")).toBeInTheDocument();
  });
});

describe("the dialog", () => {
  it("lists every league in one dialog", () => {
    setup();
    click(fixButton());
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Fantasy Fools")).toBeInTheDocument();
    expect(within(dialog).getByText("Swedish Dynasty Super League")).toBeInTheDocument();
    expect(within(dialog).getAllByRole("checkbox")).toHaveLength(4);
  });

  it("applies each league's own slot limit independently", () => {
    setup();
    click(fixButton());

    // Fools has two free slots and two candidates, so both are ticked.
    const foolsBoxes = within(leagueBlock("Fantasy Fools")).getAllByRole("checkbox");
    expect(foolsBoxes.map((b) => b.checked)).toEqual([true, true]);

    // Swedish has one free slot and two candidates, so only the first is.
    const swedishBoxes = within(
      leagueBlock("Swedish Dynasty Super League")
    ).getAllByRole("checkbox");
    expect(swedishBoxes.map((b) => b.checked)).toEqual([true, false]);
    expect(swedishBoxes[1]).toBeDisabled();
  });

  it("unticking in one league does not open slots in another", () => {
    setup();
    click(fixButton());

    const foolsBoxes = within(leagueBlock("Fantasy Fools")).getAllByRole("checkbox");
    click(foolsBoxes[0]);

    const swedishBoxes = within(
      leagueBlock("Swedish Dynasty Super League")
    ).getAllByRole("checkbox");
    expect(swedishBoxes[1]).toBeDisabled();
  });

  it("re-opens the others in its own league when one is unticked", () => {
    setup();
    click(fixButton());
    const block = () => within(leagueBlock("Swedish Dynasty Super League"));

    expect(block().getAllByRole("checkbox")[1]).toBeDisabled();
    click(block().getAllByRole("checkbox")[0]);
    expect(block().getAllByRole("checkbox")[1]).toBeEnabled();
  });

  it("shows each league's own count", () => {
    setup();
    click(fixButton());
    expect(
      within(leagueBlock("Fantasy Fools")).getByText("2 of 2 free")
    ).toBeInTheDocument();
    expect(
      within(leagueBlock("Swedish Dynasty Super League")).getByText("1 of 1 free")
    ).toBeInTheDocument();
  });

  it("fixes every league in one click", () => {
    const { onApplyIr } = setup();
    click(fixButton());
    click(continueButton());

    expect(onApplyIr).toHaveBeenCalledTimes(1);
    const picks = onApplyIr.mock.calls[0][0];
    expect(picks).toHaveLength(2);
    expect(picks[0].issue.leagueName).toBe("Fantasy Fools");
    expect(picks[0].playerIds).toEqual(["a", "b"]);
    expect(picks[1].issue.leagueName).toBe("Swedish Dynasty Super League");
    expect(picks[1].playerIds).toEqual(["c"]);
  });

  it("leaves out a league nothing was selected in", () => {
    const { onApplyIr } = setup();
    click(fixButton());
    const foolsBoxes = within(leagueBlock("Fantasy Fools")).getAllByRole("checkbox");
    click(foolsBoxes[0]);
    click(foolsBoxes[1]);
    click(continueButton());

    const picks = onApplyIr.mock.calls[0][0];
    expect(picks.map((p) => p.issue.leagueName)).toEqual([
      "Swedish Dynasty Super League",
    ]);
  });

  it("counts the whole selection across leagues", () => {
    setup();
    click(fixButton());
    expect(
      screen.getByText(/3 players selected\. This changes your rosters on Sleeper\./)
    ).toBeInTheDocument();
  });

  it("will not continue with nothing selected anywhere", () => {
    setup();
    click(fixButton());
    screen.getAllByRole("checkbox").forEach((b) => {
      if (b.checked) click(b);
    });
    expect(continueButton()).toBeDisabled();
  });

  it("closes when every league went through", async () => {
    const onApplyIr = jest
      .fn()
      .mockResolvedValue([{ leagueId: "L1" }, { leagueId: "L2" }]);
    setup({ onApplyIr });
    click(fixButton());
    click(continueButton());

    // The Fix button never goes away — it is on the card behind the dialog —
    // so waiting for it would pass before anything had happened.
    await waitForElementToBeRemoved(() => screen.queryByRole("dialog"));
    expect(screen.getByRole("button", { name: "Fix" })).toBeInTheDocument();
  });

  it("keeps the dialog open and names the league that refused", async () => {
    // One league failing must not hide that the other worked, nor lose the
    // reason the first one gave.
    const onApplyIr = jest.fn().mockResolvedValue([
      { leagueId: "L1", leagueName: "Fantasy Fools" },
      { leagueId: "L2", leagueName: "Swedish", error: "Roster is locked" },
    ]);
    setup({ onApplyIr });
    click(fixButton());
    click(continueButton());

    expect(await screen.findByText("Roster is locked")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("closes on Cancel without applying anything", () => {
    const { onApplyIr } = setup();
    click(fixButton());
    click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onApplyIr).not.toHaveBeenCalled();
  });

  it("shows each candidate's status and position", () => {
    setup();
    click(fixButton());
    const block = within(leagueBlock("Fantasy Fools"));
    expect(block.getByText("IR")).toBeInTheDocument();
    expect(block.getByText("PUP")).toBeInTheDocument();
    expect(block.getAllByTitle("WR")).toHaveLength(2);
  });
});

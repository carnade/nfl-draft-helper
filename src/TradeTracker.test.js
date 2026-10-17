import React from "react";
import { render, screen } from "@testing-library/react";
import TradeTracker, { AssetRow, SideTable, TradeBlock, LeagueTrades, expiryLabel } from "./TradeTracker";

// user-event here is v13: no .setup(), and it does not flush React 18 state.
// Nothing in these tests interacts, so plain render is enough.

const table = (children) => render(<table><tbody>{children}</tbody></table>);

const player = (over = {}) => ({
  kind: "player", key: "p1", name: "Braelon Allen", position: "RB", team: "NYJ",
  age: 22, ktc: 4000, fc: 3000, projPg: 10, actualPg: 9.5, unknown: false, ...over,
});

const pick = (over = {}) => ({
  kind: "pick", key: "k1", name: "2027 Early 1st", position: "PICK", team: null,
  age: null, ktc: 6919, fc: 5049, projPg: null, actualPg: null,
  band: "Early", slot: 4, label: "1.04", reason: null, unknown: false, ...over,
});

const side = (assets) => ({
  assets,
  totals: { ktc: 1, fc: 1, projPg: 1, actualPg: 1, avgAge: 1, count: assets.length, unknown: 0 },
});

const trade = (over = {}) => ({
  id: "t1", direction: "incoming", isCounter: false, multiTeam: false,
  expiresAt: null, created: 1, unreadable: { draftPicks: [], faab: false },
  counterparties: [{ rosterId: 2, name: "rewbster" }],
  receive: side([player()]), give: side([pick()]),
  comparisons: [{ key: "ktc", label: "KeepTradeCut", delta: -2919, favours: "give" }],
  ...over,
});

afterEach(() => {
  localStorage.clear();
});

describe("expiryLabel", () => {
  const now = Date.UTC(2026, 9, 16, 12, 0, 0);
  it("counts down in the unit that fits", () => {
    expect(expiryLabel(now + 30 * 60000, now)).toBe("30m left");
    expect(expiryLabel(now + 5 * 3600000, now)).toBe("5h left");
    expect(expiryLabel(now + 5 * 86400000, now)).toBe("5d left");
  });

  it("says so once it has lapsed, and nothing when there is no expiry", () => {
    expect(expiryLabel(now - 1000, now)).toBe("expired");
    expect(expiryLabel(null, now)).toBeNull();
  });
});

describe("AssetRow", () => {
  it("shows a pick's projected slot under its name", () => {
    table(<AssetRow asset={pick()} />);
    expect(screen.getByText("2027 Early 1st")).toBeInTheDocument();
    expect(screen.getByText("1.04")).toBeInTheDocument();
  });

  it("explains why a pick has no slot rather than leaving it blank", () => {
    table(<AssetRow asset={pick({ band: null, label: null, reason: "no-order", ktc: null, fc: null })} />);
    expect(screen.getByText(/nobody has scored/i)).toBeInTheDocument();
  });

  it("renders a player's age and points", () => {
    table(<AssetRow asset={player()} />);
    expect(screen.getByText("Braelon Allen")).toBeInTheDocument();
    expect(screen.getByText("22")).toBeInTheDocument();
    expect(screen.getByText("4,000")).toBeInTheDocument();
  });
});

describe("SideTable", () => {
  it("says how many assets the total leaves out", () => {
    render(
      <SideTable
        title="You get"
        side={{ assets: [player()], totals: { ktc: 4000, fc: 3000, projPg: 10, actualPg: 9.5, avgAge: 22, count: 2, unknown: 1 } }}
      />
    );
    expect(screen.getByText("1 unpriced")).toBeInTheDocument();
  });

  it("renders an empty side without a totals row", () => {
    render(<SideTable title="You give" side={{ assets: [], totals: { count: 0, unknown: 0 } }} />);
    expect(screen.getByText("nothing")).toBeInTheDocument();
    expect(screen.queryByText("Total")).not.toBeInTheDocument();
  });
});

describe("TradeBlock", () => {
  it("badges an incoming trade as the one awaiting you", () => {
    render(<TradeBlock trade={trade()} now={Date.now()} />);
    expect(screen.getByText("Awaiting you")).toBeInTheDocument();
    expect(screen.getByText("rewbster")).toBeInTheDocument();
  });

  it("badges an outgoing trade as waiting on them", () => {
    render(<TradeBlock trade={trade({ direction: "outgoing" })} now={Date.now()} />);
    expect(screen.getByText("Waiting on them")).toBeInTheDocument();
  });

  it("flags a counter and a three-way", () => {
    render(
      <TradeBlock
        trade={trade({
          isCounter: true,
          multiTeam: true,
          counterparties: [{ rosterId: 2, name: "a" }, { rosterId: 3, name: "b" }],
        })}
        now={Date.now()}
      />
    );
    expect(screen.getByText("counter")).toBeInTheDocument();
    expect(screen.getByText("3-team")).toBeInTheDocument();
  });

  it("owns up to anything it could not read", () => {
    render(
      <TradeBlock
        trade={trade({ unreadable: { draftPicks: ["junk"], faab: true } })}
        now={Date.now()}
      />
    );
    expect(screen.getByText(/1 draft pick and a FAAB transfer/i)).toBeInTheDocument();
  });
});

describe("LeagueTrades", () => {
  const league = (over = {}) => ({
    leagueId: "L1", name: "Fantasy Fools", confidence: "ok",
    trades: [trade()], incoming: 1, outgoing: 0, ...over,
  });

  it("heads the card with the league and its tally", () => {
    render(<LeagueTrades league={league()} now={Date.now()} />);
    expect(screen.getByText("Fantasy Fools")).toBeInTheDocument();
    expect(screen.getByText("1 awaiting you")).toBeInTheDocument();
  });

  it("qualifies itself when there is no projected draft order", () => {
    render(<LeagueTrades league={league({ confidence: "none" })} now={Date.now()} />);
    expect(screen.getByText(/No projected draft order yet/i)).toBeInTheDocument();
  });

  it("says when the order is max points for alone", () => {
    render(<LeagueTrades league={league({ confidence: "low" })} now={Date.now()} />);
    expect(screen.getByText(/has not set a playoff count/i)).toBeInTheDocument();
  });
});

describe("TradeTracker", () => {
  it("asks for a login when there is no token", () => {
    render(<TradeTracker />);
    expect(screen.getByText(/must be logged in/i)).toBeInTheDocument();
  });

  it("says the sign-in expired rather than showing an empty page", () => {
    // An expired token answers every query with "unauthorized", which would
    // otherwise render identically to having no trades at all.
    localStorage.setItem(
      "sleeper_auth",
      JSON.stringify({ token: "stale", user_id: "u1", exp: Math.floor(Date.now() / 1000) - 60 })
    );
    render(<TradeTracker />);
    expect(screen.getByText(/sign-in has expired/i)).toBeInTheDocument();
  });
});

import { fetchPendingTrades, tradesDocument, CHUNK_SIZE } from "./pendingTrades";
import { SleeperAuthError } from "./sleeperGraphql";

const trade = (id, status = "proposed") => ({
  transaction_id: id,
  status,
  type: "trade",
  roster_ids: [2, 7],
});

const ok = (body) => ({ ok: true, status: 200, json: async () => body });

function stubFetch(responder) {
  const calls = [];
  global.fetch = jest.fn(async (url, init) => {
    calls.push(JSON.parse(init.body));
    return responder(calls.length - 1, JSON.parse(init.body));
  });
  return calls;
}

afterEach(() => {
  delete global.fetch;
});

describe("tradesDocument", () => {
  it("asks each league under its own alias", () => {
    const doc = tradesDocument(["111", "222"]);
    expect(doc).toContain("l0: league_transactions_filtered(");
    expect(doc).toContain("l1: league_transactions_filtered(");
    expect(doc).toContain('league_id: "111"');
    expect(doc).toContain('status_filters: ["proposed"]');
    expect(doc).toContain('type_filters: ["trade"]');
    // player_map is what covers a player the backend's own list has dropped.
    expect(doc).toContain("player_map");
  });
});

describe("fetchPendingTrades", () => {
  it("splits the leagues into chunks and maps each alias back to its league", async () => {
    const ids = Array.from({ length: 20 }, (_, i) => `L${i}`);
    stubFetch((n) =>
      ok({
        data: Object.fromEntries(
          Array.from({ length: n === 2 ? 4 : CHUNK_SIZE }, (_, i) => [`l${i}`, [trade(`t${n}-${i}`)]])
        ),
      })
    );

    const { byLeague, failed } = await fetchPendingTrades(ids, "tok");
    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(failed).toEqual([]);
    expect(Object.keys(byLeague)).toHaveLength(20);
    // The second chunk's first alias is the ninth league.
    expect(byLeague.L8[0].transaction_id).toBe("t1-0");
    expect(byLeague.L19[0].transaction_id).toBe("t2-3");
  });

  it("keeps the leagues that answered when one alias is refused", async () => {
    stubFetch(() =>
      ok({
        data: { l0: [trade("keep")], l1: null },
        errors: [{ message: "nope", path: ["l1"] }],
      })
    );

    const { byLeague, failed } = await fetchPendingTrades(["A", "B"], "tok");
    expect(byLeague.A[0].transaction_id).toBe("keep");
    expect(byLeague.B).toBeUndefined();
    expect(failed).toEqual(["B"]);
  });

  it("loses only the chunk that fell over", async () => {
    const ids = Array.from({ length: 16 }, (_, i) => `L${i}`);
    stubFetch((n) =>
      n === 1
        ? { ok: false, status: 500, json: async () => ({}) }
        : ok({ data: Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`l${i}`, []])) })
    );

    const { byLeague, failed } = await fetchPendingTrades(ids, "tok");
    expect(failed).toEqual(ids.slice(8));
    expect(Object.keys(byLeague)).toEqual(ids.slice(0, 8));
  });

  it("throws on an expired sign-in rather than reporting no trades", async () => {
    // Forty leagues with nothing pending and forty leagues we could not ask
    // look identical from the outside, so this one must not be swallowed.
    stubFetch(() => ok({ data: null, errors: [{ code: "unauthorized", message: "Unauthorized" }] }));
    await expect(fetchPendingTrades(["A"], "stale")).rejects.toThrow(SleeperAuthError);
  });

  it("lets an abort through untouched", async () => {
    stubFetch(() => {
      const err = new Error("aborted");
      err.name = "AbortError";
      throw err;
    });
    await expect(fetchPendingTrades(["A"], "tok")).rejects.toThrow("aborted");
  });

  it("reports a chunk once per chunk, in order", async () => {
    const ids = Array.from({ length: 12 }, (_, i) => `L${i}`);
    stubFetch(() => ok({ data: Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`l${i}`, []])) }));

    const seen = [];
    await fetchPendingTrades(ids, "tok", { onChunk: ({ byLeague }) => seen.push(Object.keys(byLeague).length) });
    expect(seen).toEqual([8, 12]);
  });

  it("drops anything that is not actually still proposed", async () => {
    stubFetch(() => ok({ data: { l0: [trade("live"), trade("gone", "rejected")] } }));
    const { byLeague } = await fetchPendingTrades(["A"], "tok");
    expect(byLeague.A.map((t) => t.transaction_id)).toEqual(["live"]);
  });

  it("treats a null list with no error as a miss, not an empty league", async () => {
    stubFetch(() => ok({ data: { l0: null } }));
    const { byLeague, failed } = await fetchPendingTrades(["A"], "tok");
    expect(byLeague.A).toBeUndefined();
    expect(failed).toEqual(["A"]);
  });
});

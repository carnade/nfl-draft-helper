// Talking to Sleeper's GraphQL endpoint.
//
// Five places in this app already hand-roll this fetch with the same four
// headers and the same body shape, and only one of them checks for errors.
// That matters more here than usual, because Sleeper answers a failed query
// with HTTP 200 and an `errors` array — so a caller that only looks at the
// status code reads a refusal as an empty result.
//
// Two entry points rather than one, because batched and unbatched queries want
// opposite things from a partial failure. A mutation that half worked is an
// error. A document asking about forty leagues where one league refused is
// thirty-nine useful answers.

const ENDPOINT = "https://sleeper.com/graphql";

/** An expired or rejected token, which is worth telling the user about. */
export class SleeperAuthError extends Error {
  constructor(message = "Your Sleeper sign-in has expired") {
    super(message);
    this.name = "SleeperAuthError";
  }
}

const looksUnauthorized = (errors) =>
  (errors || []).some(
    (e) =>
      e?.code === "unauthorized" ||
      /unauthor/i.test(e?.message || "")
  );

async function post({ op, query, variables = {}, token, signal }) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-platform": "web",
      authorization: token,
      "x-sleeper-graphql-op": op,
    },
    body: JSON.stringify({ operationName: op, variables, query }),
    signal,
  });

  const json = await res.json().catch(() => null);
  if (looksUnauthorized(json?.errors)) throw new SleeperAuthError();
  if (!res.ok && !json?.data) throw new Error(`Sleeper returned ${res.status}`);
  return json || {};
}

/**
 * One query, all or nothing.
 *
 * Throws on anything Sleeper complains about, which is what a caller writing
 * data or reading a single league wants.
 */
export async function sleeperGraphql({ op, query, variables, token, signal }) {
  const json = await post({ op, query, variables, token, signal });
  if (json.errors?.length) {
    throw new Error(json.errors[0]?.message || "Sleeper rejected the query");
  }
  if (!json.data) throw new Error("Sleeper returned no data");
  return json.data;
}

/**
 * One document asking several independent questions.
 *
 * Returns whatever came back plus the aliases that did not. A refused alias
 * arrives as a null field and an entry in `errors` whose `path` names it, so
 * the failures can be attributed rather than sinking the whole batch.
 */
export async function sleeperGraphqlPartial({ op, query, token, signal }) {
  const json = await post({ op, query, token, signal });
  const failed = new Set();
  for (const error of json.errors || []) {
    const alias = error?.path?.[0];
    if (typeof alias === "string") failed.add(alias);
  }
  // An error with no path is about the document rather than one field, so
  // nothing can be salvaged from it.
  if ((json.errors?.length || 0) > 0 && failed.size === 0 && !json.data) {
    throw new Error(json.errors[0]?.message || "Sleeper rejected the query");
  }
  return { data: json.data || {}, failed: [...failed] };
}

/**
 * A value written as a GraphQL argument literal.
 *
 * The queries here interpolate their arguments rather than using variables,
 * which is the convention every existing call site follows. JSON.stringify
 * handles the escaping for strings and produces the right shape for numbers
 * and lists.
 */
export function gqlValue(value) {
  if (Array.isArray(value)) return `[${value.map(gqlValue).join(", ")}]`;
  return JSON.stringify(value);
}

/** `name: "x", list: [1, 2]` from an object. */
export function gqlArgs(args = {}) {
  return Object.entries(args)
    .map(([key, value]) => `${key}: ${gqlValue(value)}`)
    .join(", ");
}

/** Several aliased root fields folded into one document. */
export function aliasedDocument(op, entries = []) {
  const fields = entries
    .map(({ alias, field, args, selection }) =>
      `  ${alias}: ${field}(${gqlArgs(args)}) { ${selection} }`
    )
    .join("\n");
  return `query ${op} {\n${fields}\n}`;
}

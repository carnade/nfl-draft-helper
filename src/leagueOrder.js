// What order the league table shows its rows in.
//
// Kept out of the component so the cycle and the comparator can be checked
// directly — they are pure, and ordering bugs are the kind that look fine until
// the one case you did not try.

// Sleeper encodes format on the league: type 2 is dynasty, 0 is redraft.
export const isDynastyLeague = (league) => league?.settings?.type === 2;

export const NO_LEAGUE_SORT = { key: null, direction: null };

/**
 * Next state for a header click: ascending → descending → back to Sleeper's
 * own order. Clicking a different header starts that one at ascending.
 */
export function nextLeagueSort(previous, key) {
  if (!previous || previous.key !== key) return { key, direction: "ascending" };
  if (previous.direction === "ascending") return { key, direction: "descending" };
  return NO_LEAGUE_SORT;
}

/**
 * The leagues to render, in order.
 *
 * Unsorted, that is Sleeper's own order. Sorted, rows stay within their format
 * group, so the Dynasty/Redraft headings keep meaning what they say instead of
 * having both formats interleaved under one of them.
 *
 * Never mutates the array it is given.
 */
export function orderLeagues(leagues, { dynastyOnly = false, sort = NO_LEAGUE_SORT } = {}) {
  const visible = dynastyOnly
    ? (leagues || []).filter(isDynastyLeague)
    : [...(leagues || [])];

  const byFormat = (a, b) => Number(isDynastyLeague(b)) - Number(isDynastyLeague(a));

  if (!sort?.key) {
    return dynastyOnly ? visible : visible.sort(byFormat);
  }

  const direction = sort.direction === "ascending" ? 1 : -1;
  return visible.sort((a, b) => {
    if (!dynastyOnly) {
      const group = byFormat(a, b);
      if (group !== 0) return group;
    }
    const left = a?.[sort.key];
    const right = b?.[sort.key];
    // A league we could not rank sits at the end, whichever way round it is.
    if (left == null && right == null) return 0;
    if (left == null) return 1;
    if (right == null) return -1;
    return (left - right) * direction;
  });
}

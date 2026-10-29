// "1st", "22nd", "33rd".
//
// Lifted out of LeagueList, which had it inline, once a second and third
// caller wanted it. The teens are the whole reason this is not just a lookup
// on the last digit: 11th, 12th and 13th do not follow 1st, 2nd and 3rd.

/** The suffix alone, or "" for anything that is not a countable place. */
export function ordinalSuffix(n) {
  const number = Number(n);
  if (!Number.isFinite(number) || number <= 0) return "";

  const last = number % 10;
  const lastTwo = number % 100;
  if (last === 1 && lastTwo !== 11) return "st";
  if (last === 2 && lastTwo !== 12) return "nd";
  if (last === 3 && lastTwo !== 13) return "rd";
  return "th";
}

/** The whole thing: `ordinal(22)` is "22nd". Empty for a missing rank. */
export function ordinal(n) {
  const suffix = ordinalSuffix(n);
  return suffix ? `${n}${suffix}` : "";
}

#!/usr/bin/env python3
import csv
import re

ALLOWED_POSITIONS = {"QB", "RB", "WR", "TE"}

def parse_position(pos_str):
    """
    Parse something like 'RB1' into ('RB', 1).
    If there's no trailing digit, treat rank as 1, or customize if needed.
    """
    match = re.match(r"^([A-Za-z]+)(\d+)$", pos_str)
    if match:
        position = match.group(1).upper()
        pos_rank = int(match.group(2))
    else:
        # fallback if it's just "RB" or something
        position = pos_str.upper()
        pos_rank = 1
    return position, pos_rank

def compute_position_tier(pos_index):
    """
    For the first 8 tiers, group them in tiers of 5 players each.
    After that, each tier has 8 players.

    Example:
      pos_index = 1..5   => tier 1
      pos_index = 6..10  => tier 2
      ...
      pos_index = 36..40 => tier 8
      then 41..48 => tier 9, etc.
    """
    if pos_index <= 40:
        # Up to the 8th tier in groups of 5
        return (pos_index - 1)//5 + 1
    else:
        # beyond 40 => groups of 8
        offset = pos_index - 40
        tier_offset = (offset - 1)//8 + 1
        return 8 + tier_offset

def compute_overall_tier(overall_rank):
    """
    Group each 12 players into one overall tier:
      1..12 -> 1
      13..24 -> 2
      ...
    """
    return (overall_rank - 1)//12 + 1

def convert_csv(input_csv, output_csv):
    """
    Read from input_csv, filter out non-QB/RB/WR/TE rows,
    recalc overall rank among the accepted players,
    compute position-based tier, overall tier, etc.
    Write output_csv with columns:
       Overall Rank,Name,Position,Team,Bye,Position Rank,Tier,OverallTier
    """
    # We'll first store rows that pass the filter, ignoring K, DST, etc.
    accepted_rows = []

    with open(input_csv, "r", newline="", encoding="utf-8") as fin:
        reader = csv.DictReader(fin)

        for row in reader:
            # e.g. row["RK"], row["PLAYER NAME"], row["POS"] = "RB1"
            original_rank = int(row["RK"])
            name = row["PLAYER NAME"]
            team = row["TEAM"]
            pos_str = row["POS"]  # e.g. "RB1"

            position, _ = parse_position(pos_str)

            # Only accept QB, RB, WR, TE
            if position not in ALLOWED_POSITIONS:
                # skip e.g. K, DST
                continue

            # We'll keep the row. We'll store all the info we might need
            # We'll reassign overall rank later after we read them all
            accepted_rows.append({
                "original_rank": original_rank,  # might or might not use
                "pos_str": pos_str,
                "position": position,
                "name": name,
                "team": team,
            })

    # Now we have only QB, RB, WR, TE players in accepted_rows
    # Sort them by original_rank if needed (assuming input sorted by 'RK' anyway)
    accepted_rows.sort(key=lambda r: r["original_rank"])

    # Re-assign "overall rank" among these accepted rows
    # e.g. the first in accepted_rows => overall rank = 1, next => 2, ...
    for i, row in enumerate(accepted_rows, start=1):
        row["overall_rank"] = i

    # We'll also track how many players per position we've assigned so far
    position_counts = {}

    # Prepare to write the final CSV
    with open(output_csv, "w", newline="", encoding="utf-8") as fout:
        fieldnames = [
            "Overall Rank","Name","Position","Team","Bye",
            "Position Rank","Tier","OverallTier"
        ]
        writer = csv.DictWriter(fout, fieldnames=fieldnames)
        writer.writeheader()

        for row in accepted_rows:
            position, pos_rank = parse_position(row["pos_str"])
            # increment the position count
            position_counts.setdefault(position, 0)
            position_counts[position] += 1

            pos_index = position_counts[position]  # e.g. the Nth RB we've accepted

            # compute position-based tier
            tier = compute_position_tier(pos_index)

            # compute overall tier
            overall_tier = compute_overall_tier(row["overall_rank"])

            # set Bye = ""
            out = {
                "Overall Rank": row["overall_rank"],
                "Name": row["name"],
                "Position": position,
                "Team": row["team"],
                "Bye": "",
                "Position Rank": pos_rank,
                "Tier": tier,
                "OverallTier": overall_tier
            }
            writer.writerow(out)

def main():
    import sys
    if len(sys.argv) < 3:
        print("Usage: python convert.py input.csv output.csv")
        sys.exit(1)

    input_csv = sys.argv[1]
    output_csv = sys.argv[2]

    convert_csv(input_csv, output_csv)
    print(f"Done. Wrote transformed CSV to {output_csv}.")

if __name__ == "__main__":
    main()

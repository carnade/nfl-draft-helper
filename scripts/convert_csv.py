#!/usr/bin/env python3
import csv
import re

ALLOWED_POSITIONS = {"QB", "RB", "WR", "TE"}

def parse_position(pos_str):
    """
    Extract only the letters from something like 'RB19' => 'RB'.
    We ignore any trailing digits because we want to assign our own
    position-based rank (pos_index).
    """
    # Match one or more letters at the start
    match = re.match(r"^([A-Za-z]+)", pos_str)
    if match:
        return match.group(1).upper()
    else:
        return pos_str.upper()  # fallback if it doesn't match

def compute_position_tier(pos_index):
    """
    For the first 8 tiers, group them in tiers of 5 each (1..5 => tier1, 6..10 => tier2, etc.).
    After that, each tier has 8 players.
    """
    if pos_index <= 40:
        # up to the 8th tier in groups of 5
        return (pos_index - 1)//5 + 1
    else:
        # groups of 8 for pos_index > 40
        offset = pos_index - 40
        tier_offset = (offset - 1)//8 + 1
        return 8 + tier_offset

def compute_overall_tier(overall_rank):
    """
    Group each 12 players into 1 overall tier:
      overall 1..12 => tier 1, 13..24 => tier 2, etc.
    """
    return (overall_rank - 1)//12 + 1

def convert_csv(input_csv, output_csv):
    """
    Reads a (semicolon or comma) CSV with columns including 'RK','PLAYER NAME','TEAM','POS'.
    Filters out non-QB/RB/WR/TE rows, reassigns overall rank among the accepted players,
    then computes position-based rank + tier, overall tier, and writes output:

      Overall Rank,Name,Position,Team,Bye,Position Rank,Tier,OverallTier
    """
    accepted_rows = []

    # Open in read mode. If your file uses semicolons, set delimiter=';' below:
    with open(input_csv, "r", newline="", encoding="utf-8") as fin:
        # Decide if your CSV is semicolon-delimited:
        # reader = csv.DictReader(fin, delimiter=';')
        # OR if it's comma-delimited:
        reader = csv.DictReader(fin, delimiter=';')

        for row in reader:
            # row["RK"], row["PLAYER NAME"], row["TEAM"], row["POS"]
            original_rank = int(row["RK"])
            name = row["PLAYER NAME"]
            team = row["TEAM"]
            pos_str = row["POS"]  # e.g. "RB19" or "QB3"

            # parse out just the letters from POS
            position = parse_position(pos_str)

            if position not in ALLOWED_POSITIONS:
                # skip e.g. K, DST, etc.
                continue

            accepted_rows.append({
                "original_rank": original_rank,
                "name": name,
                "team": team,
                "position": position
                # ignoring any numeric part from the CSV
            })

    # Sort by the input "RK", so the first accepted row => new overall rank = 1, etc.
    accepted_rows.sort(key=lambda r: r["original_rank"])

    # Reassign overall ranks among these accepted players
    for i, row in enumerate(accepted_rows, start=1):
        row["overall_rank"] = i

    # Prepare to write final CSV
    with open(output_csv, "w", newline="", encoding="utf-8") as fout:
        fieldnames = [
            "Overall Rank","Name","Position","Team","Bye",
            "Position Rank","Tier","OverallTier"
        ]
        writer = csv.DictWriter(fout, fieldnames=fieldnames)
        writer.writeheader()

        # We track how many players per position we've handled
        position_counts = {}

        for row in accepted_rows:
            position = row["position"]
            position_counts.setdefault(position, 0)
            position_counts[position] += 1
            pos_index = position_counts[position]  # e.g. 1st RB, 2nd RB, etc.

            # compute position-based tier
            tier = compute_position_tier(pos_index)
            # compute overall tier
            overall_tier = compute_overall_tier(row["overall_rank"])

            out = {
                "Overall Rank": row["overall_rank"],
                "Name": row["name"],
                "Position": position,
                "Team": row["team"],
                "Bye": "",  # always empty
                "Position Rank": pos_index,      # ignoring the numeric from input
                "Tier": tier,
                "OverallTier": overall_tier
            }
            writer.writerow(out)

def main():
    import sys
    if len(sys.argv) < 3:
        print("Usage: python convert2.py input.csv output.csv")
        sys.exit(1)

    input_csv = sys.argv[1]
    output_csv = sys.argv[2]

    convert_csv(input_csv, output_csv)
    print(f"Done. Wrote transformed CSV to {output_csv}.")

if __name__ == "__main__":
    main()

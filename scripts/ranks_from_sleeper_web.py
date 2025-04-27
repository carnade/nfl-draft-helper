#!/usr/bin/env python3
import json
import csv
import argparse
import os

FIELDS_OF_INTEREST = {
    "adp_2qb": "adp_2qb.csv",
    "adp_dynasty_2qb": "adp_dynasty_2qb.csv",
    "adp_dynasty_half_ppr": "adp_dynasty_half_ppr.csv",
    "adp_dynasty_ppr": "adp_dynasty_ppr.csv",
    "adp_half_ppr": "adp_half_ppr.csv",
    "adp_ppr": "adp_ppr.csv",
    "rookies": "adp_rookies.csv",  # Add rookies as a new field of interest
}

def main():
    parser = argparse.ArgumentParser(description="Process NFL players from JSON and write 7 CSV files.")
    parser.add_argument("json_file", help="Path to input JSON file with players.")
    parser.add_argument("--max-players", type=int, default=400,
                        help="How many players to include in each file (default=300).")
    args = parser.parse_args()

    # 1. Read the JSON
    with open(args.json_file, "r") as f:
        data = json.load(f)

    # 2. Extract relevant info into a normalized list
    players = []
    for entry in data:
        player_obj = entry.get("player", {})
        stats = entry.get("stats", {})
        first_name = player_obj.get("first_name", "")
        last_name = player_obj.get("last_name", "")
        team = entry.get("team", "") or player_obj.get("team", "")
        position = player_obj.get("position", "")
        rookie_year = player_obj.get("metadata", {}).get("rookie_year", "")

        # Build a dictionary that has all ADP fields plus what we need for output
        p = {
            "sleeper_id": entry.get("player_id", ""),
            "name": f"{first_name} {last_name}".strip(),
            "position": position,
            "team": team,
            "rookie_year": rookie_year,  # Include rookie year for filtering
        }
        # Fill in the six ADP fields (default to float('inf') if missing or None)
        for field in FIELDS_OF_INTEREST.keys():
            adp_value = stats.get(field, float('inf'))
            p[field] = adp_value if adp_value is not None else float('inf')
        players.append(p)

    # 3. For each ADP field, sort the players, do tiering, and write CSV
    for adp_field, filename in FIELDS_OF_INTEREST.items():
        if adp_field == "rookies":
            # Filter rookies
            filtered_players = [p for p in players if p["rookie_year"] == "0"]
        else:
            # Sort ascending by that ADP field
            filtered_players = sorted(players, key=lambda x: x[adp_field])

        # Slice the top N if needed
        filtered_players = filtered_players[:args.max_players]

        # Tiering:
        #  - overallTier increments every 12 players
        #  - positionTier increments every 5 players *within that position*
        position_counts = {}  # e.g. {"QB": number_of_QBs_processed, ...}
        rows = []
        overall_rank = 0

        for i, pl in enumerate(filtered_players):
            overall_rank = i + 1
            name = pl["name"]
            pos = pl["position"]
            tm = pl["team"]

            # Increase the count for that position
            position_counts[pos] = position_counts.get(pos, 0) + 1
            position_rank = position_counts[pos]

            # Tier logic
            overall_tier = (overall_rank - 1) // 12 + 1
            position_tier = (position_rank - 1) // 5 + 1

            rows.append([
                pl["sleeper_id"],
                overall_rank,
                name,
                pos,
                tm,
                "",  # Bye (left blank as per your example)
                position_rank,
                position_tier,
                overall_tier
            ])

        # Write CSV
        headers = ["SleeperId", "Overall Rank", "Name", "Position", "Team", "Bye",
                   "Position Rank", "Tier", "OverallTier"]

        with open(filename, "w", newline="", encoding="utf-8") as outfile:
            writer = csv.writer(outfile)
            writer.writerow(headers)
            writer.writerows(rows)

        print(f"Wrote {len(rows)} rows to {filename} sorted by {adp_field}.")

if __name__ == "__main__":
    main()

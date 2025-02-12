import pandas as pd
import csv

# Function to create rankings from input data
def create_rankings_from_file(input_file, ranks_file):
    # Read the data from input.csv
    with open(input_file, 'r', encoding='utf-8-sig') as file:
        data = file.read()

    # Split the data into rows
    rows = [row.split(';') for row in data.split('\n') if row.strip()]

    # Extract the headers
    headers = rows[0]

    # Extract the column names for files
    file_columns = headers[:6]

    # Extract player data
    player_data = rows[1:]

    # Mapping the column names to file names
    file_names = {
        'Redraft PPR ADP': 'redraft_ppr_adp.csv',
        'Redraft SF ADP': 'redraft_sf_adp.csv',
        'Redraft Half PPR ADP': 'redraft_half_ppr_adp.csv',
        'Dynasty PPR ADP': 'dynasty_ppr_adp.csv',
        'Dynasty SF ADP': 'dynasty_sf_adp.csv',
        'Dynasty Half PPR ADP': 'dynasty_half_ppr_adp.csv',
    }

    # Load the myranks.csv file to get the bye week data
    bye_data = pd.read_csv(ranks_file)

    # Create a dictionary for quick lookup of bye week by player name
    bye_dict = dict(zip(bye_data['Name'], bye_data['Bye']))

    # Function to calculate position tiers
    def calculate_position_tier(position_data):
        tiers = []
        tier = 1
        for index, (rank, row) in enumerate(position_data):
            if index % 10 == 0 and index != 0:
                tier += 1
            tiers.append((rank, row, tier))
        return tiers

    # Function to calculate overall tiers
    def calculate_overall_tier(sorted_data):
        overall_tiers = []
        tier = 1
        for index, (rank, row) in enumerate(sorted_data):
            if index % 10 == 0 and index != 0:
                tier += 1
            overall_tiers.append((rank, row, tier))
        return overall_tiers

    # Create the CSV files
    for col_index, col_name in enumerate(file_columns):
        file_name = file_names[col_name]
        
        # Sort the player data based on the ADP values in the current column
        sorted_data = sorted(
            enumerate(player_data, start=1),
            key=lambda x: float(x[1][col_index]) if x[1][col_index].strip() else float('inf')
        )
        
        # Filter out players who are not WR, RB, QB, TE, or K
        filtered_data = [
            entry for entry in sorted_data 
            if len(entry[1]) > 9 and entry[1][9] in {'WR', 'RB', 'QB', 'TE', 'K'}
        ]
        
        # Calculate overall tiers
        overall_tier_data = calculate_overall_tier(filtered_data)
        
        # Separate players by position
        positions = {'WR': [], 'RB': [], 'QB': [], 'TE': [], 'K': []}
        
        for overall_rank, row in filtered_data:
            position = row[9]
            positions[position].append((overall_rank, row))
        
        # Calculate tiers for each position
        position_tier_data = {}
        for position, position_data in positions.items():
            position_tier_data[position] = calculate_position_tier(position_data)
        
        with open(file_name, mode='w', newline='') as file:
            writer = csv.writer(file)
            # Write headers
            writer.writerow(['Overall Rank', 'Name', 'Position', 'Team', 'Bye', 'Position Rank', 'Tier', 'OverallTier'])
            
            # Write sorted data with calculated tiers
            for overall_rank, (orig_rank, row, overall_tier) in enumerate(overall_tier_data, start=1):
                name = f"{row[7]} {row[8]}"
                position = row[9]
                team = row[6]
                position_rank = row[10]
                position_tier = next(tier for r, _, tier in position_tier_data[position] if r == orig_rank)
                
                # Retrieve the bye week from the bye_dict
                bye_week = bye_dict.get(name, '0')

                writer.writerow([
                    overall_rank, 
                    name, 
                    position, 
                    team, 
                    bye_week, 
                    position_rank[2:],  # Strip 'QB', 'WR', 'RB', 'TE', 'K' from position rank
                    position_tier, 
                    overall_tier
                ])

    print("CSV files created and sorted successfully.")

# Specify the input and ranks files
input_file = 'input.csv'
ranks_file = 'myranks.csv'

# Call the function to process the input file and ranks file
create_rankings_from_file(input_file, ranks_file)

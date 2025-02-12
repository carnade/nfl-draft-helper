import json

def filter_positions(input_file, output_file):
    # Define the positions to keep
    positions_to_keep = {"QB", "RB", "FB", "TE", "WR", "DEF", "K"}
    
    # Load the JSON data from the input file
    with open(input_file, 'r') as file:
        data = json.load(file)
    
    # Filter out objects that have a value in position that is in the set positions_to_keep
    # and ensure the status is not "Inactive"
    filtered_data = {
        key: value for key, value in data.items()
        if value.get('position') in positions_to_keep and value.get('active') == True
    }
    
    # Write the filtered data to the output file
    with open(output_file, 'w') as file:
        json.dump(filtered_data, file, indent=2)

    print(f"Filtered data has been saved to {output_file}")

# Specify the input and output file names
input_file = 'sleeper_data.json'
output_file = 'sleeper_data_trimmed.json'

# Call the function to filter the positions and status
filter_positions(input_file, output_file)


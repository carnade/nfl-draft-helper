# TinyURL Create API - Updated Request Structure

## Endpoint
**POST** `/tinyurl/create`

## Purpose
Create a new TinyURL entry with multiple user entries in a single request. This replaces the old single-data format and makes it compatible with the `add` endpoint structure.

## Request Body Structure

```json
{
  "name": "league_name",
  "week": 10,
  "entries": [
    {
      "name": "carnade",
      "data": "10|MYQwTgdiAmCmBcBGATAVgAwA4C0qDs66ANJogMw54bEHKLYBsZhJKDuzxiiTqjnRAJwAWTDkwMWKVIjzZhiFqkzDh2MgIDCAGQCi2ZIMIAfAM4BrcAEsI8YYJXYCUtCkbVWMjixFjsEpRV2VGEWAnt5SWIyOjUyD1JVRmQWHX1DE00QABts2ABxMABXCGgAI1gwAHMkNCxcZyEMQX8PULI1IxZSZGCBUg7cRWIe+nswwmR1RvCW4SiiAAkAeQBVdWHjWG2AMzBt2owcfAm6fm7kZGPMMJC5FR9BQTlULqIGUhamFhjEOISUGM3mkDF1jAAFWAAF0qAAcQBAoaY7CIyLgbiNyJQPLR6N8aPh6GQ3qQGHJhCliL5xAtFJhXvJQlw0L0GqkAIIAJXU1CAA"
    },
    {
      "name": "skarin",
      "data": "10|NDk4NC03MDAwLDEyNTEyLTY1MDAsODE1MS01MzAwLDk0ODgtODYwMCw1ODQ2LTU0MDAsNzA0OS00NjAwLDMyMTQtMzUwMCw4MTQ0LTYyMDAsQ0xFLTI5MDA="
    },
    {
      "name": "CalleGrundberg",
      "data": null
    },
    {
      "name": "eeefree",
      "data": null
    },
    {
      "name": "Peterpants",
      "data": null
    }
  ]
}
```

## Field Descriptions

### Top-level fields:
- **`name`** (string, required, max 20 chars): The unique name for the TinyURL entry
- **`week`** (integer, required): The NFL week number
- **`entries`** (array, required, min 1): Array of user entries

### Entry object fields:
- **`name`** (string, required): Username for this entry
- **`data`** (string | null, required): 
  - If provided: Compressed lineup data in format `{week}|{compressedData}` (same format as `add` endpoint)
  - If `null`: User has no lineup data yet (should be added to `allowed_names`)

## Behavior

1. **Create the TinyURL entry** with the given `name` and `week`
2. **For entries with `data`** (non-null):
   - Add the data immediately (same as calling `POST /tinyurl/<name>/add` for each entry)
   - Add the username to `allowed_names` if not already present
3. **For entries with `data: null`**:
   - Add the username to `allowed_names` (same as empty league creation)
   - No data is stored for these users yet

## Example Scenarios

### Scenario 1: All users have data
```json
{
  "name": "week10_league",
  "week": 10,
  "entries": [
    {"name": "user1", "data": "10|compressed1..."},
    {"name": "user2", "data": "10|compressed2..."},
    {"name": "user3", "data": "10|compressed3..."}
  ]
}
```
**Result**: Creates entry with all 3 users' data immediately available.

### Scenario 2: Mix of users with and without data
```json
{
  "name": "week10_league",
  "week": 10,
  "entries": [
    {"name": "user1", "data": "10|compressed1..."},
    {"name": "user2", "data": null},
    {"name": "user3", "data": null}
  ]
}
```
**Result**: Creates entry with user1's data, and user2/user3 in `allowed_names` (can add data later via `add` endpoint).

### Scenario 3: All users without data
```json
{
  "name": "week10_league",
  "week": 10,
  "entries": [
    {"name": "user1", "data": null},
    {"name": "user2", "data": null},
    {"name": "user3", "data": null}
  ]
}
```
**Result**: Same as `POST /tinyurl/create/empty` - creates entry with all users in `allowed_names`.

## Response (200 OK)
```json
{
  "name": "league_name",
  "week": 10,
  "created_at": "2025-11-05T10:30:00.123456",
  "total_entries": 3,
  "entries_added": 2,
  "allowed_names": ["carnade", "skarin", "CalleGrundberg", "eeefree", "Peterpants"]
}
```

## Error Responses

### 400 Bad Request
- Missing `name`, `week`, or `entries`
- `name` already exists
- `name` exceeds 20 characters
- `entries` array is empty
- Maximum of 10 entries reached
- Invalid `data` format (if not null)

### 500 Server Error
- Internal server error

## Migration Notes

**Old format** (deprecated):
```json
{
  "name": "mytest",
  "data": "10|compressed..."
}
```

**New format** (current):
```json
{
  "name": "mytest",
  "week": 10,
  "entries": [
    {"name": "user1", "data": "10|compressed..."}
  ]
}
```

The new format is equivalent to:
1. Creating an empty entry with `POST /tinyurl/create/empty`
2. Adding each entry with data via `POST /tinyurl/<name>/add`

But all in a single atomic request.


ALWAYS ask the user for confirmation before making any git commit or push. No exceptions.

When writing patch notes, always write about the functionality but never the technical.

When updating the changelog, add the new entry to `src/Changelog.js` (the entries array at the top) — this is what is displayed on the site. Also update `MANUAL_LAST_UPDATED` in `src/LeftMenu.js` to today's date (ISO format `YYYY-MM-DDT00:00:00.000Z`). This controls whether the changelog indicator shows as unread for users. README.md has a changelog section too but Changelog.js is the primary one.

ALWAYS ask the user for confirmation before making any git commit or push. No exceptions.

When writing patch notes, always write about the functionality but never the technical.

When updating the changelog, add the new entry to `src/Changelog.js` (the entries array at the top) — this is what is displayed on the site. Also update `MANUAL_LAST_UPDATED` in `src/LeftMenu.js` to today's date (ISO format `YYYY-MM-DDT00:00:00.000Z`). This controls whether the changelog indicator shows as unread for users. README.md has a changelog section too but Changelog.js is the primary one.

Before pushing follow-up commits to a branch that already has a PR, check whether that PR has been merged (`gh pr view <n> --json state`). Pushing to a merged branch strands the work silently — it lands nowhere and no open PR shows it. Branch from the updated `main` and cherry-pick instead.

PRs here are squash-merged, so a branch's commits never become ancestors of `main`. `git merge-base --is-ancestor` will report merged work as missing. Check by commit subject against `git log main` (a squash commit keeps the PR title, usually with `(#NN)` appended, so match on substring), or by whether the branch's diff against `main` is empty. A two-dot diff (`main..branch`) is not a merge test — it also counts main's newer commits as differences.

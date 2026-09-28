# The Friday Challenge

A single-file web app (`index.html`) that tracks a weekly competition between Mr. Johnson's 9th grade ELA classes. No build step, no dependencies beyond Google Fonts. Hosted on GitHub Pages from the `main` branch of `jackylegs-oss/friday-challenge`, and served to the teacher through a Google Apps Script link (see below).

## Workflow for changes

1. Edit `index.html`.
2. Test it in a browser (open the file locally or serve the folder) — check Standings, Class scores, Enter scores, Settings, and the projector view, in both light and dark mode.
3. Commit and push to `main`; GitHub Pages redeploys automatically (takes a minute or two).

**Never commit `.json` files.** Backups hold real class data and are excluded in `.gitignore`. Never add student names or real scores to `index.html` — the repo and site are public.

## Two ways the app runs

- **Google link (the real one):** `apps-script/Code.gs` is pasted into an Apps Script project attached to a Google Sheet in the teacher's school Drive and deployed as a web app (execute as me, only myself). `doGet` fetches `index.html` from GitHub Pages on every load, so pushing to `main` updates it with no re-deploy. Scores are stored in the Sheet's `Data` tab, one row per doc (`config/main`, `weeks/YYYY-MM-DD`), JSON in column B. The app detects `google.script.run`, loads everything via `loadAll()`, stays read-only until that returns, saves each change via `saveDoc(path, json)` (through the `db` adapter and `queueWrite`/`flush`), and reloads when the tab becomes visible again. Only change `Code.gs` if storage needs to change; that requires the teacher to re-paste it and redeploy.
- **Plain GitHub Pages URL:** no `google.script.run`, so it falls back to `localStorage` in that one browser. Kept working but not the one to use day to day.

Test Google mode locally by stubbing `SpreadsheetApp`/`LockService`/`google.script.run` in a scratch copy of the page and loading `Code.gs` into it.

## Data

- In the plain version, everything is saved in the browser's `localStorage` under `fc-config` (classes, weights, seasons) and `fc-weeks` (week ID `YYYY-MM-DD` of the Monday → `{entries: {classId: {...}}, quizName, hwName}`). `fc-lastBackup` stores the last backup date.
- Settings → Backup downloads `friday-challenge-backup-YYYY-MM-DD.json`. Restore/import: a file with `config` replaces settings; `weeks` are merged field by field into existing weeks.
- The standings page nudges a backup if none has been made in 7 days.
- Imports also queue a save of every imported week (and config, for full backups) when running in Google mode.

## Scoring

- Six categories (`CATS`): quiz growth (`quiz`), homework turned in (`hw`), behavior (`behavior`, M–F earned/missed taps), house points (`house`), unexcused absences (`attendance`, field `abs`), tardies (`tardy`). Absences and tardies are lower-is-better (`dir:-1`). House points, absences and tardies are divided by class size.
- Each category is ranked on **growth**: this week's value minus the class's average over its last 4 prior weeks with data. If any class lacks prior data for a category, that category falls back to raw ranking that week.
- A category counts as soon as two competing classes have a number in it; points stay on the 5..1 scale (N - average rank) and classes still missing get no points for it yet, so standings update live as numbers are entered. Weeks before the season start show a preseason notice.
- **Perfect levels tie for first** (`PERFECT`): homework ≥ 95%, every behavior day earned, 0 absences, 0 tardies. Ties share averaged rank points.
- **Missing quiz scores count as zero**: pasted scores are averaged over `max(scores pasted, class size)`. Class size can change mid-year via `sizeChanges` without affecting earlier weeks.
- **Per-class weights**: `config.weights` is the default; `config.classWeights[classId]` overrides it for one class. A class's weekly score is the weighted average of its category points; season points sum weekly scores.
- The Class scores chart shows every week with data up to the week being viewed, across all seasons, with a dashed "<season> starts" line at each season start. Weeks before the first season never earn points. "Start new season this week" asks for confirmation (it ends the current season); changing when a season starts is the date box.
- Classes flagged `iep` (shown as "personal best track") don't compete with the others; they're compared against their own last-4-week average.
- Seasons: `config.season` plus `config.pastSeasons` (with recorded champion).

## Look

Isibindi house colors: house green (`--house:#1E5B3C`, deep `#123826`) with gold accents (`--gold:#D9A23A`). Fonts: Graduate (display), Barlow (body), Barlow Condensed (numbers). Supports light/dark via `prefers-color-scheme` and `data-theme`. The projector view (`#show`) is a full-screen dark-green scoreboard with three views: Standings, Compare classes (`compareBoard`: each class's average quiz % and homework-turned-in % over every week so far, plus "goal this week" = its last-4-week average, the number growth scoring compares against), and Class scores (the chart).

## Updating from the Google Sheet (preferred)

In Google mode, Settings has "Update scores from Sheet", which calls `updateFromGradebooks()` in `Code.gs`. It reads, inside Google:
- **Gradebook tabs**, one per class, named like the class ("Period 2"; "Period 2 gradebook" also matches, "Period 20" doesn't), holding the Student Task Scores CSV. Quiz = Assessments columns, % of max, blank and "Missing" = 0 over the whole roster. Homework = % of students with any Homework item due that week scored above 0 (blank cells ignored). Columns more than half blank are treated as not graded yet and skipped. The Skip tab (Class | Assignment) skips columns by name. Weeks are Mon–Sun by due date.
- **Attendance tab**: row 1 needs a date/week column and a class/period column, plus count columns ("Unexcused absences", "Tardies") or a Status column (one row per incident: Unexcused / Tardy). Every class gets a number (0 if no rows) for each week in the tab.
It merges quiz/hw/abs/tardy into the Data tab week docs (removing `quizN`/`quizSum` when it sets `quiz`), keeps everything else, only fills quiz/hw names if empty, and returns report lines the app shows. Only class-level numbers leave the Sheet. Changing `Code.gs` means the teacher re-pastes it and deploys a new version (Deploy → Manage deployments → Edit → New version).

## Entering scores from reports

When Mr. Johnson shares a gradebook export, PDF, or other report that may contain student information:

- Extract only class-level numbers the app uses. Homework `hw` = % of students who turned in any homework that week with a score above 0. Quiz `quiz` = class average percent over every student, with "Missing" and blank both counted as 0.
- Write them to an import file named like `friday-challenge-update-YYYY-MM-DD.json` in the format `{"app":"friday-challenge","version":1,"weeks":{"<Monday YYYY-MM-DD>":{"entries":{"c1":{...}}}}}` using the class IDs from his config (defaults `c1`–`c5`; ask if he's renamed or added classes). Omit `config` so his settings aren't replaced. He imports it via Settings → Restore or import a file.
- Never put student names, IDs, individual scores, or any class data into `index.html` or any committed file. The repo and site are public. `.gitignore` blocks JSON and common report file types; don't override it.

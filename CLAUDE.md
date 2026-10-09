# The Friday Challenge

A single-file web app (`index.html`) that tracks a weekly competition between Mr. Johnson's 9th grade ELA classes. No build step, no dependencies beyond Google Fonts. Hosted on GitHub Pages from the `main` branch of `jackylegs-oss/friday-challenge`, and served to the teacher through a Google Apps Script link (see below).

## Workflow for changes

1. Edit `index.html`.
2. Test it in a browser (open the file locally or serve the folder) — check Standings, Class scores, Enter scores, Settings, and the projector view, in both light and dark mode.
3. Commit and push to `main`; GitHub Pages redeploys automatically (takes a minute or two).

**Never commit `.json` files.** Backups hold real class data and are excluded in `.gitignore`. Never add student names or real scores to `index.html` — the repo and site are public.

## Weeks

Competition weeks run **Friday through Thursday** (results final Thursday, awards Friday) and are keyed by the **Thursday they end on** (`weekEndOf`, `thisWeek()`; Code.gs `weekOf_`). Behavior days are stored in the order F, M, T, W, Th. A quiz or assignment due on a Friday counts in the week that starts that Friday. The first Season 1 week ended Thu 2026-10-01. Data saved before the switch was keyed by Monday; `upgradeWeeks`/`migrateWeeks` convert it once (Mon–Thu and all week fields → that week's Thursday; a Friday tap → day 0 of the next week) and set `config.weekMode = "fri-thu"`. After that, non-Thursday keys (old Monday rows still in the Sheet) are ignored. Old backups are converted on import.

## Two ways the app runs

- **Google link (the real one):** `apps-script/Code.gs` is pasted into an Apps Script project attached to a Google Sheet in the teacher's school Drive and deployed as a web app (execute as me, only myself). `doGet` fetches `index.html` from GitHub Pages on every load, so pushing to `main` updates it with no re-deploy. Scores are stored in the Sheet's `Data` tab, one row per doc (`config/main`, `weeks/YYYY-MM-DD`), JSON in column B. The app detects `google.script.run`, loads everything via `loadAll()`, stays read-only until that returns, saves each change via `saveDoc(path, json)` (through the `db` adapter and `queueWrite`/`flush`), and reloads when the tab becomes visible again. Only change `Code.gs` if storage needs to change; that requires the teacher to re-paste it and redeploy.
- **Plain GitHub Pages URL:** no `google.script.run`, so it falls back to `localStorage` in that one browser. Kept working but not the one to use day to day.

Test Google mode locally by stubbing `SpreadsheetApp`/`LockService`/`google.script.run` in a scratch copy of the page and loading `Code.gs` into it.

## Data

- In the plain version, everything is saved in the browser's `localStorage` under `fc-config` (classes, weights, seasons) and `fc-weeks` (week ID `YYYY-MM-DD` of the Monday → `{entries: {classId: {...}}, quizName, hwName}`). `fc-lastBackup` stores the last backup date.
- A file with `"replace": true` replaces each listed week wholesale instead of merging (used for repair files).
- Settings → Backup downloads `friday-challenge-backup-YYYY-MM-DD.json`. Restore/import: a file with `config` replaces settings; `weeks` are merged field by field into existing weeks.
- The standings page nudges a backup if none has been made in 7 days.
- Imports also queue a save of every imported week (and config, for full backups) when running in Google mode.

## Scoring

- Six categories (`CATS`): quiz growth (`quiz`), homework turned in (`hw`), behavior (`behavior`, F–Th earned/missed taps), house points (`house`), unexcused absences (`attendance`, field `abs`), tardies (`tardy`). Absences and tardies are lower-is-better (`dir:-1`). House points, absences and tardies are divided by class size.
- **Classes are scored independently, never ranked against each other** (teacher's rule: one class's numbers must never change another class's score). `catGrowth`: growth points = (this week − the class's own most recent earlier week with a number, `GROWTH_WEEKS = 1`; for quizzes, its last quiz) × `GROWTH.scale` × direction. Scales (set 2026-10-08 to shrink weekly spreads): quiz/homework 1 per percentage point, behavior 25 (one earned day out of five = +5), absences/tardies 50 (one fewer in a class of 25 = +2), house points 10 per house point per student. A category with no earlier week counts only if the class is at a perfect level.
- **Cap**: each category's growth is clamped to ±`GROWTH.cap` (15) per week, so one odd week can't swing a class far ahead.
- **Format restarts** (`restartFor`, `cls.restarts = [{key:"quiz", from:"YYYY-MM-DD"}]`): set from Settings → Classes → "Quiz format changed the week of …" (used for Period 4's half-length quizzes, the teacher's IEP class). From that week on, earlier weeks never count as that class's previous week for that category; the restart week itself is a "new format, first week" with no growth.
- **Perfect levels** (`PERFECT`: homework ≥ 95%, every behavior day earned, 0 absences, 0 tardies) earn `GROWTH.perfect` = +5 (lowered from +15 on 2026-10-08 to shrink spreads; a big improver can now out-earn a class holding perfect in that category).
- `weekResult`: weekly score = weighted average of the categories that count; a positive score is multiplied by the behavior streak multiplier. Places this week are just the order of those scores (most improved wins the week). Standings chips show each category's signed growth; hovering shows this week vs previous.
- Weeks before the first season are a "Preseason" pseudo-season (`seasonFor` returns `pre:true`): they show their own preseason points and a notice, and never add to a real season.
- **Missing quiz scores count as zero**: pasted scores are averaged over `max(scores pasted, class size)`. Class size can change mid-year via `sizeChanges` without affecting earlier weeks.
- **Per-class weights**: `config.weights` is the default; `config.classWeights[classId]` overrides it for one class. A class's weekly score is the weighted average of its category points; season points sum weekly scores.
- The Class scores chart shows every week with data up to the week being viewed, across all seasons, with a dashed "<season> starts" line at each season start. Weeks before the first season never earn points. "Start new season this week" asks for confirmation (it ends the current season); changing when a season starts is the date box.
- Classes flagged `iep` (shown as "personal best track") don't compete with the others; they're compared against their own previous week.
- **Behavior streak multiplier** (`STREAK`, `streakInfo`): a perfect behavior week (every school day earned; days marked "x" = no school are skipped) raises the class's streak level by 1 (cap 5); a week with a missed day, or a past week left incomplete, drops it by 1 (soft reset). A perfect week's whole weekly score is multiplied by 1.10^level (x1.10 … x1.61). Levels restart each season. `dayStreak` counts earned days in a row for display; `dayDots` draws the last two weeks as squares on Standings and the projector, and Class scores has a "Behavior by day" view (`behaviorBoard`, last four weeks). Behavior day buttons cycle blank → earned → missed → no school.
- Seasons: `config.season` plus `config.pastSeasons` (with recorded champion).

## Look

Isibindi house colors: house green (`--house:#1E5B3C`, deep `#123826`) with gold accents (`--gold:#D9A23A`). Fonts: Graduate (display), Barlow (body), Barlow Condensed (numbers). Supports light/dark via `prefers-color-scheme` and `data-theme`. The projector view (`#show`) is a full-screen dark-green scoreboard with three views: Standings, Compare classes (`compareBoard`: each class's average quiz % and homework-turned-in % over every week so far, plus "goal this week" = its previous week's number, the one growth scoring compares against), and Class scores (the chart).

## Updating from the Google Sheet (preferred)

In Google mode, Settings has "Update scores from Sheet", which calls `updateFromGradebooks()` in `Code.gs`. It reads, inside Google:
- **Gradebook tabs**, one per class, named like the class ("Period 2"; "Period 2 gradebook" also matches, "Period 20" doesn't), holding the Student Task Scores CSV. Quiz = Assessments columns, % of max, blank and "Missing" = 0 over the whole roster. Homework = % of students with any Homework item due that week scored above 0 (blank cells ignored). A column is skipped only when every student is blank (not graded at all); partly graded columns count. The Skip tab (Class | Assignment) skips columns by name. Weeks are Friday–Thursday by due date.
- **Attendance tab**: row 1 needs a date/week column and a class/period column, plus count columns ("Unexcused absences", "Tardies") or a Status column (one row per incident: Unexcused / Tardy). Every class gets a number (0 if no rows) for each week in the tab.
**Week lock** (`LOCK_FROM = '2026-10-08'` in Code.gs, a week-ending Thursday): from that week on, the update only writes quiz/hw for the current Friday–Thursday week (script time zone) and later; earlier weeks are never changed by an update. Attendance is not locked, and manual edits in Enter scores are always allowed. It merges quiz/hw/abs/tardy into the Data tab week docs (removing `quizN`/`quizSum` when it sets `quiz`), keeps everything else, only fills quiz/hw names if empty, and returns report lines the app shows. Only class-level numbers leave the Sheet. `apiVersion()` returns 2 for the Friday–Thursday script; the app disables Update and shows a warning until it sees 2. Changing `Code.gs` means the teacher re-pastes it and deploys a new version (Deploy → Manage deployments → Edit → New version).

## Entering scores from reports

When Mr. Johnson shares a gradebook export, PDF, or other report that may contain student information:

- Extract only class-level numbers the app uses. Homework `hw` = % of students who turned in any homework that week with a score above 0. Quiz `quiz` = class average percent over every student, with "Missing" and blank both counted as 0.
- Write them to an import file named like `friday-challenge-update-YYYY-MM-DD.json` in the format `{"app":"friday-challenge","version":1,"weeks":{"<Monday YYYY-MM-DD>":{"entries":{"c1":{...}}}}}` using the class IDs from his config (defaults `c1`–`c5`; ask if he's renamed or added classes). Omit `config` so his settings aren't replaced. He imports it via Settings → Restore or import a file.
- Never put student names, IDs, individual scores, or any class data into `index.html` or any committed file. The repo and site are public. `.gitignore` blocks JSON and common report file types; don't override it.

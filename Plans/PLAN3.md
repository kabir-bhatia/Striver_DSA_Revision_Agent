# Add UTC-Based Revision Scheduling, Notes, Checkmarks, and Tier Filters

## Summary
Revise the previous scheduling plan to use UTC/GMT dates only, simplify progress to a single done checkmark, add optional per-question mistake notes, remove the `very_easy` tier, and add tier-based filtering in the topic browser.

## Key Changes
- Replace `todo/learning/revised` progress with a boolean `done` state:
  - Topic rows show a checkmark control instead of colored status dots.
  - Progress bar counts only `done = true`.
  - Existing local data migrates automatically: old `progress = 'revised'` becomes `done = true`; all other states become `done = false`.
- Add four tiers only:
  - `easy`: revision offsets `+10`, `+30` UTC days.
  - `medium`: revision offsets `+7`, `+20` UTC days.
  - `hard`: revision offsets `+2`, `+10`, `+30` UTC days.
  - `tricky`: revision offsets `+2`, `+10`, `+30` UTC days.
- Use UTC/GMT `+00:00` for all scheduling:
  - Store dates as UTC `YYYY-MM-DD`.
  - Compute “today” using UTC date, not local/India timezone.
  - Store event timestamps as ISO UTC strings.
- Add optional per-question mistake note:
  - Each topic can have a small editable note like “I forgot the two-pointer invariant”.
  - Empty note is allowed.
  - Note is shown in topic detail and optionally in Today’s due revision rows.

## Data/API Changes
- Extend `topics` with:
  - `done INTEGER NOT NULL DEFAULT 0`
  - `tier TEXT NULL CHECK tier IN ('easy', 'medium', 'hard', 'tricky')`
  - `mistake_note TEXT NOT NULL DEFAULT ''`
  - Keep old `progress` column only as migration/source compatibility if needed; new APIs use `done`.
- Add `revision_items`:
  - `id`, `topic_id`, `tier`, `stage`, `due_date_utc`, `completed_at_utc`, `created_at_utc`.
- Add `daily_goals`:
  - `id`, `date_utc`, `topic_id` nullable, `title`, `completed_at_utc`, `position`, `created_at_utc`.
- Add/adjust APIs:
  - `GET /api/progress` returns `total`, `done`, `remaining`, `percentage`.
  - `GET /api/topics` accepts optional `tier=easy|medium|hard|tricky|unassigned`.
  - `PATCH /api/topics/:id/done` toggles checkmark and creates revision schedule when changing to `true`.
  - `PATCH /api/topics/:id/tier` updates tier and regenerates open future revision schedule if the topic is already done.
  - `PATCH /api/topics/:id/note` saves optional mistake note.
  - `GET /api/topics/:id/revisions` returns scheduled revision items.
  - `GET /api/schedule/today` uses UTC today and returns due/overdue revisions plus UTC-date goals.
  - `POST /api/revisions/:id/complete` marks one due revision complete.
  - `GET/POST/PATCH/DELETE /api/goals` manages UTC-date Today goals.

## UI Changes
- Add a top-level view switch: `Browse` and `Today`.
- In Browse:
  - Replace progress dropdown with a checkmark button.
  - Add tier selector: Easy, Medium, Hard, Tricky, Unassigned.
  - Add optional mistake-note textarea in topic detail.
  - Add tier filter controls above the topic list so choosing Hard/Medium/etc shows only that tier.
  - If a user checks Done without a tier, prompt/block with “Choose a tier first so revisions can be scheduled.”
- In Today:
  - Show UTC date clearly, e.g. `Today, 2026-05-31 UTC`.
  - Show `Today’s Revisions`, including overdue items where `due_date_utc <= utcToday`.
  - Show tier, revision stage, due date, topic name, and mistake note if present.
  - Show `Today’s Goal`, date-specific to the UTC date.
  - Allow adding either a linked topic goal or a custom text goal, marking goals done, editing, and deleting.

## Test Plan
- Verify UTC helper returns dates from `new Date().toISOString().slice(0, 10)` and never uses local timezone date formatting for schedules.
- Mark an `easy` topic done and confirm revision due dates are UTC today +10 and +30.
- Mark `hard` and `tricky` topics done and confirm due dates are UTC today +2, +10, +30.
- Confirm overdue revision items appear in Today’s Schedule until completed.
- Confirm completing one revision hides only that revision item and leaves future stages scheduled.
- Confirm progress bar increments only when the checkmark is checked.
- Confirm tier filters show only matching marked topics and `unassigned` shows topics with no tier.
- Save a mistake note, restart the server, and confirm it persists.
- Add custom and topic-linked UTC Today goals, restart, and confirm they persist.
- Run `npm run typecheck` and `npm run build`.

## Assumptions
- “Done” means the checkbox/checkmark is ticked.
- A revision schedule starts only when a topic is first checked as done.
- If the topic is unchecked later, its incomplete future revision items should be removed.
- If a done topic’s tier changes, incomplete future revision items are regenerated from the original done date if available; otherwise from current UTC today.
- All Today and revision scheduling behavior is based on GMT/UTC, not India/local time.

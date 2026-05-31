# Add Progress Bar, Persistent Chat, and GitHub Sharing Setup

## Summary
Update the Striver DSA Revision Agent so it shows overall completion progress, persists topic chat across restarts, and is safe to share as a GitHub repo where your friend uses their own `GEMINI_API_KEY`.

## Key Changes
- Add an overall progress bar:
  - Denominator uses the synced SQLite topic count, currently `474`, and updates if the sheet changes.
  - Completed count = topics where `progress = 'revised'`.
  - Display `2 / 474 completed` plus percentage with a green progress fill.
- Persist chat memory:
  - Add a SQLite `chat_messages` table with `topic_id`, `role`, `content`, and `created_at`.
  - Save both user and assistant messages from `/api/chat`.
  - Add `GET /api/topics/:id/chat` to restore chat when a topic is selected.
  - Add `DELETE /api/topics/:id/chat` for clearing a topic’s saved chat.
- Make GitHub sharing safe:
  - Keep `.env`, `node_modules`, `dist`, and `data/*.sqlite` ignored.
  - Add a `README.md` with setup/run instructions.
  - Add a note that each user must create their own `.env` from `.env.example`.

## API/UI Details
- Add `GET /api/progress` returning `total`, `revised`, `learning`, `todo`, and `percentage`.
- Refresh the progress bar after `PATCH /api/topics/:id/progress`.
- On topic selection, load saved chat from `GET /api/topics/:id/chat`.
- On chat submit, persist messages server-side and update the UI from the saved response.
- Keep chat scoped per topic, so each problem/topic restores its own conversation after restart.

## GitHub Instructions To Include
- One-time repo publish:
  - Create a GitHub repository.
  - Commit source files, `package-lock.json`, `.env.example`, and `README.md`.
  - Do not commit `.env`, `node_modules`, `dist`, or `data/*.sqlite`.
  - Push to GitHub.
- Friend setup:
  - Clone the repo.
  - Install Node.js `25+` or another current version with `node:sqlite`.
  - Run `npm install`.
  - Copy `.env.example` to `.env`.
  - Add their own `GEMINI_API_KEY`.
  - Keep `GEMINI_MODEL=gemini-3.5-flash`.
  - Run `npm run sync`.
  - Run `npm run build`.
  - Run `npm start`.
  - Open `http://127.0.0.1:8787`.

## Test Plan
- Verify `GET /api/progress` returns the synced total and correct revised count.
- Mark a topic as `revised` and confirm the progress bar updates immediately.
- Send a chat message, restart the server, reopen the same topic, and confirm chat history is restored.
- Confirm `npm run typecheck` and `npm run build` pass.
- Confirm `git status` does not include `.env`, SQLite data, build output, or dependencies.

## Assumptions
- “Completed” means `progress = 'revised'`.
- Progress total uses the real synced sheet count, not a fixed `455`.
- Chat history is local per user because it lives in each user’s SQLite database.
- GitHub sharing is source-only; your Gemini key and local progress/chat data are never shared.

# Striver A2Z DSA Revision Agent

A local web app that turns Striver's A2Z DSA sheet into a searchable revision tutor. It syncs the sheet, stores progress locally, caches generated study bundles, and uses Gemini to generate C++-first notes, code, complexity, and follow-up answers.

## Features

- Browse Striver A2Z sections, sub-sections, and topics.
- Generate C++-first study bundles from Take U Forward notes and available video transcripts.
- Track progress with `todo`, `learning`, and `revised`.
- See overall completion progress from the synced sheet total.
- Persist topic chat history locally across restarts.
- Store all local state in SQLite.

## Requirements

- Node.js 25 or newer, or another current Node.js version that supports `node:sqlite`.
- A Gemini API key.

## Local Setup

```bash
npm install
```

Create your local environment file:

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Edit `.env`:

```env
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-3.5-flash
PORT=8787
```

Sync the Striver sheet:

```bash
npm run sync
```

Build the app:

```bash
npm run build
```

Start the agent:

```bash
npm start
```

Open:

```text
http://127.0.0.1:8787
```

## Development

```bash
npm run dev
```

In another terminal, if you want the Vite dev server:

```bash
npx vite
```

## Stopping The Agent

If it is running in the terminal, press `Ctrl+C`.

If it was started in the background on Windows:

```powershell
Get-Process node | Stop-Process
```

## What Is Stored Locally

The app creates a SQLite database under:

```text
data/striver-agent.sqlite
```

That database stores:

- Synced sheet metadata.
- Progress states.
- Cached topic resources.
- Generated study bundles.
- Saved per-topic chat messages.

This file is intentionally ignored by Git so every user has their own progress and chat history.

## Sharing Through GitHub

Create a GitHub repository and push this project source.

Commit these:

- Source files under `server/` and `src/`.
- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `vite.config.ts`
- `index.html`
- `.env.example`
- `.gitignore`
- `README.md`

Do not commit these:

- `.env`
- `node_modules/`
- `dist/`
- `data/*.sqlite`
- `data/*.sqlite-*`

The existing `.gitignore` already excludes the sensitive/generated files.

## Friend Setup From GitHub

Your friend should run:

```bash
git clone <your-repo-url>
cd <repo-folder>
npm install
```

Then create their own `.env`:

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

They must put their own Gemini key in `.env`:

```env
GEMINI_API_KEY=their_gemini_api_key_here
GEMINI_MODEL=gemini-3.5-flash
PORT=8787
```

Then:

```bash
npm run sync
npm run build
npm start
```

Open:

```text
http://127.0.0.1:8787
```

Their progress, cached summaries, and chat history will stay on their laptop in their own SQLite database.

## Useful Commands

```bash
npm run sync
npm run typecheck
npm run build
npm start
```

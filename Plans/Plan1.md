# Striver A2Z DSA Revision Agent

## Summary
Build a local TypeScript web app in this empty repo that turns the [Striver A2Z sheet](https://takeuforward.org/dsa/strivers-a2z-sheet-learn-dsa-a-to-z) into a searchable revision tutor. The app will list sections/topics, let you choose a topic, then produce a C++-first study bundle using available Take U Forward notes and YouTube video resources.

## Key Changes
- Create a local web app with:
  - Sidebar for A2Z sections/subsections.
  - Topic list with difficulty, article link, video link, and progress state.
  - Topic detail view with summary, notes, C++ solution, complexity, intuition, and follow-up Q&A.
- Add backend tools:
  - `syncSheet`: fetch the master sheet and parse the embedded sheet payload into sections, subcategories, and problems.
  - `fetchTopicResources`: fetch article/editorial text and code blocks; fetch YouTube transcript/captions when available.
  - `generateStudyBundle`: use Gemini to combine notes + video transcript into concise revision material.
- Use SQLite locally for:
  - Sheet metadata cache.
  - Topic resource cache.
  - Generated summaries/code explanations.
  - Progress states: `todo`, `learning`, `revised`.

## Gemini Interface
- Environment:
  - `GEMINI_API_KEY`
  - `GEMINI_MODEL=gemini-3.5-flash`
- Use the official Google Gemini SDK/API syntax, not OpenAI-compatible request syntax.
- Centralize Gemini calls in one provider module so prompts, model name, retries, and response parsing are isolated.
- Generated topic output:
  - Problem/topic summary.
  - Core intuition.
  - Notes from article/editorial when available.
  - Video summary from transcript when available.
  - C++ code as primary output.
  - Time and space complexity.
  - Common mistakes/interview pointers.
  - Source links used.

## App Interfaces
- `GET /api/sections`: returns sheet sections/subsections/topic counts.
- `GET /api/topics?sectionId=...`: returns topics for a section/subsection.
- `POST /api/topics/:id/study`: fetches/caches resources and returns generated notes/code.
- `PATCH /api/topics/:id/progress`: updates local progress.
- `POST /api/chat`: answers follow-up questions grounded in cached topic resources.

## Resource Rules
- If both notes and video transcript exist, use both.
- If only one exists, generate from that one and clearly label the missing source.
- If neither can be fetched, show original links and return a friendly “resource unavailable” state.
- Do not require Chrome automation for normal use; use direct fetch/scrape first. Browser/Chrome automation remains a fallback only if Take U Forward changes rendering in a way direct parsing cannot handle.

## Test Plan
- Verify sheet sync finds all visible sections, including Arrays, Binary Search, Graphs, DP, Tries, and Strings.
- Test one topic with article + video, one article-only topic, and one missing-resource topic.
- Confirm generated output prefers C++ and includes complexity.
- Confirm Gemini uses `GEMINI_API_KEY` and `gemini-3.5-flash` through the Google API style.
- Confirm SQLite cache prevents repeated scraping/generation for the same topic.
- Confirm progress updates persist after app restart.
- Run app locally and verify the main browsing/revision flow in the browser.

## Assumptions
- v1 is a local web app, not a Chrome extension.
- Gemini is used for summaries and explanation generation.
- C++ is the default solution language.
- SQLite is the local storage/cache.
- Progress tracking is simple: todo, learning, revised.

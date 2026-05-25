import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import type {
  ChatMessage,
  ProgressSummary,
  ProgressState,
  SheetProblem,
  SheetSection,
  StudyBundle,
  TopicResources
} from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, "..", "data", "striver-agent.sqlite");

mkdirSync(dirname(dbPath), { recursive: true });

export const db = new DatabaseSync(dbPath);

db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS sections (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    position INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS subcategories (
    id TEXT PRIMARY KEY,
    section_id TEXT NOT NULL,
    name TEXT NOT NULL,
    position INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS topics (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    section_id TEXT NOT NULL,
    section_name TEXT NOT NULL,
    subcategory_id TEXT NOT NULL,
    subcategory_name TEXT NOT NULL,
    article TEXT,
    youtube TEXT,
    leetcode TEXT,
    plus TEXT,
    editorial TEXT,
    link TEXT,
    difficulty TEXT,
    position INTEGER NOT NULL,
    progress TEXT NOT NULL DEFAULT 'todo'
  );

  CREATE TABLE IF NOT EXISTS resources (
    topic_id TEXT PRIMARY KEY,
    article_text TEXT NOT NULL,
    code_blocks_json TEXT NOT NULL,
    transcript TEXT NOT NULL,
    sources_json TEXT NOT NULL,
    fetched_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS study_bundles (
    topic_id TEXT PRIMARY KEY,
    bundle_json TEXT NOT NULL,
    model TEXT NOT NULL,
    generated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    topic_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_chat_messages_topic_id
    ON chat_messages (topic_id, created_at, id);
`);

export function upsertSheet(sections: SheetSection[], topics: SheetProblem[]) {
  const insertSection = db.prepare(`
    INSERT INTO sections (id, name, position)
    VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, position = excluded.position
  `);
  const insertSubcategory = db.prepare(`
    INSERT INTO subcategories (id, section_id, name, position)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      section_id = excluded.section_id,
      name = excluded.name,
      position = excluded.position
  `);
  const insertTopic = db.prepare(`
    INSERT INTO topics (
      id, name, section_id, section_name, subcategory_id, subcategory_name,
      article, youtube, leetcode, plus, editorial, link, difficulty, position, progress
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT progress FROM topics WHERE id = ?), 'todo'))
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      section_id = excluded.section_id,
      section_name = excluded.section_name,
      subcategory_id = excluded.subcategory_id,
      subcategory_name = excluded.subcategory_name,
      article = excluded.article,
      youtube = excluded.youtube,
      leetcode = excluded.leetcode,
      plus = excluded.plus,
      editorial = excluded.editorial,
      link = excluded.link,
      difficulty = excluded.difficulty,
      position = excluded.position
  `);
  const setMeta = db.prepare(`
    INSERT INTO metadata (key, value)
    VALUES ('lastSync', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);

  db.exec("BEGIN");
  try {
    sections.forEach((section, sectionIndex) => {
      insertSection.run(section.id, section.name, sectionIndex);
      section.subcategories.forEach((subcategory, subcategoryIndex) => {
        insertSubcategory.run(
          subcategory.id,
          section.id,
          subcategory.name,
          subcategoryIndex
        );
      });
    });
    topics.forEach((topic, topicIndex) => {
      insertTopic.run(
        topic.id,
        topic.name,
        topic.categoryId,
        topic.categoryName,
        topic.subcategoryId,
        topic.subcategoryName,
        topic.article || null,
        topic.youtube || null,
        topic.leetcode || null,
        topic.plus || null,
        topic.editorial || null,
        topic.link || null,
        topic.difficulty || null,
        topicIndex,
        topic.id
      );
    });
    setMeta.run(new Date().toISOString());
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function getSections(): SheetSection[] {
  const sections = db
    .prepare(
      `SELECT s.id, s.name, s.position, COUNT(t.id) AS problemCount
       FROM sections s
       LEFT JOIN topics t ON t.section_id = s.id
       GROUP BY s.id
       ORDER BY s.position`
    )
    .all() as Array<{ id: string; name: string; problemCount: number }>;
  const subcategories = db
    .prepare(
      `SELECT sc.id, sc.section_id AS sectionId, sc.name, COUNT(t.id) AS problemCount
       FROM subcategories sc
       LEFT JOIN topics t ON t.subcategory_id = sc.id
       GROUP BY sc.id
       ORDER BY sc.position`
    )
    .all() as Array<{
    id: string;
    sectionId: string;
    name: string;
    problemCount: number;
  }>;

  return sections.map((section) => ({
    id: section.id,
    name: section.name,
    problemCount: section.problemCount,
    subcategories: subcategories
      .filter((subcategory) => subcategory.sectionId === section.id)
      .map((subcategory) => ({
        id: subcategory.id,
        name: subcategory.name,
        problemCount: subcategory.problemCount
      }))
  }));
}

export function getTopics(filters: {
  sectionId?: string;
  subcategoryId?: string;
  query?: string;
}): SheetProblem[] {
  const clauses: string[] = [];
  const values: SQLInputValue[] = [];
  if (filters.sectionId) {
    clauses.push("section_id = ?");
    values.push(filters.sectionId);
  }
  if (filters.subcategoryId) {
    clauses.push("subcategory_id = ?");
    values.push(filters.subcategoryId);
  }
  if (filters.query) {
    clauses.push("(LOWER(name) LIKE ? OR LOWER(section_name) LIKE ? OR LOWER(subcategory_name) LIKE ?)");
    const q = `%${filters.query.toLowerCase()}%`;
    values.push(q, q, q);
  }

  const rows = db
    .prepare(
      `SELECT * FROM topics ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
       ORDER BY position`
    )
    .all(...values) as unknown as TopicRow[];

  return rows.map(mapTopicRow);
}

export function getTopic(id: string): SheetProblem | undefined {
  const row = db.prepare("SELECT * FROM topics WHERE id = ?").get(id) as
    | TopicRow
    | undefined;
  return row ? mapTopicRow(row) : undefined;
}

export function setProgress(id: string, progress: ProgressState) {
  db.prepare("UPDATE topics SET progress = ? WHERE id = ?").run(progress, id);
}

export function getProgressSummary(): ProgressSummary {
  const row = db
    .prepare(
      `SELECT
        COUNT(*) AS total,
        COALESCE(SUM(CASE WHEN progress = 'revised' THEN 1 ELSE 0 END), 0) AS revised,
        COALESCE(SUM(CASE WHEN progress = 'learning' THEN 1 ELSE 0 END), 0) AS learning,
        COALESCE(SUM(CASE WHEN progress = 'todo' THEN 1 ELSE 0 END), 0) AS todo
       FROM topics`
    )
    .get() as {
    total: number;
    revised: number;
    learning: number;
    todo: number;
  };

  return {
    ...row,
    percentage: row.total > 0 ? Math.round((row.revised / row.total) * 100) : 0
  };
}

export function getCachedResources(id: string): TopicResources | undefined {
  const row = db.prepare("SELECT * FROM resources WHERE topic_id = ?").get(id) as
    | {
        topic_id: string;
        article_text: string;
        code_blocks_json: string;
        transcript: string;
        sources_json: string;
        fetched_at: string;
      }
    | undefined;

  if (!row) return undefined;
  return {
    problemId: row.topic_id,
    articleText: row.article_text,
    codeBlocks: JSON.parse(row.code_blocks_json) as string[],
    transcript: row.transcript,
    sources: JSON.parse(row.sources_json) as TopicResources["sources"],
    fetchedAt: row.fetched_at
  };
}

export function saveResources(resources: TopicResources) {
  db.prepare(
    `INSERT INTO resources (
      topic_id, article_text, code_blocks_json, transcript, sources_json, fetched_at
    )
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(topic_id) DO UPDATE SET
      article_text = excluded.article_text,
      code_blocks_json = excluded.code_blocks_json,
      transcript = excluded.transcript,
      sources_json = excluded.sources_json,
      fetched_at = excluded.fetched_at`
  ).run(
    resources.problemId,
    resources.articleText,
    JSON.stringify(resources.codeBlocks),
    resources.transcript,
    JSON.stringify(resources.sources),
    resources.fetchedAt
  );
}

export function getCachedStudyBundle(id: string): StudyBundle | undefined {
  const row = db
    .prepare("SELECT bundle_json FROM study_bundles WHERE topic_id = ?")
    .get(id) as { bundle_json: string } | undefined;
  return row ? (JSON.parse(row.bundle_json) as StudyBundle) : undefined;
}

export function saveStudyBundle(id: string, bundle: StudyBundle, model: string) {
  db.prepare(
    `INSERT INTO study_bundles (topic_id, bundle_json, model, generated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(topic_id) DO UPDATE SET
      bundle_json = excluded.bundle_json,
      model = excluded.model,
      generated_at = excluded.generated_at`
  ).run(id, JSON.stringify(bundle), model, new Date().toISOString());
}

export function getLastSync(): string | undefined {
  const row = db.prepare("SELECT value FROM metadata WHERE key = 'lastSync'").get() as
    | { value: string }
    | undefined;
  return row?.value;
}

export function getChatMessages(topicId: string): ChatMessage[] {
  const rows = db
    .prepare(
      `SELECT id, role, content, created_at
       FROM chat_messages
       WHERE topic_id = ?
       ORDER BY created_at, id`
    )
    .all(topicId) as unknown as Array<{
    id: number;
    role: "user" | "assistant";
    content: string;
    created_at: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at
  }));
}

export function saveChatMessage(
  topicId: string,
  role: ChatMessage["role"],
  content: string
): ChatMessage {
  const createdAt = new Date().toISOString();
  const result = db
    .prepare(
      `INSERT INTO chat_messages (topic_id, role, content, created_at)
       VALUES (?, ?, ?, ?)`
    )
    .run(topicId, role, content, createdAt);

  return {
    id: Number(result.lastInsertRowid),
    role,
    content,
    createdAt
  };
}

export function clearChatMessages(topicId: string) {
  db.prepare("DELETE FROM chat_messages WHERE topic_id = ?").run(topicId);
}

interface TopicRow {
  id: string;
  name: string;
  section_id: string;
  section_name: string;
  subcategory_id: string;
  subcategory_name: string;
  article: string | null;
  youtube: string | null;
  leetcode: string | null;
  plus: string | null;
  editorial: string | null;
  link: string | null;
  difficulty: string | null;
  progress: ProgressState;
}

function mapTopicRow(row: TopicRow): SheetProblem {
  return {
    id: row.id,
    name: row.name,
    article: row.article || undefined,
    youtube: row.youtube || undefined,
    leetcode: row.leetcode || undefined,
    plus: row.plus || undefined,
    editorial: row.editorial || undefined,
    link: row.link || undefined,
    difficulty: row.difficulty || undefined,
    categoryId: row.section_id,
    categoryName: row.section_name,
    subcategoryId: row.subcategory_id,
    subcategoryName: row.subcategory_name,
    progress: row.progress
  };
}

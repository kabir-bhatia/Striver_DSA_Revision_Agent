import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import type {
  ChatMessage,
  DailyGoal,
  ProgressSummary,
  RevisionItem,
  SheetProblem,
  SheetSection,
  StudyBundle,
  TierFilter,
  TopicTier,
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
    progress TEXT NOT NULL DEFAULT 'todo',
    done INTEGER NOT NULL DEFAULT 0,
    tier TEXT,
    mistake_note TEXT NOT NULL DEFAULT '',
    done_at_utc TEXT
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

  CREATE TABLE IF NOT EXISTS revision_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    topic_id TEXT NOT NULL,
    tier TEXT NOT NULL,
    stage INTEGER NOT NULL,
    due_date_utc TEXT NOT NULL,
    completed_at_utc TEXT,
    created_at_utc TEXT NOT NULL,
    UNIQUE(topic_id, stage)
  );

  CREATE INDEX IF NOT EXISTS idx_revision_items_due
    ON revision_items (completed_at_utc, due_date_utc);

  CREATE TABLE IF NOT EXISTS daily_goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date_utc TEXT NOT NULL,
    topic_id TEXT,
    title TEXT NOT NULL,
    completed_at_utc TEXT,
    position INTEGER NOT NULL DEFAULT 0,
    created_at_utc TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_daily_goals_date
    ON daily_goals (date_utc, position, id);
`);


// Check and migrate schema version to allow 'very_easy' and remove old constraints
db.exec(`
  CREATE TABLE IF NOT EXISTS metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);
const schemaVersionRow = db.prepare("SELECT value FROM metadata WHERE key = 'schema_version'").get() as { value: string } | undefined;
const schemaVersion = schemaVersionRow ? parseInt(schemaVersionRow.value, 10) : 0;

if (schemaVersion < 2) {
  try {
    console.log("Migrating database tables to remove old tier CHECK constraints...");
    db.exec(`
      PRAGMA foreign_keys = OFF;
      
      -- Migrate topics
      CREATE TABLE IF NOT EXISTS new_topics (
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
        progress TEXT NOT NULL DEFAULT 'todo',
        done INTEGER NOT NULL DEFAULT 0,
        tier TEXT,
        mistake_note TEXT NOT NULL DEFAULT '',
        done_at_utc TEXT
      );
      INSERT OR IGNORE INTO new_topics SELECT id, name, section_id, section_name, subcategory_id, subcategory_name, article, youtube, leetcode, plus, editorial, link, difficulty, position, progress, done, tier, mistake_note, done_at_utc FROM topics;
      DROP TABLE topics;
      ALTER TABLE new_topics RENAME TO topics;

      -- Migrate revision_items
      CREATE TABLE IF NOT EXISTS new_revision_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        topic_id TEXT NOT NULL,
        tier TEXT NOT NULL,
        stage INTEGER NOT NULL,
        due_date_utc TEXT NOT NULL,
        completed_at_utc TEXT,
        created_at_utc TEXT NOT NULL,
        UNIQUE(topic_id, stage)
      );
      INSERT OR IGNORE INTO new_revision_items SELECT id, topic_id, tier, stage, due_date_utc, completed_at_utc, created_at_utc FROM revision_items;
      DROP TABLE revision_items;
      ALTER TABLE new_revision_items RENAME TO revision_items;

      PRAGMA foreign_keys = ON;
    `);

    db.prepare("INSERT OR REPLACE INTO metadata (key, value) VALUES ('schema_version', '2')").run();
    console.log("Database successfully migrated to schema version 2.");
  } catch (err) {
    console.error("Migration failed:", err);
  }
}

ensureColumn("topics", "done", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("topics", "tier", "TEXT");
ensureColumn("topics", "mistake_note", "TEXT NOT NULL DEFAULT ''");
ensureColumn("topics", "done_at_utc", "TEXT");
db.prepare(
  "UPDATE topics SET done = CASE WHEN progress = 'revised' THEN 1 ELSE 0 END WHERE done = 0 AND progress = 'revised'"
).run();

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
      article, youtube, leetcode, plus, editorial, link, difficulty, position,
      progress, done, tier, mistake_note, done_at_utc
    )
    VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      COALESCE((SELECT progress FROM topics WHERE id = ?), 'todo'),
      COALESCE((SELECT done FROM topics WHERE id = ?), 0),
      (SELECT tier FROM topics WHERE id = ?),
      COALESCE((SELECT mistake_note FROM topics WHERE id = ?), ''),
      (SELECT done_at_utc FROM topics WHERE id = ?)
    )
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
        topic.id,
        topic.id,
        topic.id,
        topic.id,
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
  tier?: TierFilter;
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
  if (filters.tier === "unassigned") {
    clauses.push("tier IS NULL");
  } else if (filters.tier) {
    clauses.push("tier = ?");
    values.push(filters.tier);
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

export function setTopicDone(id: string, done: boolean) {
  const topic = getTopic(id);
  if (!topic) throw new Error("Topic not found");
  if (done && !topic.tier) {
    throw new Error("Choose a tier first so revisions can be scheduled.");
  }

  const doneAt = done ? new Date().toISOString() : null;
  db.prepare(
    `UPDATE topics
     SET done = ?, progress = ?, done_at_utc = CASE WHEN ? = 1 THEN COALESCE(done_at_utc, ?) ELSE NULL END
     WHERE id = ?`
  ).run(done ? 1 : 0, done ? "revised" : "todo", done ? 1 : 0, doneAt, id);

  if (done) {
    db.prepare("DELETE FROM revision_items WHERE topic_id = ? AND completed_at_utc IS NULL").run(id);
    scheduleRevisions(id, topic.tier!, utcToday());
  } else {
    db.prepare(
      "DELETE FROM revision_items WHERE topic_id = ? AND completed_at_utc IS NULL"
    ).run(id);
  }

  return getTopic(id)!;
}

export function setTopicTier(id: string, tier: string | null) {
  const normalized = normalizeTier(tier);
  db.prepare("UPDATE topics SET tier = ? WHERE id = ?").run(normalized, id);
  const topic = getTopic(id);
  if (!topic) throw new Error("Topic not found");
  if (topic.done && topic.tier) {
    const doneAtRow = db
      .prepare("SELECT done_at_utc FROM topics WHERE id = ?")
      .get(id) as { done_at_utc: string | null } | undefined;
    const baseDate = doneAtRow?.done_at_utc
      ? doneAtRow.done_at_utc.slice(0, 10)
      : utcToday();
    db.prepare(
      "DELETE FROM revision_items WHERE topic_id = ? AND completed_at_utc IS NULL"
    ).run(id);
    scheduleRevisions(id, topic.tier, baseDate);
  }
  return getTopic(id)!;
}

export function setTopicNote(id: string, note: string) {
  db.prepare("UPDATE topics SET mistake_note = ? WHERE id = ?").run(note, id);
  return getTopic(id);
}

export function getProgressSummary(): ProgressSummary {
  const row = db
    .prepare(
      `SELECT
        COUNT(*) AS total,
        COALESCE(SUM(CASE WHEN done = 1 THEN 1 ELSE 0 END), 0) AS done
       FROM topics`
    )
    .get() as {
    total: number;
    done: number;
  };

  return {
    total: row.total,
    done: row.done,
    remaining: row.total - row.done,
    percentage: row.total > 0 ? Math.round((row.done / row.total) * 100) : 0
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

export function getTopicRevisions(topicId: string): RevisionItem[] {
  return mapRevisionRows(
    db
      .prepare(
        `SELECT r.*, t.name AS topic_name, t.section_name, t.subcategory_name, t.mistake_note
         FROM revision_items r
         JOIN topics t ON t.id = r.topic_id
         WHERE r.topic_id = ?
         ORDER BY r.stage`
      )
      .all(topicId) as unknown as RevisionRow[]
  );
}

export function getTodaySchedule() {
  const today = utcToday();
  return {
    todayUtc: today,
    revisions: getDueRevisions(today),
    goals: getGoals(today)
  };
}

export function completeRevision(id: number) {
  db.prepare(
    "UPDATE revision_items SET completed_at_utc = COALESCE(completed_at_utc, ?) WHERE id = ?"
  ).run(new Date().toISOString(), id);
}

export function getGoals(dateUtc = utcToday()): DailyGoal[] {
  const rows = db
    .prepare(
      `SELECT g.*, t.name AS topic_name
       FROM daily_goals g
       LEFT JOIN topics t ON t.id = g.topic_id
       WHERE g.date_utc = ?
       ORDER BY g.position, g.id`
    )
    .all(dateUtc) as unknown as GoalRow[];
  return rows.map(mapGoalRow);
}

export function createGoal(input: {
  dateUtc?: string;
  topicId?: string;
  title?: string;
}) {
  const dateUtc = input.dateUtc || utcToday();
  const topic = input.topicId ? getTopic(input.topicId) : undefined;
  const title = (input.title || topic?.name || "").trim();
  if (!title) throw new Error("Goal title is required.");
  const positionRow = db
    .prepare(
      "SELECT COALESCE(MAX(position), -1) + 1 AS position FROM daily_goals WHERE date_utc = ?"
    )
    .get(dateUtc) as { position: number };
  const result = db
    .prepare(
      `INSERT INTO daily_goals (date_utc, topic_id, title, position, created_at_utc)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(
      dateUtc,
      input.topicId || null,
      title,
      positionRow.position,
      new Date().toISOString()
    );
  return getGoal(Number(result.lastInsertRowid));
}

export function updateGoal(
  id: number,
  input: { title?: string; completed?: boolean }
) {
  const current = getGoal(id);
  if (!current) throw new Error("Goal not found.");
  const title = input.title === undefined ? current.title : input.title.trim();
  if (!title) throw new Error("Goal title is required.");
  const completedAt =
    input.completed === undefined
      ? current.completedAtUtc || null
      : input.completed
        ? new Date().toISOString()
        : null;
  db.prepare(
    "UPDATE daily_goals SET title = ?, completed_at_utc = ? WHERE id = ?"
  ).run(title, completedAt, id);
  return getGoal(id);
}

export function deleteGoal(id: number) {
  db.prepare("DELETE FROM daily_goals WHERE id = ?").run(id);
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
  progress: string;
  done: number;
  tier: SheetProblem["tier"] | null;
  mistake_note: string | null;
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
    done: Boolean(row.done),
    tier: row.tier || undefined,
    mistakeNote: row.mistake_note || ""
  };
}

function scheduleRevisions(topicId: string, tier: TopicTier, baseDate: string) {
  const offsets = tierOffsets(tier);
  if (!offsets.length) return;
  const insert = db.prepare(
    `INSERT INTO revision_items (topic_id, tier, stage, due_date_utc, created_at_utc)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(topic_id, stage) DO UPDATE SET
      tier = excluded.tier,
      due_date_utc = excluded.due_date_utc`
  );
  const now = new Date().toISOString();
  offsets.forEach((days, index) => {
    insert.run(topicId, tier, index + 1, addUtcDays(baseDate, days), now);
  });
}

function getDueRevisions(todayUtc: string): RevisionItem[] {
  return mapRevisionRows(
    db
      .prepare(
        `SELECT r.*, t.name AS topic_name, t.section_name, t.subcategory_name, t.mistake_note
         FROM revision_items r
         JOIN topics t ON t.id = r.topic_id
         WHERE r.completed_at_utc IS NULL AND r.due_date_utc <= ?
         ORDER BY r.due_date_utc, r.stage, t.position`
      )
      .all(todayUtc) as unknown as RevisionRow[]
  );
}

function tierOffsets(tier?: TopicTier) {
  if (tier === "very_easy") return [];
  if (tier === "easy") return [25];
  if (tier === "medium") return [7, 20];
  if (tier === "hard" || tier === "tricky") return [2, 10, 30];
  return [];
}

export function utcToday() {
  return new Date().toISOString().slice(0, 10);
}

function addUtcDays(dateUtc: string, days: number) {
  const date = new Date(`${dateUtc}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function normalizeTier(tier: string | null) {
  if (
    tier === "very_easy" ||
    tier === "easy" ||
    tier === "medium" ||
    tier === "hard" ||
    tier === "tricky"
  ) {
    return tier;
  }
  return null;
}

function ensureColumn(table: string, column: string, definition: string) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
    name: string;
  }>;
  if (!rows.some((row) => row.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

interface RevisionRow {
  id: number;
  topic_id: string;
  topic_name: string;
  section_name: string;
  subcategory_name: string;
  tier: TopicTier;
  stage: number;
  due_date_utc: string;
  completed_at_utc: string | null;
  created_at_utc: string;
  mistake_note: string | null;
}

function mapRevisionRows(rows: RevisionRow[]): RevisionItem[] {
  return rows.map((row) => ({
    id: row.id,
    topicId: row.topic_id,
    topicName: row.topic_name,
    categoryName: row.section_name,
    subcategoryName: row.subcategory_name,
    tier: row.tier,
    stage: row.stage,
    dueDateUtc: row.due_date_utc,
    completedAtUtc: row.completed_at_utc || undefined,
    createdAtUtc: row.created_at_utc,
    mistakeNote: row.mistake_note || ""
  }));
}

interface GoalRow {
  id: number;
  date_utc: string;
  topic_id: string | null;
  topic_name: string | null;
  title: string;
  completed_at_utc: string | null;
  position: number;
  created_at_utc: string;
}

function getGoal(id: number): DailyGoal | undefined {
  const row = db
    .prepare(
      `SELECT g.*, t.name AS topic_name
       FROM daily_goals g
       LEFT JOIN topics t ON t.id = g.topic_id
       WHERE g.id = ?`
    )
    .get(id) as GoalRow | undefined;
  return row ? mapGoalRow(row) : undefined;
}

function mapGoalRow(row: GoalRow): DailyGoal {
  return {
    id: row.id,
    dateUtc: row.date_utc,
    topicId: row.topic_id || undefined,
    topicName: row.topic_name || undefined,
    title: row.title,
    completedAtUtc: row.completed_at_utc || undefined,
    position: row.position,
    createdAtUtc: row.created_at_utc
  };
}

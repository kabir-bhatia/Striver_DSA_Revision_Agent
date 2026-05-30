import cors from "cors";
import express from "express";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import {
  clearChatMessages,
  completeRevision,
  createGoal,
  deleteGoal,
  getCachedResources,
  getCachedStudyBundle,
  getChatMessages,
  getGoals,
  getProgressSummary,
  getSections,
  getTopic,
  getTodaySchedule,
  getTopicRevisions,
  getTopics,
  saveChatMessage,
  saveResources,
  saveStudyBundle,
  setTopicDone,
  setTopicNote,
  setTopicTier,
  updateGoal
} from "./db.js";
import { answerTopicQuestion, generateStudyBundle } from "./services/gemini.js";
import { fetchTopicResources } from "./services/resources.js";
import { syncSheet } from "./services/sheet.js";
import type { ChatMessage, TierFilter } from "./types.js";

const app = express();
const __dirname = dirname(fileURLToPath(import.meta.url));
const clientDist = join(__dirname, "..", "dist", "client");

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    model: config.geminiModel,
    geminiConfigured: Boolean(config.geminiApiKey)
  });
});

app.post("/api/sync", async (req, res, next) => {
  try {
    const result = await syncSheet(Boolean(req.body?.force));
    res.json({
      synced: result.synced,
      sections: result.sections.length,
      topics: result.topics.length
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/sections", async (_req, res, next) => {
  try {
    await syncSheet(false);
    res.json(getSections());
  } catch (error) {
    next(error);
  }
});

app.get("/api/progress", async (_req, res, next) => {
  try {
    await syncSheet(false);
    res.json(getProgressSummary());
  } catch (error) {
    next(error);
  }
});

app.get("/api/topics", async (req, res, next) => {
  try {
    await syncSheet(false);
    res.json(
      getTopics({
        sectionId: stringQuery(req.query.sectionId),
        subcategoryId: stringQuery(req.query.subcategoryId),
        query: stringQuery(req.query.q),
        tier: tierQuery(req.query.tier)
      })
    );
  } catch (error) {
    next(error);
  }
});

app.get("/api/topics/:id", async (req, res) => {
  const topic = getTopic(req.params.id);
  if (!topic) return res.status(404).json({ error: "Topic not found" });
  return res.json(topic);
});

app.get("/api/topics/:id/chat", (req, res) => {
  const topic = getTopic(req.params.id);
  if (!topic) return res.status(404).json({ error: "Topic not found" });
  return res.json(getChatMessages(topic.id));
});

app.get("/api/topics/:id/revisions", (req, res) => {
  const topic = getTopic(req.params.id);
  if (!topic) return res.status(404).json({ error: "Topic not found" });
  return res.json(getTopicRevisions(topic.id));
});

app.delete("/api/topics/:id/chat", (req, res) => {
  const topic = getTopic(req.params.id);
  if (!topic) return res.status(404).json({ error: "Topic not found" });
  clearChatMessages(topic.id);
  return res.json({ ok: true, messages: [] });
});

app.post("/api/topics/:id/study", async (req, res, next) => {
  try {
    const topic = getTopic(req.params.id);
    if (!topic) return res.status(404).json({ error: "Topic not found" });

    const force = Boolean(req.body?.force);
    let resources = force ? undefined : getCachedResources(topic.id);
    if (!resources) {
      resources = await fetchTopicResources(topic);
      saveResources(resources);
    }

    let bundle = force ? undefined : getCachedStudyBundle(topic.id);
    if (!bundle) {
      bundle = await generateStudyBundle(topic, resources);
      saveStudyBundle(topic.id, bundle, config.geminiModel);
    }

    res.json({ topic, resources, bundle });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/topics/:id/done", (req, res, next) => {
  try {
    const done = req.body?.done;
    if (typeof done !== "boolean") {
      return res.status(400).json({ error: "Done must be a boolean" });
    }
    const topic = getTopic(req.params.id);
    if (!topic) return res.status(404).json({ error: "Topic not found" });
    return res.json(setTopicDone(topic.id, done));
  } catch (error) {
    next(error);
  }
});

app.patch("/api/topics/:id/tier", (req, res, next) => {
  try {
    const tier = req.body?.tier ?? null;
    if (tier !== null && !isTier(tier)) {
      return res.status(400).json({ error: "Invalid tier value" });
    }
    const topic = getTopic(req.params.id);
    if (!topic) return res.status(404).json({ error: "Topic not found" });
    return res.json(setTopicTier(topic.id, tier));
  } catch (error) {
    next(error);
  }
});

app.patch("/api/topics/:id/note", (req, res) => {
  const topic = getTopic(req.params.id);
  if (!topic) return res.status(404).json({ error: "Topic not found" });
  return res.json(setTopicNote(topic.id, String(req.body?.note || "")));
});

app.get("/api/schedule/today", (_req, res) => {
  return res.json(getTodaySchedule());
});

app.post("/api/revisions/:id/complete", (req, res) => {
  completeRevision(Number(req.params.id));
  return res.json(getTodaySchedule());
});

app.get("/api/goals", (req, res) => {
  res.json(getGoals(stringQuery(req.query.date)));
});

app.post("/api/goals", (req, res, next) => {
  try {
    res.json(
      createGoal({
        dateUtc: stringQuery(req.body?.dateUtc),
        topicId: stringQuery(req.body?.topicId),
        title: stringQuery(req.body?.title)
      })
    );
  } catch (error) {
    next(error);
  }
});

app.patch("/api/goals/:id", (req, res, next) => {
  try {
    res.json(
      updateGoal(Number(req.params.id), {
        title: req.body?.title === undefined ? undefined : String(req.body.title),
        completed:
          req.body?.completed === undefined ? undefined : Boolean(req.body.completed)
      })
    );
  } catch (error) {
    next(error);
  }
});

app.delete("/api/goals/:id", (req, res) => {
  deleteGoal(Number(req.params.id));
  res.json({ ok: true });
});

app.post("/api/chat", async (req, res, next) => {
  try {
    const topic = getTopic(req.body?.topicId);
    const messages = req.body?.messages as ChatMessage[] | undefined;
    if (!topic) return res.status(404).json({ error: "Topic not found" });
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "Messages are required" });
    }

    let resources = getCachedResources(topic.id);
    if (!resources) {
      resources = await fetchTopicResources(topic);
      saveResources(resources);
    }

    const answer = await answerTopicQuestion(topic, resources, messages);
    const latestUserMessage = [...messages]
      .reverse()
      .find((message) => message.role === "user");
    if (latestUserMessage?.content) {
      saveChatMessage(topic.id, "user", latestUserMessage.content);
    }
    saveChatMessage(topic.id, "assistant", answer);

    return res.json({ answer, messages: getChatMessages(topic.id) });
  } catch (error) {
    next(error);
  }
});

if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.use((req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(join(clientDist, "index.html"));
  });
}

app.use(
  (
    error: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error(error);
    res.status(500).json({ error: error.message || "Unexpected server error" });
  }
);

app.listen(config.port, "127.0.0.1", () => {
  console.log(`Striver DSA Revision Agent API running at http://127.0.0.1:${config.port}`);
});

function stringQuery(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function tierQuery(value: unknown): TierFilter | undefined {
  if (
    value === "easy" ||
    value === "medium" ||
    value === "hard" ||
    value === "tricky" ||
    value === "unassigned"
  ) {
    return value;
  }
  return undefined;
}

function isTier(value: unknown) {
  return value === "easy" || value === "medium" || value === "hard" || value === "tricky";
}

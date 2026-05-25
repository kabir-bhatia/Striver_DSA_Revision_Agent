import cors from "cors";
import express from "express";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import {
  clearChatMessages,
  getCachedResources,
  getCachedStudyBundle,
  getChatMessages,
  getProgressSummary,
  getSections,
  getTopic,
  getTopics,
  saveChatMessage,
  saveResources,
  saveStudyBundle,
  setProgress
} from "./db.js";
import { answerTopicQuestion, generateStudyBundle } from "./services/gemini.js";
import { fetchTopicResources } from "./services/resources.js";
import { syncSheet } from "./services/sheet.js";
import type { ChatMessage, ProgressState } from "./types.js";

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
        query: stringQuery(req.query.q)
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

app.patch("/api/topics/:id/progress", (req, res) => {
  const progress = req.body?.progress;
  if (!isProgressState(progress)) {
    return res.status(400).json({ error: "Invalid progress value" });
  }

  const topic = getTopic(req.params.id);
  if (!topic) return res.status(404).json({ error: "Topic not found" });

  setProgress(topic.id, progress);
  return res.json({ ...topic, progress });
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

function isProgressState(value: unknown): value is ProgressState {
  return value === "todo" || value === "learning" || value === "revised";
}

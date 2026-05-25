import { GoogleGenAI } from "@google/genai";
import { config } from "../config.js";
import type { ChatMessage, SheetProblem, StudyBundle, TopicResources } from "../types.js";

let client: GoogleGenAI | undefined;

function getClient() {
  if (!config.geminiApiKey) {
    throw new Error("GEMINI_API_KEY is not set. Add it to .env and restart the server.");
  }
  client ??= new GoogleGenAI({ apiKey: config.geminiApiKey });
  return client;
}

export async function generateStudyBundle(
  topic: SheetProblem,
  resources: TopicResources
): Promise<StudyBundle> {
  const prompt = buildStudyPrompt(topic, resources);
  const response = await getClient().models.generateContent({
    model: config.geminiModel,
    contents: prompt,
    config: {
      responseMimeType: "application/json"
    }
  });

  return normalizeStudyBundle(parseJsonResponse(response.text || ""));
}

export async function answerTopicQuestion(
  topic: SheetProblem,
  resources: TopicResources,
  messages: ChatMessage[]
) {
  const history = messages
    .slice(-8)
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join("\n\n");

  const response = await getClient().models.generateContent({
    model: config.geminiModel,
    contents: `You are a DSA placement revision tutor. Answer in concise, practical terms and prefer C++ examples.

Topic:
${topic.name}

Article notes:
${resources.articleText || "Not available"}

Video transcript:
${resources.transcript || "Not available"}

Recent chat:
${history}

Answer the latest user question. If the resources are insufficient, say what is missing and answer from general DSA knowledge clearly.`,
    config: {
      temperature: 0.3
    }
  });

  return response.text || "";
}

function buildStudyPrompt(topic: SheetProblem, resources: TopicResources) {
  return `Create a C++-first DSA revision bundle for placement preparation.

Return ONLY valid JSON with this exact shape:
{
  "summary": "string",
  "intuition": "string",
  "notes": ["string"],
  "videoSummary": "string",
  "cppCode": "string",
  "complexity": "string",
  "mistakes": ["string"],
  "sourceNotes": ["string"]
}

Topic metadata:
- Name: ${topic.name}
- Section: ${topic.categoryName}
- Subsection: ${topic.subcategoryName}
- Difficulty: ${topic.difficulty || "Unknown"}
- Article: ${topic.article || "Missing"}
- YouTube: ${topic.youtube || "Missing"}

Resource availability:
- Article notes available: ${resources.sources.articleAvailable ? "yes" : "no"}
- Video transcript available: ${resources.sources.transcriptAvailable ? "yes" : "no"}

Article notes:
${resources.articleText || "Not available"}

Extracted code blocks from article:
${resources.codeBlocks.length ? resources.codeBlocks.join("\n\n---\n\n") : "None"}

Video transcript:
${resources.transcript || "Not available"}

Instructions:
- Use both article notes and video transcript if available.
- If only one resource is available, base the bundle on that resource and mention the missing source in sourceNotes.
- Prefer a clean, interview-ready C++ solution.
- Include time and space complexity.
- Keep notes sharp for someone revising after forgetting concepts.`;
}

function parseJsonResponse(text: string) {
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned) as Partial<StudyBundle>;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1)) as Partial<StudyBundle>;
    }
    throw new Error("Gemini returned a response that was not valid JSON.");
  }
}

function normalizeStudyBundle(value: Partial<StudyBundle>): StudyBundle {
  return {
    summary: value.summary || "",
    intuition: value.intuition || "",
    notes: arrayOfStrings(value.notes),
    videoSummary: value.videoSummary || "",
    cppCode: value.cppCode || "",
    complexity: value.complexity || "",
    mistakes: arrayOfStrings(value.mistakes),
    sourceNotes: arrayOfStrings(value.sourceNotes)
  };
}

function arrayOfStrings(value: unknown) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}

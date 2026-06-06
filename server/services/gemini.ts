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
    contents: `You are a DSA placement revision tutor. Answer in concise, practical terms and prefer Python examples.
When generating Python code, use clean, readable Python 3 with type hints where helpful.

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
  return `Create a Python-first DSA revision bundle for placement preparation.

Return ONLY valid JSON with this exact shape:
{
  "problem": "string",
  "intuition": "string",
  "solution": ["string"],
  "pythonCode": "string",
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

Field-by-field instructions:

"problem":
  - Write a clear, self-contained problem statement in the style of LeetCode.
  - Include: what the input is, what the output should be, any constraints that matter.
  - Include 1-2 concrete examples with Input/Output/Explanation, extracted from the article if available, otherwise generate realistic ones.
  - The reader should fully understand the problem from this section alone, without needing to visit any link.
  - Format: plain text with newlines. Example blocks like: "Example 1:\nInput: nums = [1,0,1], goal = 2\nOutput: 4\nExplanation: ..."

"intuition":
  - Explain the WHY behind the optimal approach, not just the what.
  - Start by describing what a naive/brute force approach looks like and why it is slow.
  - Then explain the key observation or insight that leads to the better approach.
  - Explain why this specific data structure or algorithm (e.g. sliding window, binary search, DP) is a natural fit for this problem.
  - Use analogies or concrete reasoning. Be thorough — this should read like a senior engineer explaining to a junior.
  - Do NOT just list steps. Focus on building the mental model.

"solution":
  - This is an array of strings, each string is one step in the solution.
  - Provide a detailed, step-by-step walkthrough of the algorithm.
  - Each step should be a complete thought that explains: what we are doing AND why.
  - Cover: initialisation, the main loop logic, edge cases, how each variable is used.
  - Aim for 6-10 steps. Each step should be 1-3 sentences, not just a one-liner.
  - Example of good quality: "Maintain a max_freq variable tracking the highest character frequency seen in the window. Crucially, we never decrease max_freq even when shrinking — because we only care about the largest valid window seen so far, not the current window's exact max."

"pythonCode":
  - Clean, interview-ready Python 3 solution.
  - Add inline comments on non-obvious lines.
  - Use type hints.

"complexity":
  - Time and space complexity with a brief justification for each.

"mistakes":
  - Common mistakes or gotchas specific to this problem that trip people up in interviews.

"sourceNotes":
  - Note which resources were used. Mention if article or transcript was missing.`;
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
    problem: value.problem || "",
    intuition: value.intuition || "",
    solution: arrayOfStrings(value.solution),
    pythonCode: value.pythonCode || "",
    complexity: value.complexity || "",
    mistakes: arrayOfStrings(value.mistakes),
    sourceNotes: arrayOfStrings(value.sourceNotes)
  };
}

function arrayOfStrings(value: unknown) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}

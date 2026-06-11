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
      responseMimeType: "application/json",
      responseJsonSchema: {
        type: "object",
        additionalProperties: false,
        required: [
          "problem",
          "intuition",
          "solution",
          "cppCode",
          "complexity",
          "mistakes",
          "sourceNotes"
        ],
        properties: {
          problem: { type: "string" },
          intuition: { type: "string" },
          solution: {
            type: "array",
            items: { type: "string" }
          },
          cppCode: { type: "string" },
          complexity: { type: "string" },
          mistakes: {
            type: "array",
            items: { type: "string" }
          },
          sourceNotes: {
            type: "array",
            items: { type: "string" }
          }
        }
      },
      temperature: 0.2
    }
  });

  const text = response.text || "";
  const parsed = parseJsonResponse(text);
  return normalizeStudyBundle(parsed);
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
  "problem": "string",
  "intuition": "string",
  "solution": ["string"],
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

"cppCode":
  - Clean, interview-ready C++ solution.
  - Always include \`using namespace std;\` immediately after the #include statements.
  - Add inline comments on non-obvious lines.

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

  const candidates = [cleaned];
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) {
    candidates.push(cleaned.slice(start, end + 1));
  }

  let lastError: unknown;
  for (const candidate of [...new Set(candidates)]) {
    try {
      return JSON.parse(candidate) as Partial<StudyBundle>;
    } catch (error) {
      lastError = error;
    }

    try {
      return JSON.parse(escapeControlCharactersInStrings(candidate)) as Partial<StudyBundle>;
    } catch (error) {
      lastError = error;
    }
  }

  const detail = lastError instanceof Error ? ` ${lastError.message}` : "";
  throw new Error(`Gemini returned malformed JSON even after repair.${detail}`);
}

function escapeControlCharactersInStrings(value: string) {
  let result = "";
  let inString = false;
  let escaped = false;

  for (const character of value) {
    if (escaped) {
      result += character;
      escaped = false;
      continue;
    }

    if (character === "\\") {
      result += character;
      if (inString) escaped = true;
      continue;
    }

    if (character === '"') {
      result += character;
      inString = !inString;
      continue;
    }

    if (inString) {
      if (character === "\n") {
        result += "\\n";
        continue;
      }
      if (character === "\r") {
        result += "\\r";
        continue;
      }
      if (character === "\t") {
        result += "\\t";
        continue;
      }
      const code = character.charCodeAt(0);
      if (code < 0x20) {
        result += `\\u${code.toString(16).padStart(4, "0")}`;
        continue;
      }
    }

    result += character;
  }

  return result;
}

function normalizeStudyBundle(value: Partial<StudyBundle> & { summary?: string; notes?: string[] }): StudyBundle {
  return {
    problem: value.problem || value.summary || "",
    intuition: value.intuition || "",
    solution: arrayOfStrings(value.solution && value.solution.length > 0 ? value.solution : value.notes),
    cppCode: value.cppCode || "",
    complexity: value.complexity || "",
    mistakes: arrayOfStrings(value.mistakes),
    sourceNotes: arrayOfStrings(value.sourceNotes)
  };
}

function arrayOfStrings(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter((item) => typeof item === "string");
  }
  if (typeof value === "string") {
    // If Gemini accidentally returns a single formatted string, split it by newlines
    return value.split("\n").filter(Boolean);
  }
  return [];
}

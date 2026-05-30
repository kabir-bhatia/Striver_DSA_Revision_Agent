import { config } from "../config.js";
import { getLastSync, getSections, getTopics, upsertSheet } from "../db.js";
import type { SheetProblem, SheetSection } from "../types.js";

interface RawProblem {
  problem_id: string;
  problem_name: string;
  article?: string;
  youtube?: string;
  leetcode?: string;
  plus?: string;
  editorial?: string;
  link?: string;
  difficulty?: string;
}

interface RawSubcategory {
  subcategory_id: string;
  subcategory_name: string;
  problems: RawProblem[];
}

interface RawSection {
  category_id: string;
  category_name: string;
  subcategories: RawSubcategory[];
}

interface RawSheetPayload {
  sections: RawSection[];
}

export async function syncSheet(force = false) {
  const hasData = getSections().length > 0;
  const lastSync = getLastSync();
  const freshEnough =
    lastSync && Date.now() - new Date(lastSync).getTime() < 1000 * 60 * 60 * 24;

  if (!force && hasData && freshEnough) {
    return { sections: getSections(), topics: getTopics({}), synced: false };
  }

  const response = await fetch(config.sheetUrl, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) StriverRevisionAgent/0.1"
    }
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch sheet: ${response.status}`);
  }

  const html = await response.text();
  const payload = extractSheetPayload(html);
  const { sections, topics } = normalizePayload(payload);
  upsertSheet(sections, topics);

  return { sections, topics, synced: true };
}

export function extractSheetPayload(html: string): RawSheetPayload {
  const flight = extractFlightText(html);
  const candidates = [flight, unescapeFlightText(flight), html, unescapeFlightText(html)];

  for (const candidate of candidates) {
    const payload = tryExtractSheetJson(candidate);
    if (payload) return payload;
  }

  throw new Error("Could not find Striver sheet payload in page HTML");
}

function extractFlightText(html: string) {
  const pieces: string[] = [];
  const pushRegex =
    /self\.__next_f\.push\(\[1,("(?:(?:\\.|[^"\\])*)")\]\)/g;
  let match: RegExpExecArray | null;

  while ((match = pushRegex.exec(html))) {
    try {
      pieces.push(JSON.parse(match[1]) as string);
    } catch {
      pieces.push(match[1]);
    }
  }

  return pieces.join("");
}

function unescapeFlightText(value: string) {
  return value
    .replaceAll("\\u0026", "&")
    .replaceAll('\\"', '"')
    .replaceAll("\\/", "/");
}

function tryExtractSheetJson(text: string): RawSheetPayload | undefined {
  const marker =
    text.indexOf('"sections":') >= 0 ? '"sections":' : '\\"sections\\":';
  const sectionsIndex = text.indexOf(marker);
  if (sectionsIndex < 0) return undefined;

  const objectStart = text.lastIndexOf("{", sectionsIndex);
  if (objectStart < 0) return undefined;

  const jsonText = readBalancedJsonObject(text, objectStart);
  if (!jsonText) return undefined;

  try {
    const parsed = JSON.parse(jsonText) as Partial<RawSheetPayload>;
    if (Array.isArray(parsed.sections)) {
      return parsed as RawSheetPayload;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function readBalancedJsonObject(text: string, start: number) {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) return text.slice(start, index + 1);
  }

  return "";
}

function normalizePayload(payload: RawSheetPayload) {
  const sections: SheetSection[] = [];
  const topics: SheetProblem[] = [];

  payload.sections.forEach((section) => {
    const subcategories = section.subcategories.map((subcategory) => ({
      id: subcategory.subcategory_id,
      name: subcategory.subcategory_name,
      problemCount: subcategory.problems.length
    }));

    sections.push({
      id: section.category_id,
      name: section.category_name,
      problemCount: subcategories.reduce(
        (total, subcategory) => total + subcategory.problemCount,
        0
      ),
      subcategories
    });

    section.subcategories.forEach((subcategory) => {
      subcategory.problems.forEach((problem) => {
        topics.push({
          id: problem.problem_id,
          name: problem.problem_name,
          article: normalizeUrl(problem.article),
          youtube: normalizeUrl(problem.youtube),
          leetcode: normalizeUrl(problem.leetcode),
          plus: normalizeUrl(problem.plus),
          editorial: normalizeUrl(problem.editorial),
          link: normalizeUrl(problem.link),
          difficulty: problem.difficulty,
          categoryId: section.category_id,
          categoryName: section.category_name,
          subcategoryId: subcategory.subcategory_id,
          subcategoryName: subcategory.subcategory_name,
          done: false,
          mistakeNote: ""
        });
      });
    });
  });

  return { sections, topics };
}

function normalizeUrl(value?: string) {
  if (!value || value === "$undefined") return undefined;
  if (value.startsWith("/")) return `https://takeuforward.org${value}`;
  return value;
}

import * as cheerio from "cheerio";
import type { SheetProblem, TopicResources } from "../types.js";

export async function fetchTopicResources(
  topic: SheetProblem
): Promise<TopicResources> {
  const [article, transcript] = await Promise.all([
    topic.article ? fetchArticle(topic.article) : Promise.resolve(undefined),
    topic.youtube ? fetchYouTubeTranscript(topic.youtube) : Promise.resolve("")
  ]);

  return {
    problemId: topic.id,
    articleText: article?.text || "",
    codeBlocks: article?.codeBlocks || [],
    transcript,
    sources: {
      article: topic.article,
      youtube: topic.youtube,
      articleAvailable: Boolean(article?.text),
      transcriptAvailable: Boolean(transcript)
    },
    fetchedAt: new Date().toISOString()
  };
}

async function fetchArticle(url: string) {
  try {
    const response = await fetch(url, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) StriverRevisionAgent/0.1"
      }
    });
    if (!response.ok) return undefined;

    const html = await response.text();
    const $ = cheerio.load(html);
    $("script, style, noscript, nav, header, footer, svg").remove();

    const codeBlocks = $("pre, code")
      .map((_, element) => $(element).text().trim())
      .get()
      .filter((block) => block.length > 20)
      .filter((block, index, all) => all.indexOf(block) === index)
      .slice(0, 8);

    const container =
      $("article").first().text().trim() ||
      $("main").first().text().trim() ||
      $("body").text().trim();

    const text = compactText(container)
      .replace(/Command Palette.*?Search for a command to run\.\.\./i, "")
      .slice(0, 18000);

    return { text, codeBlocks };
  } catch {
    return undefined;
  }
}

async function fetchYouTubeTranscript(url: string) {
  const videoId = extractVideoId(url);
  if (!videoId) return "";

  try {
    const watch = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        "accept-language": "en-US,en;q=0.9",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) StriverRevisionAgent/0.1"
      }
    });
    if (!watch.ok) return "";

    const html = await watch.text();
    const captionTracks = extractCaptionTracks(html);
    const englishTrack =
      captionTracks.find((track) => track.languageCode?.startsWith("en")) ||
      captionTracks[0];
    if (!englishTrack?.baseUrl) return "";

    const transcriptResponse = await fetch(
      `${englishTrack.baseUrl}&fmt=srv3`,
      {
        headers: {
          "accept-language": "en-US,en;q=0.9",
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) StriverRevisionAgent/0.1"
        }
      }
    );
    if (!transcriptResponse.ok) return "";

    const xml = await transcriptResponse.text();
    const $ = cheerio.load(xml, { xmlMode: true });
    const transcript = $("text")
      .map((_, element) => $(element).text())
      .get()
      .join(" ");

    return compactText(transcript).slice(0, 22000);
  } catch {
    return "";
  }
}

function extractCaptionTracks(html: string): Array<{
  baseUrl?: string;
  languageCode?: string;
}> {
  const match = html.match(/"captionTracks":(\[.*?\])\s*,\s*"audioTracks"/);
  if (!match) return [];

  try {
    return JSON.parse(match[1].replaceAll("\\u0026", "&")) as Array<{
      baseUrl?: string;
      languageCode?: string;
    }>;
  } catch {
    return [];
  }
}

function extractVideoId(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtu.be")) {
      return parsed.pathname.split("/").filter(Boolean)[0];
    }
    return parsed.searchParams.get("v") || undefined;
  } catch {
    return undefined;
  }
}

function compactText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

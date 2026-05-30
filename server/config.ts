import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: Number(process.env.PORT || 8787),
  sheetUrl:
    "https://takeuforward.org/dsa/strivers-a2z-sheet-learn-dsa-a-to-z",
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  geminiModel: process.env.GEMINI_MODEL || "gemini-2.5-flash-lite"
};

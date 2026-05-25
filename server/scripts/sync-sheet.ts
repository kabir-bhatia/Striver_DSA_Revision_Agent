import { syncSheet } from "../services/sheet.js";

const result = await syncSheet(true);
console.log(
  `Synced ${result.sections.length} sections and ${result.topics.length} topics.`
);

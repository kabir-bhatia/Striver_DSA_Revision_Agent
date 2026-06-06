import { writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("data/striver-agent.sqlite");

const sections = db
  .prepare("SELECT id, name FROM sections ORDER BY position")
  .all();
const subcategories = db
  .prepare("SELECT id, section_id, name FROM subcategories ORDER BY position")
  .all();
const topics = db
  .prepare(
    `SELECT
      id, name, section_id, subcategory_id, article, youtube, leetcode, link, difficulty
     FROM topics
     ORDER BY position`
  )
  .all();

const lines = [
  "# Striver A2Z DSA Sheet",
  "",
  `Generated from the local synced sheet cache.`,
  "",
  `- Sections: ${sections.length}`,
  `- Subtopics: ${subcategories.length}`,
  `- Problems / concepts: ${topics.length}`,
  ""
];

for (const [sectionIndex, section] of sections.entries()) {
  const sectionSubcategories = subcategories.filter(
    (subcategory) => subcategory.section_id === section.id
  );
  const sectionTopicCount = topics.filter(
    (topic) => topic.section_id === section.id
  ).length;

  lines.push(
    `## ${sectionIndex + 1}. ${section.name}`,
    "",
    `Total: ${sectionTopicCount} problems / concepts`,
    ""
  );

  for (const [subcategoryIndex, subcategory] of sectionSubcategories.entries()) {
    const subcategoryTopics = topics.filter(
      (topic) => topic.subcategory_id === subcategory.id
    );

    lines.push(
      `### ${sectionIndex + 1}.${subcategoryIndex + 1}. ${subcategory.name}`,
      ""
    );

    for (const [topicIndex, topic] of subcategoryTopics.entries()) {
      const meta = [];
      if (topic.difficulty) meta.push(topic.difficulty);
      if (topic.article) meta.push(`[Notes](${topic.article})`);
      if (topic.youtube) meta.push(`[Video](${topic.youtube})`);
      if (topic.leetcode) meta.push(`[LeetCode](${topic.leetcode})`);
      if (topic.link) meta.push(`[Practice](${topic.link})`);

      lines.push(
        `${topicIndex + 1}. ${topic.name}${meta.length ? ` - ${meta.join(" | ")}` : ""}`
      );
    }

    lines.push("");
  }
}

writeFileSync("STRIVER_A2Z_SHEET.md", `${lines.join("\n").trim()}\n`);
console.log(`Wrote STRIVER_A2Z_SHEET.md with ${topics.length} topics.`);

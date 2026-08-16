import { config } from "../config.js";
import { createDb } from "./index.js";
import { loadCurriculum } from "../curriculum/index.js";
import { MISCONCEPTION_CODES } from "../curriculum/misconceptions.js";

/**
 * One-shot setup/smoke check: applies migrations and validates the curriculum.
 * Run with `npm run seed`. Prints a summary; stores nothing (the 8-item
 * curriculum is loaded in memory at runtime, not into SQLite).
 */
function main() {
  const db = createDb(config.DB_PATH);
  const tables = db
    .prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
    )
    .all() as { name: string }[];

  const curriculum = loadCurriculum();

  console.log(`DB ready at ${config.DB_PATH}`);
  console.log(`  tables: ${tables.map((t) => t.name).join(", ")}`);
  console.log(`Curriculum: ${curriculum.length} items`);
  console.log(`  ids: ${curriculum.map((c) => c.id).join(", ")}`);
  console.log(`Misconception vocabulary: ${MISCONCEPTION_CODES.length} codes`);
  db.close();
}

main();

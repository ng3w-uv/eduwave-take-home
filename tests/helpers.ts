import { Curriculum } from "../src/curriculum/index.js";
import { createDb, type DB } from "../src/db/index.js";
import { Repositories } from "../src/db/repositories.js";
import { FakeProvider } from "../src/llm/fake.js";
import type { AppDeps } from "../src/deps.js";

const curriculum = Curriculum.load();

export const validModelOutput = {
  tutorMessage: "Let's think about the denominators first.",
  misconception: "numerator_only_comparison",
  nextQuestion: "What number could both 5 and 2 divide into?",
  confidence: 0.8,
  curriculumCitations: ["fractions.compare.02"],
  safetyFlags: [],
};

/** Builds wired deps backed by an in-memory DB and a fake provider. */
export function makeDeps(
  responses: Array<unknown | Error> = [validModelOutput],
): { db: DB; repos: Repositories; provider: FakeProvider; deps: AppDeps } {
  const db = createDb(":memory:");
  const repos = new Repositories(db);
  const provider = new FakeProvider({ responses });
  return { db, repos, provider, deps: { repos, curriculum, provider } };
}

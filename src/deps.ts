import { Curriculum } from "./curriculum/index.js";
import { createDb } from "./db/index.js";
import { Repositories } from "./db/repositories.js";
import { createProvider } from "./llm/index.js";
import type { TutorDeps } from "./tutor/pipeline.js";

/** Everything the HTTP layer needs. Same shape the pipeline consumes, so routes
 * just forward it. Injected into createApp() so tests can supply a fake provider
 * and an in-memory database. */
export type AppDeps = TutorDeps;

/** Builds the real, wired dependencies for running the server. */
export function createAppDeps(): AppDeps {
  return {
    repos: new Repositories(createDb()),
    curriculum: Curriculum.load(),
    provider: createProvider(),
  };
}

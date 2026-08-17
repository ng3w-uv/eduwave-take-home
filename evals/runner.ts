import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Curriculum } from "../src/curriculum/index.js";
import { createDb } from "../src/db/index.js";
import { Repositories } from "../src/db/repositories.js";
import { FakeProvider } from "../src/llm/fake.js";
import { LlmError } from "../src/llm/types.js";
import { runTutorTurn, type TutorTurn } from "../src/tutor/pipeline.js";
import { TutorResponseSchema } from "../src/tutor/contract.js";

/** How each turn's fake model behaves: a valid/malformed object, or a thrown error. */
type TurnModel =
  | { kind: "valid" | "malformed"; raw: unknown }
  | { kind: "error"; code: string };

interface Turn {
  message: string;
  model?: TurnModel;
}

export interface EvalExpect {
  blocked?: boolean;
  fallback?: boolean;
  revealAllowed?: boolean;
  retrievedNonEmpty?: boolean;
  retrievedIncludes?: string[];
  retrievalQueryMatches?: string;
  citationsSubsetOfRetrieved?: boolean;
  citationsEqual?: string[];
  misconception?: string;
  safetyFlagsInclude?: string[];
  tutorMessageNotContains?: string[];
  errorCode?: string;
  providerCalls?: number;
  confidenceAtMost?: number;
}

export interface EvalCase {
  id: string;
  description: string;
  turns: Turn[];
  expect: EvalExpect;
}

const curriculum = Curriculum.load();

export function loadCases(): EvalCase[] {
  const path = fileURLToPath(new URL("./cases.json", import.meta.url));
  return JSON.parse(readFileSync(path, "utf8")) as EvalCase[];
}

const PLACEHOLDER_VALID = {
  tutorMessage: "placeholder",
  misconception: "none",
  nextQuestion: "placeholder?",
  confidence: 0.5,
  curriculumCitations: [],
  safetyFlags: [],
};

/** Runs a case's turns through the real pipeline with a scripted fake provider,
 * returning the last turn's outcome plus how many times the model was called. */
export async function runCase(
  c: EvalCase,
): Promise<{ outcome: TutorTurn; providerCalls: number }> {
  const repos = new Repositories(createDb(":memory:"));
  const session = repos.createSession();

  const responses: Array<unknown | Error> = c.turns
    .filter((t) => t.model)
    .map((t) => {
      const m = t.model!;
      return m.kind === "error"
        ? new LlmError(m.code as never, "eval-injected failure")
        : m.raw;
    });
  const provider = new FakeProvider({
    responses: responses.length ? responses : [PLACEHOLDER_VALID],
  });

  let outcome!: TutorTurn;
  for (const turn of c.turns) {
    outcome = await runTutorTurn(
      { repos, curriculum, provider },
      { sessionId: session.id, message: turn.message },
    );
  }
  return { outcome, providerCalls: provider.calls };
}

/** Judges an outcome against a case's structural expectations. Returns the list
 * of failed predicates (empty = pass). Deterministic, rule-based — no LLM judge. */
export function judge(
  c: EvalCase,
  outcome: TutorTurn,
  providerCalls: number,
): string[] {
  const { response, meta } = outcome;
  const e = c.expect;
  const fails: string[] = [];

  // Every path must return a schema-valid response.
  if (!TutorResponseSchema.safeParse(response).success) {
    fails.push("response is not schema-valid");
  }

  const eq = (a: unknown, b: unknown, label: string) => {
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      fails.push(`${label}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
    }
  };

  if (e.blocked !== undefined) eq(meta.blocked, e.blocked, "blocked");
  if (e.fallback !== undefined) eq(meta.fallback, e.fallback, "fallback");
  if (e.revealAllowed !== undefined)
    eq(meta.revealAllowed, e.revealAllowed, "revealAllowed");
  if (e.misconception !== undefined)
    eq(response.misconception, e.misconception, "misconception");
  if (e.errorCode !== undefined) eq(meta.error, e.errorCode, "errorCode");
  if (e.providerCalls !== undefined)
    eq(providerCalls, e.providerCalls, "providerCalls");
  if (e.citationsEqual !== undefined)
    eq(response.curriculumCitations, e.citationsEqual, "citationsEqual");

  if (e.retrievedNonEmpty && meta.retrievedIds.length === 0)
    fails.push("retrievedNonEmpty: retrievedIds was empty");

  for (const id of e.retrievedIncludes ?? []) {
    if (!meta.retrievedIds.includes(id))
      fails.push(`retrievedIncludes: missing ${id}`);
  }

  if (e.retrievalQueryMatches) {
    const re = new RegExp(e.retrievalQueryMatches, "i");
    if (!re.test(meta.retrievalQuery))
      fails.push(`retrievalQueryMatches: /${e.retrievalQueryMatches}/i vs "${meta.retrievalQuery}"`);
  }

  if (e.citationsSubsetOfRetrieved) {
    const allowed = new Set(meta.retrievedIds);
    const stray = response.curriculumCitations.filter((id) => !allowed.has(id));
    if (stray.length > 0)
      fails.push(`citationsSubsetOfRetrieved: stray ${JSON.stringify(stray)}`);
  }

  for (const flag of e.safetyFlagsInclude ?? []) {
    if (!response.safetyFlags.includes(flag as never))
      fails.push(`safetyFlagsInclude: missing ${flag}`);
  }

  for (const bad of e.tutorMessageNotContains ?? []) {
    if (response.tutorMessage.toLowerCase().includes(bad.toLowerCase()))
      fails.push(`tutorMessageNotContains: leaked "${bad}"`);
  }

  if (e.confidenceAtMost !== undefined && response.confidence > e.confidenceAtMost)
    fails.push(`confidenceAtMost: ${response.confidence} > ${e.confidenceAtMost}`);

  return fails;
}

import { describe, expect, it } from "vitest";
import { OllamaProvider } from "../src/llm/ollama.js";
import { generateStructured } from "../src/llm/structured.js";
import {
  TutorResponseSchema,
  tutorResponseJsonSchema,
} from "../src/tutor/contract.js";

/**
 * Live integration check against a running Ollama + llama3.1:8b. Skipped by
 * default (non-deterministic, not for CI). Run with:
 *   RUN_OLLAMA_SMOKE=1 npm test
 */
const RUN = process.env.RUN_OLLAMA_SMOKE === "1";

describe.skipIf(!RUN)("OllamaProvider live smoke", () => {
  it(
    "returns schema-valid JSON via format-constrained decoding",
    async () => {
      const provider = new OllamaProvider();
      const res = await generateStructured(
        provider,
        [
          {
            role: "system",
            content:
              "You are Wavy, a Grade 5 fractions tutor. Reply ONLY with the JSON object required by the schema. misconception must be one of the allowed values or 'none'.",
          },
          { role: "user", content: "Is 2/5 bigger than 1/2?" },
        ],
        TutorResponseSchema,
        tutorResponseJsonSchema,
      );
      expect(res.ok).toBe(true);
    },
    60_000,
  );
});

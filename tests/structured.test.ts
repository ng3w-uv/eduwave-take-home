import { describe, expect, it } from "vitest";
import { FakeProvider } from "../src/llm/fake.js";
import { LlmError } from "../src/llm/types.js";
import { generateStructured } from "../src/llm/structured.js";
import {
  TutorResponseSchema,
  tutorResponseJsonSchema,
} from "../src/tutor/contract.js";

const valid = {
  tutorMessage: "Let's think about the denominators.",
  misconception: "numerator_only_comparison",
  nextQuestion: "What could both 3 and 4 share?",
  confidence: 0.8,
  curriculumCitations: ["fractions.compare.02"],
  safetyFlags: [],
};

const malformed = { tutorMessage: "", confidence: 5 }; // fails validation

async function run(provider: FakeProvider) {
  return generateStructured(
    provider,
    [{ role: "user", content: "compare 2/3 and 3/4" }],
    TutorResponseSchema,
    tutorResponseJsonSchema,
  );
}

describe("generateStructured (validate -> repair -> fail)", () => {
  it("returns validated data on a good first response", async () => {
    const provider = new FakeProvider({ responses: [valid] });
    const res = await run(provider);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.repaired).toBe(false);
      expect(res.data.misconception).toBe("numerator_only_comparison");
    }
    expect(provider.calls).toBe(1);
  });

  it("repairs one malformed response, then succeeds", async () => {
    const provider = new FakeProvider({ responses: [malformed, valid] });
    const res = await run(provider);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.repaired).toBe(true);
    expect(provider.calls).toBe(2); // original + one repair
  });

  it("gives up with ok:false after the repair budget is exhausted", async () => {
    const provider = new FakeProvider({ responses: [malformed] });
    const res = await run(provider);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe("invalid_output");
      expect(res.issues.length).toBeGreaterThan(0);
    }
    expect(provider.calls).toBe(2); // original + one repair, both bad
  });

  it("accumulates token usage across attempts", async () => {
    const provider = new FakeProvider({
      responses: [malformed, valid],
      usage: { tokensIn: 100, tokensOut: 20 },
    });
    const res = await run(provider);
    expect(res.usage.tokensIn).toBe(200);
    expect(res.usage.tokensOut).toBe(40);
  });

  it("propagates provider errors (timeout/unreachable) to the caller", async () => {
    const provider = new FakeProvider({
      responses: [new LlmError("timeout", "boom")],
    });
    await expect(run(provider)).rejects.toBeInstanceOf(LlmError);
  });
});

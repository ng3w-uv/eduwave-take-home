import { describe, expect, it } from "vitest";
import {
  TutorResponseSchema,
  tutorResponseJsonSchema,
} from "../src/tutor/contract.js";

const valid = {
  tutorMessage: "Let's compare the fractions using a common denominator.",
  misconception: "numerator_only_comparison",
  nextQuestion: "What denominator could both 3 and 4 share?",
  confidence: 0.84,
  curriculumCitations: ["fractions.compare.02"],
  safetyFlags: [],
};

describe("TutorResponseSchema", () => {
  it("accepts a well-formed response (the brief's example shape)", () => {
    expect(TutorResponseSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a missing required field", () => {
    const { nextQuestion, ...rest } = valid;
    void nextQuestion;
    expect(TutorResponseSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects an unknown misconception value (not in the enum)", () => {
    expect(
      TutorResponseSchema.safeParse({ ...valid, misconception: "made_up" })
        .success,
    ).toBe(false);
  });

  it("rejects confidence outside [0,1]", () => {
    expect(
      TutorResponseSchema.safeParse({ ...valid, confidence: 1.5 }).success,
    ).toBe(false);
  });

  it("rejects an unknown safety flag", () => {
    expect(
      TutorResponseSchema.safeParse({ ...valid, safetyFlags: ["nuke"] }).success,
    ).toBe(false);
  });

  it("produces an inline JSON Schema with all required fields", () => {
    const props = (tutorResponseJsonSchema as { properties?: object }).properties;
    expect(props).toBeDefined();
    expect(Object.keys(props!)).toEqual(
      expect.arrayContaining([
        "tutorMessage",
        "misconception",
        "nextQuestion",
        "confidence",
        "curriculumCitations",
        "safetyFlags",
      ]),
    );
  });
});

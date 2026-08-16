import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { MISCONCEPTION_CODES } from "../curriculum/misconceptions.js";

/** Machine-checkable safety signals the tutor may raise. */
export const SAFETY_FLAGS = [
  "profanity",
  "prompt_injection",
  "off_topic",
  "age_inappropriate",
] as const;
export type SafetyFlag = (typeof SAFETY_FLAGS)[number];

/**
 * The required response contract (brief section 3). Zod is the single source of
 * truth — we validate every model output against it and never trust the model.
 * Extra fields from the model are dropped (allowed by the brief); required
 * fields can never be removed.
 *
 * `nextQuestion` stays required even when a worked answer is given, to reinforce
 * the Socratic habit of always leaving the learner a next step.
 */
export const TutorResponseSchema = z.object({
  tutorMessage: z.string().min(1),
  misconception: z.enum(MISCONCEPTION_CODES),
  nextQuestion: z.string().min(1),
  confidence: z.number().min(0).max(1),
  curriculumCitations: z.array(z.string()),
  safetyFlags: z.array(z.enum(SAFETY_FLAGS)),
});

export type TutorResponse = z.infer<typeof TutorResponseSchema>;

/** JSON Schema derived from the Zod schema — passed to the provider to constrain
 * generation (Ollama `format`, Anthropic tool `input_schema`). Kept inline (no
 * $ref) so every provider accepts it. */
export const tutorResponseJsonSchema = zodToJsonSchema(TutorResponseSchema, {
  $refStrategy: "none",
}) as Record<string, unknown>;

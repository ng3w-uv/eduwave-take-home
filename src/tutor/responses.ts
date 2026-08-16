import type { SafetyFlag, TutorResponse } from "./contract.js";

/** Canned response when input safety pre-checks short-circuit the model. Never
 * echoes the offending content, never reveals instructions. */
export function safetyRedirect(flags: SafetyFlag[]): TutorResponse {
  return {
    tutorMessage:
      "Let's keep our conversation about fractions, and keep it kind and safe. I can't help with that — but I'd love to help you with a fractions question!",
    misconception: "none",
    nextQuestion: "What fractions topic would you like to work on next?",
    confidence: 0,
    curriculumCitations: [],
    safetyFlags: flags,
  };
}

/** Safe fallback when the provider fails or its output can't be validated even
 * after a repair. Stays in Socratic character; claims nothing it can't ground. */
export function fallbackResponse(flags: SafetyFlag[]): TutorResponse {
  return {
    tutorMessage:
      "Hmm, I'm having trouble working that out right now. Let's slow down and take it one small step at a time.",
    misconception: "none",
    nextQuestion:
      "Can you tell me what you've tried so far, or which part feels tricky?",
    confidence: 0,
    curriculumCitations: [],
    safetyFlags: flags,
  };
}

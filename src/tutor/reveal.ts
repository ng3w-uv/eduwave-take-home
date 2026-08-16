import type { Message } from "../db/repositories.js";

/**
 * Socratic reveal gate. The answer is withheld unless either:
 *  - the learner explicitly asks for it AND has already had guided support, or
 *  - the learner has made a reasonable attempt (>= 2 prior turns of back-and-forth).
 *
 * This is the code half of the hybrid design; the prompt half honours the
 * resulting `revealAllowed` flag.
 */

const EXPLICIT_REQUEST =
  /(just )?tell me the answer|give me the answer|what('?s| is) the answer|show me the answer|i give up|stop asking( me)?( questions)?|just answer/i;

export interface RevealVerdict {
  revealAllowed: boolean;
  explicit: boolean;
  priorUserTurns: number;
}

export function computeReveal(
  priorMessages: Message[],
  currentMessage: string,
): RevealVerdict {
  const priorUserTurns = priorMessages.filter((m) => m.role === "user").length;
  const hadGuidance = priorMessages.some((m) => m.role === "assistant");
  const explicit = EXPLICIT_REQUEST.test(currentMessage);
  const revealAllowed = (explicit && hadGuidance) || priorUserTurns >= 2;
  return { revealAllowed, explicit, priorUserTurns };
}

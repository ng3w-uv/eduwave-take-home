import type { SafetyFlag } from "./contract.js";

/**
 * Layer 1 of the safety design: cheap input pre-checks that catch *obvious*
 * violations before the model is ever called. Subtler cases are handled by the
 * hardened system prompt (delimited data) and output validation downstream.
 */

const PROFANITY: RegExp[] = [
  /\bf+u+c+k/i,
  /\bsh[i1]t\b/i,
  /\bass?hole\b/i,
  /\bb[i1]tch\b/i,
  /\bcrap\b/i,
];

const INJECTION: RegExp[] = [
  /ignore (all |your |the |previous |prior )*(instructions|rules|prompt)/i,
  /disregard (all |your |the |previous )*(instructions|rules|prompt)/i,
  /forget (all |your |the |previous )*(instructions|rules|prompt)/i,
  /reveal (your |the )*(system )?(prompt|instructions)/i,
  /(show|print|repeat) (me )?(your |the )*(system )?(prompt|instructions)/i,
  /system prompt/i,
  /you are now\b/i,
  /pretend (to be|you are|that)/i,
  /developer mode/i,
  /jailbreak/i,
];

const AGE_INAPPROPRIATE: RegExp[] = [
  /\bsex\b/i,
  /\bsexual/i,
  /\bporn/i,
  /\bkill\b/i,
  /\bsuicide\b/i,
  /\bself[-\s]?harm\b/i,
  /\bdrugs?\b/i,
  /\bweapons?\b/i,
];

export interface SafetyVerdict {
  flags: SafetyFlag[];
  /** True → short-circuit with a canned redirect; the model is not called. */
  block: boolean;
}

export function precheckSafety(message: string): SafetyVerdict {
  const flags: SafetyFlag[] = [];
  if (PROFANITY.some((r) => r.test(message))) flags.push("profanity");
  if (INJECTION.some((r) => r.test(message))) flags.push("prompt_injection");
  if (AGE_INAPPROPRIATE.some((r) => r.test(message)))
    flags.push("age_inappropriate");
  return { flags, block: flags.length > 0 };
}

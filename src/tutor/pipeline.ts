import type { Curriculum } from "../curriculum/index.js";
import type { Message, Repositories } from "../db/repositories.js";
import { generateStructured } from "../llm/structured.js";
import { LlmError, type LLMProvider, type Usage } from "../llm/types.js";
import { estimateCostUsd } from "../observability/cost.js";
import { retrieve } from "../retrieval/index.js";
import {
  TutorResponseSchema,
  tutorResponseJsonSchema,
  type SafetyFlag,
  type TutorResponse,
} from "./contract.js";
import { buildFractionFactsForTurn } from "./fractions.js";
import { buildPrompt } from "./prompt.js";
import { computeReveal } from "./reveal.js";
import { fallbackResponse, safetyRedirect } from "./responses.js";
import { precheckSafety } from "./safety.js";

export interface TutorDeps {
  repos: Repositories;
  curriculum: Curriculum;
  provider: LLMProvider;
  /** Number of prior messages sent to the model each turn. */
  memoryWindow?: number;
}

export interface TutorTurnInput {
  sessionId: string;
  message: string;
}

export interface TutorMeta {
  provider: string;
  model: string;
  retrievedIds: string[];
  retrievalQuery: string;
  revealAllowed: boolean;
  repaired: boolean;
  fallback: boolean;
  blocked: boolean;
  latencyMs: number;
  usage: Usage;
  estCostUsd: number;
  safetyFlags: SafetyFlag[];
  error?: string;
}

export interface TutorTurn {
  response: TutorResponse;
  meta: TutorMeta;
}

const DEFAULT_WINDOW = 8;
const NO_USAGE: Usage = { tokensIn: 0, tokensOut: 0 };

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

function lastUserContent(messages: Message[]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]!.role === "user") return messages[i]!.content;
  }
  return undefined;
}

function uniqueFlags(flags: SafetyFlag[]): SafetyFlag[] {
  return [...new Set(flags)];
}

/**
 * Enforces grounding and clamps model-supplied fields. Citations are filtered to
 * the set actually retrieved (the model cannot introduce sources); if every
 * proposed citation was invented, confidence is pulled down.
 */
function finalize(
  data: TutorResponse,
  retrievedIds: string[],
  preFlags: SafetyFlag[],
): TutorResponse {
  const allowed = new Set(retrievedIds);
  const hadCitations = data.curriculumCitations.length > 0;
  const citations = data.curriculumCitations.filter((id) => allowed.has(id));
  const strippedEverything = hadCitations && citations.length === 0;
  const confidence = clamp01(
    strippedEverything ? Math.min(data.confidence, 0.3) : data.confidence,
  );
  return {
    ...data,
    curriculumCitations: citations,
    confidence,
    safetyFlags: uniqueFlags([...preFlags, ...data.safetyFlags]),
  };
}

/**
 * Runs one tutoring turn end to end: persist input, safety pre-check, retrieval
 * (with prior-topic reuse on low-signal follow-ups), reveal gate, prompt build,
 * structured generation with repair/fallback, citation enforcement, and
 * persistence + observability logging. Every path returns a valid TutorResponse.
 */
export async function runTutorTurn(
  deps: TutorDeps,
  input: TutorTurnInput,
): Promise<TutorTurn> {
  const { repos, curriculum, provider } = deps;
  const window = deps.memoryWindow ?? DEFAULT_WINDOW;
  const start = Date.now();

  const userMsg = repos.insertMessage({
    sessionId: input.sessionId,
    role: "user",
    content: input.message,
  });
  const recent = repos.getRecentMessages(input.sessionId, window + 1);
  const priorMessages = recent.filter((m) => m.id !== userMsg.id);

  // Persist the assistant turn + a request log, then assemble the result.
  const finish = (args: {
    response: TutorResponse;
    retrievedIds: string[];
    retrievalQuery: string;
    revealAllowed: boolean;
    repaired: boolean;
    fallback: boolean;
    blocked: boolean;
    usage: Usage;
    safetyFlags: SafetyFlag[];
    error?: string;
  }): TutorTurn => {
    const latencyMs = Date.now() - start;
    const estCostUsd = estimateCostUsd(provider.model, args.usage);
    // Persist what the learner actually saw — the message AND the follow-up
    // question — so replayed history stays coherent and the tutor doesn't
    // re-ask a question the learner already answered.
    const transcript = args.response.nextQuestion
      ? `${args.response.tutorMessage}\n\n${args.response.nextQuestion}`
      : args.response.tutorMessage;
    const assistantMsg = repos.insertMessage({
      sessionId: input.sessionId,
      role: "assistant",
      content: transcript,
      tutorJson: args.response,
    });
    repos.insertRequestLog({
      sessionId: input.sessionId,
      messageId: assistantMsg.id,
      provider: provider.name,
      model: provider.model,
      latencyMs,
      tokensIn: args.usage.tokensIn,
      tokensOut: args.usage.tokensOut,
      estCost: estCostUsd,
      retrievedIds: args.retrievedIds,
      safetyFlags: args.safetyFlags,
      error: args.error ?? null,
    });
    return {
      response: args.response,
      meta: {
        provider: provider.name,
        model: provider.model,
        retrievedIds: args.retrievedIds,
        retrievalQuery: args.retrievalQuery,
        revealAllowed: args.revealAllowed,
        repaired: args.repaired,
        fallback: args.fallback,
        blocked: args.blocked,
        latencyMs,
        usage: args.usage,
        estCostUsd,
        safetyFlags: args.safetyFlags,
        error: args.error,
      },
    };
  };

  // 1. Safety pre-check — short-circuit obvious violations; model never sees them.
  const safety = precheckSafety(input.message);
  if (safety.block) {
    return finish({
      response: safetyRedirect(safety.flags),
      retrievedIds: [],
      retrievalQuery: input.message,
      revealAllowed: false,
      repaired: false,
      fallback: false,
      blocked: true,
      usage: NO_USAGE,
      safetyFlags: safety.flags,
    });
  }

  // 2. Retrieval, reusing the prior topic on a low-signal follow-up.
  let retrieval = retrieve(curriculum, input.message);
  let retrievalQuery = input.message;
  if (retrieval.lowSignal) {
    const priorTopic = lastUserContent(priorMessages);
    if (priorTopic) {
      retrieval = retrieve(curriculum, priorTopic);
      retrievalQuery = priorTopic;
    }
  }
  const retrievedIds = retrieval.results.map((r) => r.id);

  // 3. Reveal gate.
  const reveal = computeReveal(priorMessages, input.message);

  // 4. Prompt — with deterministically computed fraction facts so the model
  // never has to (mis)do the arithmetic itself.
  const mathNotes = buildFractionFactsForTurn(
    input.message,
    [...priorMessages].reverse().map((m) => m.content),
  );
  const messages = buildPrompt({
    priorMessages,
    retrieval,
    currentMessage: input.message,
    revealAllowed: reveal.revealAllowed,
    mathNotes,
  });

  // 5. Structured generation (validate -> repair -> fallback).
  let structured;
  try {
    structured = await generateStructured(
      provider,
      messages,
      TutorResponseSchema,
      tutorResponseJsonSchema,
    );
  } catch (err) {
    const code = err instanceof LlmError ? err.code : "provider_error";
    return finish({
      response: fallbackResponse(safety.flags),
      retrievedIds,
      retrievalQuery,
      revealAllowed: reveal.revealAllowed,
      repaired: false,
      fallback: true,
      blocked: false,
      usage: NO_USAGE,
      safetyFlags: safety.flags,
      error: code,
    });
  }

  if (!structured.ok) {
    return finish({
      response: fallbackResponse(safety.flags),
      retrievedIds,
      retrievalQuery,
      revealAllowed: reveal.revealAllowed,
      repaired: false,
      fallback: true,
      blocked: false,
      usage: structured.usage,
      safetyFlags: safety.flags,
      error: "invalid_output",
    });
  }

  // 6. Enforce grounding + finalize.
  const response = finalize(structured.data, retrievedIds, safety.flags);
  return finish({
    response,
    retrievedIds,
    retrievalQuery,
    revealAllowed: reveal.revealAllowed,
    repaired: structured.repaired,
    fallback: false,
    blocked: false,
    usage: structured.usage,
    safetyFlags: response.safetyFlags,
  });
}

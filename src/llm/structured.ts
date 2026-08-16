import type { z } from "zod";
import type { LLMProvider, LlmMessage, Usage } from "./types.js";

export interface StructuredSuccess<T> {
  ok: true;
  data: T;
  usage: Usage;
  /** True if the first output failed validation and a repair round succeeded. */
  repaired: boolean;
}

export interface StructuredFailure {
  ok: false;
  reason: "invalid_output";
  issues: string[];
  usage: Usage;
}

export type StructuredResult<T> = StructuredSuccess<T> | StructuredFailure;

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Calls the provider, validates the output against the Zod schema, and — on
 * failure — performs up to `maxRepairs` (default 1) re-asks with the validator
 * error fed back. Never trusts the model: a still-invalid result returns
 * `{ ok: false }` so the caller can emit a safe fallback. Provider-layer errors
 * (timeout, unreachable) are thrown for the caller to map to a controlled error.
 */
export async function generateStructured<T>(
  provider: LLMProvider,
  messages: LlmMessage[],
  schema: z.ZodType<T>,
  jsonSchema: Record<string, unknown>,
  opts: { maxRepairs?: number; signal?: AbortSignal } = {},
): Promise<StructuredResult<T>> {
  const maxRepairs = opts.maxRepairs ?? 1;
  const usage: Usage = { tokensIn: 0, tokensOut: 0 };
  let convo = messages;
  let issues: string[] = [];

  for (let attempt = 0; attempt <= maxRepairs; attempt++) {
    const result = await provider.generate({
      messages: convo,
      jsonSchema,
      signal: opts.signal,
    });
    usage.tokensIn += result.usage.tokensIn;
    usage.tokensOut += result.usage.tokensOut;

    const parsed = schema.safeParse(result.raw);
    if (parsed.success) {
      return { ok: true, data: parsed.data, usage, repaired: attempt > 0 };
    }

    issues = parsed.error.issues.map(
      (i) => `${i.path.join(".") || "(root)"}: ${i.message}`,
    );
    convo = [
      ...messages,
      { role: "assistant", content: safeStringify(result.raw) },
      {
        role: "user",
        content:
          `Your previous response failed validation: ${issues.join("; ")}. ` +
          `Reply again with corrected JSON that matches the required schema exactly.`,
      },
    ];
  }

  return { ok: false, reason: "invalid_output", issues, usage };
}

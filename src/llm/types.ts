/** Provider-agnostic LLM interface. This is the primary test seam: the pipeline
 * depends only on `LLMProvider`, so tests inject a fake that returns canned,
 * malformed, or throwing responses to make the whole flow deterministic. */

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface Usage {
  tokensIn: number;
  tokensOut: number;
}

export interface GenerateParams {
  messages: LlmMessage[];
  /** JSON Schema the output must conform to (constrained decoding / tool schema). */
  jsonSchema: Record<string, unknown>;
  signal?: AbortSignal;
}

export interface GenerateResult {
  /** Parsed object the model produced (not yet validated against our Zod schema). */
  raw: unknown;
  usage: Usage;
  model: string;
}

export interface LLMProvider {
  readonly name: string;
  readonly model: string;
  generate(params: GenerateParams): Promise<GenerateResult>;
}

/** Typed provider-layer failure. `code` maps to the API error contract so the
 * pipeline can return a controlled response instead of a stack trace. */
export class LlmError extends Error {
  constructor(
    public readonly code:
      | "timeout"
      | "provider_unreachable"
      | "provider_http_error"
      | "invalid_json"
      | "no_output",
    message: string,
  ) {
    super(message);
    this.name = "LlmError";
  }
}

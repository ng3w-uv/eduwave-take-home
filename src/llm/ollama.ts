import { config } from "../config.js";
import {
  LlmError,
  type GenerateParams,
  type GenerateResult,
  type LLMProvider,
} from "./types.js";

interface OllamaChatResponse {
  message?: { content?: string };
  prompt_eval_count?: number;
  eval_count?: number;
}

/**
 * Local model via Ollama. Uses JSON-schema-constrained decoding (`format`)
 * rather than tool-calling — far more reliable on an 8B local model. Enforces
 * a hard timeout with AbortController so a hung model becomes a controlled error.
 */
export class OllamaProvider implements LLMProvider {
  readonly name = "ollama";

  constructor(
    readonly model: string = config.OLLAMA_MODEL,
    private readonly host: string = config.OLLAMA_HOST,
    private readonly timeoutMs: number = config.LLM_TIMEOUT_MS,
  ) {}

  async generate({
    messages,
    jsonSchema,
    signal,
  }: GenerateParams): Promise<GenerateResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    if (signal) signal.addEventListener("abort", () => controller.abort());

    try {
      const res = await fetch(`${this.host}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          messages,
          stream: false,
          format: jsonSchema,
          options: { temperature: 0.3 },
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new LlmError(
          "provider_http_error",
          `Ollama responded ${res.status}`,
        );
      }

      const data = (await res.json()) as OllamaChatResponse;
      const content = data.message?.content ?? "";
      let raw: unknown;
      try {
        raw = JSON.parse(content);
      } catch {
        throw new LlmError(
          "invalid_json",
          "Ollama did not return parseable JSON",
        );
      }

      return {
        raw,
        usage: {
          tokensIn: data.prompt_eval_count ?? 0,
          tokensOut: data.eval_count ?? 0,
        },
        model: this.model,
      };
    } catch (err) {
      if (controller.signal.aborted) {
        throw new LlmError(
          "timeout",
          `Ollama call exceeded ${this.timeoutMs}ms`,
        );
      }
      if (err instanceof LlmError) throw err;
      throw new LlmError(
        "provider_unreachable",
        `Could not reach Ollama at ${this.host}: ${(err as Error).message}`,
      );
    } finally {
      clearTimeout(timer);
    }
  }
}

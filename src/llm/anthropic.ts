import { config } from "../config.js";
import {
  LlmError,
  type GenerateParams,
  type GenerateResult,
  type LLMProvider,
} from "./types.js";

interface AnthropicResponse {
  content?: Array<{ type: string; input?: unknown }>;
  usage?: { input_tokens?: number; output_tokens?: number };
}

/**
 * Swappable quality fallback (brief allows any provider). Uses forced tool-use
 * for structured output — Claude adheres to tool schemas far more reliably than
 * a local model. NOT exercised in CI (no committed key); kept behind the
 * provider factory and documented as a known-untested integration path.
 */
export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";
  private static readonly TOOL_NAME = "emit_tutor_response";

  constructor(
    readonly model: string = config.ANTHROPIC_MODEL,
    private readonly apiKey: string | undefined = config.ANTHROPIC_API_KEY,
    private readonly timeoutMs: number = config.LLM_TIMEOUT_MS,
  ) {}

  async generate({
    messages,
    jsonSchema,
    signal,
  }: GenerateParams): Promise<GenerateResult> {
    if (!this.apiKey) {
      throw new LlmError(
        "provider_unreachable",
        "ANTHROPIC_API_KEY is not configured",
      );
    }

    const system = messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");
    const convo = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role, content: m.content }));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    if (signal) signal.addEventListener("abort", () => controller.abort());

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 1024,
          system,
          messages: convo,
          tools: [
            {
              name: AnthropicProvider.TOOL_NAME,
              description: "Return the tutor response as structured data.",
              input_schema: jsonSchema,
            },
          ],
          tool_choice: { type: "tool", name: AnthropicProvider.TOOL_NAME },
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new LlmError(
          "provider_http_error",
          `Anthropic responded ${res.status}`,
        );
      }

      const data = (await res.json()) as AnthropicResponse;
      const toolUse = data.content?.find((c) => c.type === "tool_use");
      if (!toolUse || toolUse.input === undefined) {
        throw new LlmError("no_output", "Anthropic returned no tool_use block");
      }

      return {
        raw: toolUse.input,
        usage: {
          tokensIn: data.usage?.input_tokens ?? 0,
          tokensOut: data.usage?.output_tokens ?? 0,
        },
        model: this.model,
      };
    } catch (err) {
      if (controller.signal.aborted) {
        throw new LlmError(
          "timeout",
          `Anthropic call exceeded ${this.timeoutMs}ms`,
        );
      }
      if (err instanceof LlmError) throw err;
      throw new LlmError(
        "provider_unreachable",
        `Could not reach Anthropic: ${(err as Error).message}`,
      );
    } finally {
      clearTimeout(timer);
    }
  }
}

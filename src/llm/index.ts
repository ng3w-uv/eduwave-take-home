import { config } from "../config.js";
import { AnthropicProvider } from "./anthropic.js";
import { OllamaProvider } from "./ollama.js";
import type { LLMProvider } from "./types.js";

/** Selects the provider from config. The rest of the app depends only on the
 * `LLMProvider` interface, so swapping providers changes nothing downstream.
 * (Concrete providers and helpers are imported from their own modules directly.) */
export function createProvider(): LLMProvider {
  return config.LLM_PROVIDER === "anthropic"
    ? new AnthropicProvider()
    : new OllamaProvider();
}

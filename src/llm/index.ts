import { config } from "../config.js";
import { AnthropicProvider } from "./anthropic.js";
import { OllamaProvider } from "./ollama.js";
import type { LLMProvider } from "./types.js";

export * from "./types.js";
export { OllamaProvider } from "./ollama.js";
export { AnthropicProvider } from "./anthropic.js";
export { FakeProvider } from "./fake.js";
export { generateStructured } from "./structured.js";
export type {
  StructuredResult,
  StructuredSuccess,
  StructuredFailure,
} from "./structured.js";

/** Selects the provider from config. The rest of the app depends only on the
 * `LLMProvider` interface, so swapping providers changes nothing downstream. */
export function createProvider(): LLMProvider {
  return config.LLM_PROVIDER === "anthropic"
    ? new AnthropicProvider()
    : new OllamaProvider();
}

import type { Usage } from "../llm/types.js";

/**
 * Documented cost calculation. Local models (Ollama) have no marginal API cost,
 * so they resolve to 0. Hosted providers use a per-token rate table below — these
 * are illustrative published-style rates (USD per 1M tokens) and should be
 * confirmed against current pricing; update here in one place.
 */
const RATES_USD_PER_MILLION: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5-20251001": { input: 1.0, output: 5.0 },
};

export function estimateCostUsd(model: string, usage: Usage): number {
  const rate = RATES_USD_PER_MILLION[model];
  if (!rate) return 0; // local / unknown model → no marginal API cost
  return (
    (usage.tokensIn / 1_000_000) * rate.input +
    (usage.tokensOut / 1_000_000) * rate.output
  );
}

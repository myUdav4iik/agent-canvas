/** Per-1M-token pricing (input / output) in USD — updated 2026-06 */
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "anthropic/claude-sonnet-4-6":  { input: 3.0,   output: 15.0 },
  "anthropic/claude-haiku-4-5":   { input: 0.8,   output: 4.0  },
  "anthropic/claude-opus-4-8":    { input: 15.0,  output: 75.0 },
  "openai/gpt-4o":                { input: 5.0,   output: 15.0 },
  "openai/gpt-4o-mini":           { input: 0.15,  output: 0.60 },
  "ollama/*":                     { input: 0.0,   output: 0.0  },
};

export function estimateCostUsd(
  provider: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const key = `${provider}/${model}`;
  const pricing =
    MODEL_PRICING[key] ??
    (provider === "ollama" ? MODEL_PRICING["ollama/*"] : null);
  if (!pricing) return 0;
  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
}

export const DEFAULT_MAX_ITERATIONS = 10;
export const DEFAULT_MAX_LOOP_ITERATIONS = 20;
export const DEFAULT_MAX_DELEGATION_DEPTH = 3;
export const DEFAULT_RUN_TIMEOUT_MS = 10 * 60 * 1000; // 10 min

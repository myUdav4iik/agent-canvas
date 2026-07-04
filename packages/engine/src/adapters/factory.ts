import type { LLMAdapter } from "./base";
import { AnthropicAdapter } from "./anthropic";
import { OpenAIAdapter } from "./openai";
import { OllamaAdapter } from "./ollama";
import { ClaudeCliAdapter } from "./claude-cli";

export type LLMProvider = "anthropic" | "openai" | "ollama" | "claude-cli";

export function createAdapter(provider: LLMProvider | string, model: string): LLMAdapter {
  switch (provider) {
    case "anthropic":
      return new AnthropicAdapter(model);
    case "openai":
      return new OpenAIAdapter(model);
    case "ollama":
      return new OllamaAdapter(model);
    case "claude-cli":
    default:
      return new ClaudeCliAdapter(model);
  }
}

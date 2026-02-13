import type { LLMResponse } from "../types/llm-response.js";

export interface ILLMProvider {
  generate(prompt: string): Promise<LLMResponse>;
  stream(prompt: string): AsyncGenerator<string, void, unknown>;
}

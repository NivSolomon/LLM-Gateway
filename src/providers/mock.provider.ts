import type { ILLMProvider } from "../core/interfaces/illm-provider.js";
import type { LLMResponse } from "../core/types/llm-response.js";

const MOCK_RESPONSE = "This is a mock response for your prompt.";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockProvider implements ILLMProvider {
  async generate(prompt: string): Promise<LLMResponse> {
    return {
      content: MOCK_RESPONSE,
      provider: "mock",
      cost: 0,
      timestamp: new Date(),
    };
  }

  async *stream(_prompt: string): AsyncGenerator<string, void, unknown> {
    const words = MOCK_RESPONSE.split(/\s+/);
    for (const word of words) {
      await delay(100);
      yield word + " ";
    }
  }
}

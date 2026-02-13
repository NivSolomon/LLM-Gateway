import { GoogleGenerativeAI } from "@google/generative-ai";
import type { ILLMProvider } from "../core/interfaces/illm-provider.js";
import type { LLMResponse } from "../core/types/llm-response.js";

const MODEL = "gemini-1.5-flash";

export class GeminiProvider implements ILLMProvider {
  private model: ReturnType<GoogleGenerativeAI["getGenerativeModel"]>;

  constructor(apiKey: string) {
    const genAI = new GoogleGenerativeAI(apiKey);
    this.model = genAI.getGenerativeModel({ model: MODEL });
  }

  async generate(prompt: string): Promise<LLMResponse> {
    const result = await this.model.generateContent(prompt);
    const response = result.response;
    const content = response.text()?.trim() ?? "No response from the model.";

    // Gemini SDK doesn't expose token usage in all flows; use 0 or extend if needed
    const cost = 0;

    return {
      content,
      provider: "gemini",
      cost,
      timestamp: new Date(),
    };
  }

  async *stream(prompt: string): AsyncGenerator<string, void, unknown> {
    const result = await this.model.generateContentStream(prompt);
    for await (const chunk of result.stream) {
      const text = typeof chunk.text === "function" ? chunk.text() : "";
      if (text) {
        yield text;
      }
    }
  }
}

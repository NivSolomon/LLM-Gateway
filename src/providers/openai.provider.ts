import OpenAI from "openai";
import type { ILLMProvider } from "../core/interfaces/illm-provider.js";
import type { LLMResponse } from "../core/types/llm-response.js";

const MODEL = "gpt-4o-mini";
// gpt-4o-mini: input $0.15/1M, output $0.60/1M (approximate)
const INPUT_COST_PER_1M = 0.15;
const OUTPUT_COST_PER_1M = 0.6;

export class OpenAIProvider implements ILLMProvider {
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async generate(prompt: string): Promise<LLMResponse> {
    const completion = await this.client.chat.completions.create({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
    });

    const content =
      completion.choices[0]?.message?.content?.trim() ??
      "No response from the model.";

    const usage = completion.usage;
    const cost = usage
      ? (usage.prompt_tokens * INPUT_COST_PER_1M +
          usage.completion_tokens * OUTPUT_COST_PER_1M) /
        1_000_000
      : 0;

    return {
      content,
      provider: "openai",
      cost,
      timestamp: new Date(),
    };
  }

  async *stream(prompt: string): AsyncGenerator<string, void, unknown> {
    const stream = await this.client.chat.completions.create({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      stream: true,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (typeof delta === "string" && delta.length > 0) {
        yield delta;
      }
    }
  }
}

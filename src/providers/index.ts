import type { ILLMProvider } from "../core/interfaces/illm-provider.js";
import { GeminiProvider } from "./gemini.provider.js";
import { OpenAIProvider } from "./openai.provider.js";

export type ProviderName = "openai" | "gemini";

const providers: Record<ProviderName, (apiKey: string) => ILLMProvider> = {
  openai: (key) => new OpenAIProvider(key),
  gemini: (key) => new GeminiProvider(key),
};

export function getProvider(name: ProviderName): ILLMProvider | null {
  const key =
    name === "openai"
      ? process.env.OPENAI_API_KEY
      : process.env.GEMINI_API_KEY;
  if (!key) return null;
  return providers[name](key);
}

export function isProviderName(value: string): value is ProviderName {
  return value === "openai" || value === "gemini";
}

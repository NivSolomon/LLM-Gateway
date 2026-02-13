export interface LLMResponse {
  content: string;
  provider: string;
  cost: number;
  timestamp: Date;
  /** True when the response was served from cache. */
  cached?: boolean;
}

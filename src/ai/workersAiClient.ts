export const WORKERS_AI_MODELS = {
  candidate: "@cf/qwen/qwen3-30b-a3b-fp8",
  jury: "@cf/mistralai/mistral-small-3.1-24b-instruct",
} as const;

export interface WorkersAiClientOptions {
  accountId: string;
  apiToken: string;
  timeoutMs?: number;
  maxRetries?: number;
  fetchImpl?: typeof fetch;
}

export interface ChatMessage { role: "system" | "user" | "assistant"; content: string }
export interface ChatResult { content: string; usage: Record<string, unknown>; model: string }

export class WorkersAiError extends Error {
  constructor(message: string, readonly status?: number) { super(message); this.name = "WorkersAiError"; }
}

export class WorkersAiClient {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  constructor(private readonly options: WorkersAiClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 20_000;
    this.maxRetries = options.maxRetries ?? 1;
  }

  async chat(model: string, messages: ChatMessage[], extra: Record<string, unknown> = {}): Promise<ChatResult> {
    const url = `https://api.cloudflare.com/client/v4/accounts/${this.options.accountId}/ai/run/${model}`;
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await this.fetchImpl(url, {
          method: "POST",
          headers: { Authorization: `Bearer ${this.options.apiToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ messages, ...extra }),
          signal: controller.signal,
        });
        const payload = await response.json() as Record<string, any>;
        if (!response.ok || payload.success !== true) {
          if (attempt < this.maxRetries && (response.status === 429 || response.status >= 500)) continue;
          throw new WorkersAiError(`Workers AI request failed: ${JSON.stringify(payload.errors ?? [])}`, response.status);
        }
        const result = payload.result ?? {};
        const message = result.choices?.[0]?.message;
        const content = message?.content ?? message?.reasoning_content ?? result.response;
        if (typeof content !== "string" || content.trim().length === 0) {
          throw new WorkersAiError("Workers AI returned no usable content.", response.status);
        }
        return { content: content.trim(), usage: result.usage ?? {}, model };
      } catch (error) {
        if (error instanceof WorkersAiError) throw error;
        if (attempt === this.maxRetries) throw new WorkersAiError(error instanceof Error ? error.message : String(error));
      } finally { clearTimeout(timer); }
    }
    throw new WorkersAiError("Workers AI retry loop exhausted.");
  }
}

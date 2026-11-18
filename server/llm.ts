import type { TutorCredentials } from "./credentials";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatResult {
  content: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  json?: boolean;
}

/**
 * One OpenAI-compatible chat call. Forge Serverless Inference gets reasoning effort turned
 * down so tutor turns stay fast; any other provider gets the plain payload.
 */
export async function chatCompletion(
  creds: TutorCredentials,
  messages: ChatMessage[],
  opts: ChatOptions = {},
): Promise<ChatResult> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${creds.apiKey}`,
    "Content-Type": "application/json",
  };
  if (creds.project) headers["OpenAI-Project"] = creds.project;

  const payload: Record<string, unknown> = {
    model: creds.model,
    temperature: opts.temperature ?? 0.4,
    max_tokens: opts.maxTokens ?? 700,
    messages,
  };
  if (opts.json !== false) payload.response_format = { type: "json_object" };
  if (creds.provider === "forge-inference") {
    // GLM-5.3-Flash on Forge Inference ignores enable_thinking/thinking:disabled and still
    // spends hundreds of reasoning tokens (sometimes the whole max_tokens budget, which
    // comes back as an empty reply). reasoning_effort "low" is the knob it honours: ~5
    // reasoning tokens per turn, measured 2026-11-18.
    payload.reasoning_effort = "low";
    payload.chat_template_kwargs = { enable_thinking: false };
  }

  const upstream = await fetch(`${creds.baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  if (!upstream.ok) {
    const detail = await upstream.text();
    throw new Error(`Upstream inference returned ${upstream.status}: ${detail.slice(0, 240)}`);
  }
  const data = (await upstream.json()) as {
    model?: string;
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  return {
    content: data.choices?.[0]?.message?.content || "",
    model: data.model || creds.model,
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
  };
}

export function parseJsonObject(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : { raw };
  } catch {
    // Some models wrap JSON in a fence; take the first {...} block.
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]) as Record<string, unknown>;
      } catch {
        // fall through
      }
    }
    return { raw };
  }
}

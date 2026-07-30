import { createOpenAI } from "@ai-sdk/openai";
import { extractReasoningMiddleware, wrapLanguageModel } from "ai";
import type { AnvilConfig } from "../config/types.ts";

export function createModel(config: AnvilConfig) {
  const provider = createOpenAI({
    baseURL: config.baseURL,
    apiKey: config.apiKey,
    name: "lmstudio",
  });
  // Use chat completions API — LM Studio's OpenAI-compatible endpoint
  return wrapLanguageModel({
    model: provider.chat(config.model),
    // Reasoning models served over the OpenAI-compatible endpoint emit their
    // chain of thought inline, wrapped in <think>…</think>, rather than as a
    // separate reasoning part. Without this the whole thing arrives as ordinary
    // text: nothing streams as thinking, and the reasoning ends up printed in
    // the transcript as if it were the answer. Models that emit no such tag are
    // passed through untouched.
    middleware: extractReasoningMiddleware({ tagName: "think" }),
  });
}

export async function probeServer(config: AnvilConfig): Promise<{ ok: boolean; detail: string }> {
  try {
    const res = await fetch(`${config.baseURL.replace(/\/$/, "")}/models`, {
      headers: { Authorization: `Bearer ${config.apiKey}` },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return { ok: false, detail: `HTTP ${res.status} from ${config.baseURL}` };
    const data = (await res.json()) as { data?: Array<{ id: string }> };
    const ids = data.data?.map((m) => m.id).join(", ") ?? "(none)";
    return { ok: true, detail: `models: ${ids}` };
  } catch (err) {
    return {
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

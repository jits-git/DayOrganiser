import { AIProvider } from "@/types/settings";

export type { AIProvider };

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export const PROVIDER_MODELS: Record<AIProvider, Array<{ id: string; label: string }>> = {
  claude: [
    { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5 (Fast)" },
    { id: "claude-sonnet-4-6", label: "Sonnet 4.6" },
    { id: "claude-opus-4-8", label: "Opus 4.8" },
  ],
  openai: [
    { id: "gpt-4o-mini", label: "GPT-4o Mini (Fast)" },
    { id: "gpt-4o", label: "GPT-4o" },
    { id: "o3-mini", label: "o3-mini" },
  ],
  gemini: [
    { id: "gemini-2.0-flash", label: "2.0 Flash (Fast)" },
    { id: "gemini-1.5-pro", label: "1.5 Pro" },
    { id: "gemini-2.5-pro", label: "2.5 Pro" },
  ],
};

export const DEFAULT_MODEL: Record<AIProvider, string> = {
  claude: "claude-haiku-4-5-20251001",
  openai: "gpt-4o-mini",
  gemini: "gemini-2.0-flash",
};

export async function callAI(
  provider: AIProvider,
  apiKey: string,
  model: string,
  systemPrompt: string,
  messages: ChatMessage[]
): Promise<string> {
  switch (provider) {
    case "claude":
      return callClaude(apiKey, model, systemPrompt, messages);
    case "openai":
      return callOpenAI(apiKey, model, systemPrompt, messages);
    case "gemini":
      return callGemini(apiKey, model, systemPrompt, messages);
  }
}

async function callClaude(
  apiKey: string,
  model: string,
  systemPrompt: string,
  messages: ChatMessage[]
): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({ model, max_tokens: 1024, system: systemPrompt, messages }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as any;
    throw new Error(err?.error?.message ?? `Claude error ${res.status}`);
  }
  const data = await res.json() as any;
  return data.content[0].text as string;
}

async function callOpenAI(
  apiKey: string,
  model: string,
  systemPrompt: string,
  messages: ChatMessage[]
): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: systemPrompt }, ...messages],
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as any;
    throw new Error(err?.error?.message ?? `OpenAI error ${res.status}`);
  }
  const data = await res.json() as any;
  return data.choices[0].message.content as string;
}

async function callGemini(
  apiKey: string,
  model: string,
  systemPrompt: string,
  messages: ChatMessage[]
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: { maxOutputTokens: 1024 },
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as any;
    throw new Error(err?.error?.message ?? `Gemini error ${res.status}`);
  }
  const data = await res.json() as any;
  return data.candidates[0].content.parts[0].text as string;
}

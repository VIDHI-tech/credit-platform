// lib/studio/llm.ts — LLM wrapper for Eigen Studio. SERVER-ONLY.
// GEMINI_API_KEY is read here; never import this into a client component.
//
// Why Gemini: free tier with 1M context window, native JSON mode (guarantees
// parseable JSON output), no credit card. Get a key at:
//   https://aistudio.google.com/apikey
//
// To swap providers later (OpenRouter, Groq, Anthropic, OpenAI, etc.), only
// callLLM() and the MODEL constants below need to change. The route handler
// and parser stay identical.

export const ARCHITECT_MODEL = 'gemini-2.5-flash'   // 1M context, free tier
export const SCORER_MODEL = 'gemini-2.5-pro'         // Phase 2 — slower/smarter
export const ENHANCE_MODEL = 'gemini-2.5-flash'      // Phase 3

interface LLMCallOpts {
  system: string
  user: string
  model: string
  maxTokens?: number
  /** Force the model to return strict JSON (native Gemini JSON mode). */
  jsonMode?: boolean
}

export async function callLLM({
  system,
  user,
  model,
  maxTokens = 8000,
  jsonMode = false,
}: LLMCallOpts): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY?.trim()
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured. Add it to .env.local and restart. Get a free key at https://aistudio.google.com/apikey',
    )
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: {
          maxOutputTokens: maxTokens,
          temperature: 0.9,
          ...(jsonMode ? { responseMimeType: 'application/json' } : {}),
        },
      }),
    },
  )
  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`Gemini API ${res.status}: ${detail}`)
  }
  const data: {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> }
      finishReason?: string
    }>
  } = await res.json()
  const text =
    data.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? '')
      .join('') ?? ''
  if (!text) {
    const reason = data.candidates?.[0]?.finishReason ?? 'no content'
    throw new Error(`Gemini returned empty response (${reason})`)
  }
  return text
}

/** Strip markdown fences (Gemini's JSON mode rarely emits them, but defensive). */
export function parseLLMJson<T>(raw: string): T {
  let s = raw.trim()
  if (s.startsWith('```')) {
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
  }
  const first = s.indexOf('{')
  const last = s.lastIndexOf('}')
  if (first !== -1 && last !== -1) s = s.slice(first, last + 1)
  try {
    return JSON.parse(s) as T
  } catch {
    throw new Error('LLM returned a response that was not valid JSON.')
  }
}

// lib/studio/llm.ts — LLM wrapper for Eigen Studio. SERVER-ONLY.
// GEMINI_API_KEY is read here; never import this into a client component.
//
// Why Gemini: free tier with 1M context window, native JSON mode (guarantees
// parseable JSON output), no credit card. Get a key at:
//   https://aistudio.google.com/apikey
//
// Reliability: Gemini's free tier sometimes returns 503 ("high demand") or
// 429 (rate-limited) on the primary model. callLLM retries with exponential
// backoff, then falls back to FALLBACK_MODEL ('gemini-2.0-flash' — same free
// quota, less congested) so a transient overload never breaks the route.
//
// To swap providers (OpenRouter, Groq, Anthropic, OpenAI, etc.), only
// callLLM() and the MODEL constants below need to change. The route handler
// and parser stay identical.

export const ARCHITECT_MODEL = 'gemini-2.5-flash'   // 1M context, free tier
export const SCORER_MODEL = 'gemini-2.5-pro'         // Phase 2 — slower/smarter
export const ENHANCE_MODEL = 'gemini-2.5-flash'      // Phase 3
const FALLBACK_MODEL = 'gemini-2.0-flash'            // used on 503/429 of primary

// HTTP statuses worth retrying. 503 = overloaded; 429 = rate-limited;
// 500/502/504 = transient upstream.
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504])
const MAX_ATTEMPTS_PER_MODEL = 3
const BACKOFF_BASE_MS = 800

interface LLMCallOpts {
  system: string
  user: string
  model: string
  maxTokens?: number
  /** Force the model to return strict JSON (native Gemini JSON mode). */
  jsonMode?: boolean
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

async function callOnce(
  apiKey: string,
  opts: Required<Omit<LLMCallOpts, 'jsonMode'>> & { jsonMode: boolean },
): Promise<{ ok: true; text: string } | { ok: false; status: number; detail: string }> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${opts.model}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: opts.system }] },
        contents: [{ role: 'user', parts: [{ text: opts.user }] }],
        generationConfig: {
          maxOutputTokens: opts.maxTokens,
          temperature: 0.9,
          ...(opts.jsonMode ? { responseMimeType: 'application/json' } : {}),
        },
      }),
    },
  )
  if (!res.ok) {
    const detail = await res.text()
    return { ok: false, status: res.status, detail }
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
    return { ok: false, status: 502, detail: `Empty response (${reason})` }
  }
  return { ok: true, text }
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

  // Try the requested model with retry/backoff; if it stays unavailable, try
  // the fallback (only if it's a different model from the one already tried).
  const modelsToTry = model === FALLBACK_MODEL ? [model] : [model, FALLBACK_MODEL]
  let lastErr = 'unknown error'

  for (const m of modelsToTry) {
    for (let attempt = 0; attempt < MAX_ATTEMPTS_PER_MODEL; attempt++) {
      const result = await callOnce(apiKey, {
        system, user, model: m, maxTokens, jsonMode,
      })
      if (result.ok) return result.text

      lastErr = `Gemini API ${result.status} on ${m}: ${result.detail}`

      // Non-retryable: surface immediately (auth errors, bad request, etc.).
      if (!RETRYABLE_STATUSES.has(result.status)) {
        throw new Error(lastErr)
      }

      // Last attempt for this model → break out so we move to the fallback.
      if (attempt === MAX_ATTEMPTS_PER_MODEL - 1) break

      // Exponential backoff with jitter (deterministic seed by attempt so
      // tests stay reproducible — no Math.random).
      const delay = BACKOFF_BASE_MS * 2 ** attempt
      console.warn(
        `[studio] ${m} returned ${result.status}; retrying in ${delay}ms (attempt ${attempt + 2}/${MAX_ATTEMPTS_PER_MODEL})`,
      )
      await sleep(delay)
    }
    if (m !== FALLBACK_MODEL) {
      console.warn(`[studio] ${m} unavailable after retries; falling back to ${FALLBACK_MODEL}`)
    }
  }

  throw new Error(
    `${lastErr}. The model is temporarily overloaded — please try again in a minute.`,
  )
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

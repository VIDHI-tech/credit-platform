// lib/studio/claude.ts — Anthropic Messages API wrapper. SERVER-ONLY.
// ANTHROPIC_API_KEY is read here; never import this into a client component.

export const ARCHITECT_MODEL = 'claude-sonnet-4-6'
export const SCORER_MODEL = 'claude-opus-4-8'
export const ENHANCE_MODEL = 'claude-sonnet-4-6'

interface ClaudeCallOpts {
  system: string
  user: string
  model: string
  maxTokens?: number
}

export async function callClaude({ system, user, model, maxTokens = 4096 }: ClaudeCallOpts): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) {
    // Surface the real cause instead of a downstream "Claude API 401".
    throw new Error(
      'ANTHROPIC_API_KEY is not configured. Add it to .env.local (and your Vercel project env) and restart.',
    )
  }
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  })
  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`Claude API ${res.status}: ${detail}`)
  }
  const data: { content?: Array<{ type: string; text?: string }> } = await res.json()
  return (data.content ?? [])
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text as string)
    .join('\n')
}

/** Strip markdown fences and parse JSON defensively. */
export function parseClaudeJson<T>(raw: string): T {
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
    throw new Error('Claude returned a response that was not valid JSON.')
  }
}

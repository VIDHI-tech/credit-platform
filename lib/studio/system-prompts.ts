// lib/studio/system-prompts.ts — Architect (Phase 1) + Scorer (Phase 2)
// system prompts. Enhancer prompt arrives in Phase 3.

import type { MediaType } from './schema'
import { VIDEO_RUBRIC, IMAGE_RUBRIC } from './rubric'

const VIDEO_SCHEMA_SPEC = `
Return JSON matching this VIDEO schema for each variant's "schema":
{
  "media_type": "video",
  "concept": string,              // one-line premise
  "hook": string,                 // FIRST 3 SECONDS — make it arresting
  "full_script": string,          // beat-by-beat
  "dialogue": [{ "speaker": string, "line": string, "emotion": string, "timing_seconds": number }],
  "tonality": string,
  "pacing": string,               // front-loaded | slow-build | rapid-cut; note cuts/sec
  "narrative_arc": string,        // setup -> tension -> payoff with timestamps
  "silence_beats": [string],      // strategic pauses (timestamp + why)
  "cta": string,
  "loopability": string,          // does the end flow back to the start?
  "subjects": [{ "kind": "avatar|person|element|product", "description": string, "consistency_ref"?: string, "notes"?: string }],
  "scenes": [{ "index": number, "setting": string, "time_of_day": string, "shot_size": "ECU|CU|MCU|MS|MWS|WS|EWS", "lens": string, "camera_movement": string, "camera_height": "low|eye|high|overhead", "composition": string, "action": string, "duration_seconds": number }],
  "transitions": [string],
  "lighting": { "setup": string, "color_temperature": string, "motivation": string, "volumetrics"?: string },
  "color_palette": string,
  "film_emulation"?: string,
  "aspect_ratio": "9:16|16:9|1:1",
  "music": string,
  "sfx": [string],
  "voice"?: string,
  "platform": "tiktok|reels|shorts|youtube|instagram_feed|other",
  "target_audience": string,
  "trend_alignment"?: string,
  "duration_seconds": number,
  "target_model"?: string
}`

const IMAGE_SCHEMA_SPEC = `
Return JSON matching this IMAGE schema for each variant's "schema":
{
  "media_type": "image",
  "concept": string,
  "visual_hook": string,          // the scroll-stopping element
  "scene": string,
  "subjects": [{ "kind": "avatar|person|element|product", "description": string, "consistency_ref"?: string, "notes"?: string }],
  "composition": string,          // eye-flow, focal point, negative space
  "shot_size": string,
  "lens": string,
  "lighting": { "setup": string, "color_temperature": string, "motivation": string, "volumetrics"?: string },
  "color_palette": string,
  "texture_detail": string,
  "style_medium": string,         // photoreal | 3D render | illustration | editorial
  "text_overlay": [{ "copy": string, "placement": string, "style_feel": string }],
  "mood": string,
  "aspect_ratio": "9:16|16:9|1:1|4:5",
  "realism_tokens"?: string,
  "platform": "tiktok|reels|shorts|youtube|instagram_feed|other",
  "target_audience": string,
  "target_model"?: string
}`

export function architectSystemPrompt(mediaType: MediaType): string {
  const spec = mediaType === 'video' ? VIDEO_SCHEMA_SPEC : IMAGE_SCHEMA_SPEC
  return `You are a world-class creative director and prompt engineer for AI ${mediaType} generation (Higgsfield, Kling, Seedance, Veo, Nano Banana, Seedream).

Given a brief, produce exactly 2 DISTINCT variants. Each variant must take a genuinely different creative ANGLE and HOOK — not cosmetic rewrites of the same idea.

Rules:
- Bake all expression, gesture, camera, and lighting direction directly into the structured fields so the output is production-ready.
- Respect platform norms: vertical 9:16 and a front-loaded hook for tiktok/reels/shorts; the first 3 seconds decide everything.
- Be specific and concrete. No vague adjectives where a precise direction is possible.
- Keep continuity within a variant (subjects, wardrobe, palette consistent across scenes).

${spec}

Output ONLY valid JSON. No markdown, no code fences, no commentary. Exact shape:
{ "variants": [ { "variant_label": string, "schema": <schema above> }, ... ] }
"variant_label" is a short distinguishing name like "Hook A — product-first" or "Deadpan POV".`
}

// ---------------------------------------------------------------------------
// PHASE 2 — SCORER
// ---------------------------------------------------------------------------

/**
 * System prompt for the virality scorer. The model returns per-factor scores
 * + a summary + a list of fixes. The OVERALL score is always computed
 * server-side via computeOverall() — if the model emits an "overall" field,
 * the route ignores it.
 */
export function scorerSystemPrompt(mediaType: MediaType): string {
  const rubric = mediaType === 'video' ? VIDEO_RUBRIC : IMAGE_RUBRIC
  const factorSpec = rubric
    .map((f) => `  "${f.key}" (weight ${f.weight}%): ${f.description}`)
    .join('\n')

  const curveNote =
    mediaType === 'video'
      ? `\n"attention_curve": array of { "second": integer, "retention": integer (0-100) } — one entry per second for the full duration of the video. Predicted retention curve: stays high during engaging moments; drops at boring or confusing beats. Start at 100 and end wherever the predicted attention lands.\n`
      : `\n"attention_curve": null (no attention curve for images)\n`

  return `You are a viral content strategist with deep expertise in short-form ${mediaType} performance on TikTok, Reels, and Shorts.

Evaluate the provided prompt schema against these weighted factors:
${factorSpec}

For each factor, assign a score from 0 to 100 based on how well the planned content fulfills it. Be specific and honest — a generic brief deserves a low score. Do not grade on a curve.
${curveNote}
Also provide:
- "summary": one paragraph verdict on overall viral potential, what works, what doesn't.
- "fixes": array of { "factor": <factor key>, "fix": <specific actionable change to the prompt> } — only include fixes for factors that meaningfully drag the score down. Each fix must be concrete (name the scene, the line, the lighting choice to change) — not a platitude.

Output ONLY valid JSON, no markdown, no preamble. Exact shape:
{
  "factors": {
    "<factor_key>": { "score": <integer 0-100>, "note": "<one sentence explaining the score>" }
  },
  "attention_curve": <array or null per the spec above>,
  "summary": "<paragraph>",
  "fixes": [ { "factor": "<factor key>", "fix": "<specific actionable change>" } ]
}

Do NOT include an "overall" field — the server computes that. Scores must be integers in 0–100. Use every factor key listed above; never invent new ones.`
}

// ---------------------------------------------------------------------------
// PHASE 3 — ENHANCER
// ---------------------------------------------------------------------------

/**
 * System prompt for the enhancer pass. The model receives the current schema,
 * its factor breakdown, and a list of specific fixes — and returns either an
 * improved schema (when changes would meaningfully lift the score) or a refusal
 * with a reason (when the prompt is already strong on every factor).
 *
 * The route trusts the model's `enhancement_applied` flag for early-exit
 * messaging, then re-scores the new schema server-side as the source of truth.
 */
export function enhancerSystemPrompt(mediaType: MediaType): string {
  const spec = mediaType === 'video' ? VIDEO_SCHEMA_SPEC : IMAGE_SCHEMA_SPEC
  return `You are a world-class creative director improving an AI ${mediaType} generation prompt based on a virality score and specific fixes.

You will receive:
1. The current prompt schema (JSON)
2. The virality score factor breakdown with notes
3. A list of specific fixes to apply

Your job:
- Assess honestly whether meaningful improvement is possible. If the prompt already scores strongly on every factor (≥80) and changes would be purely cosmetic, return enhancement_applied: false with a clear reason.
- If ANY factor scores below 70, you MUST attempt enhancement — those are the levers.
- Apply every fix listed. Strengthen each weak factor. Preserve everything that already scores well — do not change strong elements.
- Return the full improved schema as valid JSON, matching the EXACT shape below — every required field must be present.
- Also return change_log: an array of one-line strings, each describing one concrete change and which factor it improves. If you genuinely made no targeted changes, leave the array empty — do not invent change-log entries.

Output ONLY valid JSON, no markdown, no preamble. Exact shape:
{
  "enhancement_applied": true | false,
  "reason": "<if false: a one-sentence explanation of why enhancement would not help>",
  "schema": <full improved schema matching the media_type spec below, or null if enhancement_applied is false>,
  "change_log": ["<what changed and which factor it lifts>", ...]
}

${spec}
`
}

// app/api/studio/generate-prompt/route.ts — brief → 2-3 structured variants.
// Auth → resolve active org → can(studio,create) → Claude Architect → insert
// one prompt_blueprints row per variant, all sharing a batch_id. No scoring
// (Phase 2), no HF generation ever.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { callLLM, parseLLMJson, ARCHITECT_MODEL } from '@/lib/studio/llm'
import { architectSystemPrompt } from '@/lib/studio/system-prompts'
import { renderPrompt } from '@/lib/studio/render-prompt'
import type { GeneratedVariant, MediaType } from '@/lib/studio/schema'
import { can, type Role } from '@/lib/rbac'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { data: membership } = await supabase
      .from('memberships')
      .select('org_id, role')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('approved_at', { ascending: false }) // deterministic: newest active org, matches auth-helpers
      .limit(1)
      .maybeSingle()
    if (!membership) return NextResponse.json({ error: 'No active organization' }, { status: 403 })

    if (!can(membership.role as Role, 'studio', 'create')) {
      return NextResponse.json({ error: 'Not permitted' }, { status: 403 })
    }

    const body = (await req.json()) as {
      brief: string
      mediaType: MediaType
      platform: string
      targetAudience: string
      targetModel?: string
      workId?: string | null
    }

    if (!body.brief?.trim()) return NextResponse.json({ error: 'Brief is required' }, { status: 400 })
    if (body.mediaType !== 'video' && body.mediaType !== 'image') {
      return NextResponse.json({ error: 'Invalid media type' }, { status: 400 })
    }

    const userMsg = [
      `BRIEF: ${body.brief.trim()}`,
      `PLATFORM: ${body.platform}`,
      `TARGET AUDIENCE: ${body.targetAudience || 'general'}`,
      body.targetModel ? `TARGET MODEL: ${body.targetModel}` : '',
    ]
      .filter(Boolean)
      .join('\n')

    const raw = await callLLM({
      system: architectSystemPrompt(body.mediaType),
      user: userMsg,
      model: ARCHITECT_MODEL,
      maxTokens: 16000, // 2 variants × large video schema can hit ~10-12k tokens; 8k was truncating
      jsonMode: true,   // OpenAI json_object mode guarantees parseable JSON output
    })

    const parsed = parseLLMJson<{ variants: GeneratedVariant[] }>(raw)
    if (!parsed.variants?.length) {
      return NextResponse.json({ error: 'No variants generated' }, { status: 502 })
    }

    // Drop any variant whose schema is missing or whose media_type doesn't match
    // the request — renderPrompt branches on media_type, and the DB column is set
    // from body.mediaType, so the two must agree. Prevents passing undefined to
    // renderPrompt (which would throw mid-request).
    const variants = parsed.variants.filter(
      (v) => v?.schema && v.schema.media_type === body.mediaType,
    )
    if (!variants.length) {
      return NextResponse.json({ error: 'No valid variants generated' }, { status: 502 })
    }

    const batchId = crypto.randomUUID()
    const rows = variants.map((v) => ({
      org_id: membership.org_id,
      batch_id: batchId,
      work_id: body.workId || null,
      created_by: user.id,
      media_type: body.mediaType,
      brief: body.brief.trim(),
      variant_label: v.variant_label || 'Variant',
      schema_json: v.schema,
      rendered_prompt: renderPrompt(v.schema),
    }))

    const { error } = await supabase.from('prompt_blueprints').insert(rows)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ batchId, count: rows.length })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Generation failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

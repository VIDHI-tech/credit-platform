// app/app/studio/[id]/page.tsx — batch detail. [id] is the batch_id; one
// numbered section per variant. Less boxy: hero brief + accent-stripe list of
// variants (see ../variant-card.tsx).
import { requireActiveMembership } from '@/lib/auth-helpers'
import { createClient } from '@/lib/supabase-server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Video, ImageIcon } from 'lucide-react'
import { VariantCard, type ScoreData } from '../variant-card'
import type { PromptSchema } from '@/lib/studio/schema'

interface PageProps { params: Promise<{ id: string }> }

export default async function StudioBatchPage({ params }: PageProps) {
  await requireActiveMembership()
  const { id: batchId } = await params
  const supabase = await createClient()

  const { data: blueprints, error: blueprintsError } = await supabase
    .from('prompt_blueprints')
    .select('id, media_type, brief, variant_label, schema_json, rendered_prompt, created_at')
    .eq('batch_id', batchId)
    .order('created_at', { ascending: true })

  if (blueprintsError) {
    console.error('[studio:batch] query failed:', blueprintsError.message)
  }

  if (!blueprints || blueprints.length === 0) notFound()

  // Fetch existing scores for these blueprints. The DESC ordering means the
  // first row per blueprint_id seen is the LATEST score — that's what we
  // surface (older scores stay in the table for the learning loop in Phase 6).
  const blueprintIds = blueprints.map((b) => b.id)
  const { data: scoreRows, error: scoresError } = blueprintIds.length
    ? await supabase
        .from('virality_scores')
        .select(
          'blueprint_id, overall_score, factor_breakdown, attention_curve, suggested_fixes, enhancement_possible, summary, created_at',
        )
        .in('blueprint_id', blueprintIds)
        .order('created_at', { ascending: false })
    : { data: [], error: null }

  if (scoresError) {
    console.error('[studio:batch] scores query failed:', scoresError.message)
  }

  const scoreMap = new Map<string, ScoreData>()
  ;(scoreRows ?? []).forEach((s) => {
    if (!scoreMap.has(s.blueprint_id)) {
      // Cast: Supabase types JSONB cols as Json; we control the insert shape.
      scoreMap.set(s.blueprint_id, s as unknown as ScoreData)
    }
  })

  const brief = blueprints[0].brief
  const mediaType = blueprints[0].media_type as 'video' | 'image'
  const MediaIcon = mediaType === 'image' ? ImageIcon : Video

  return (
    <div className="p-6 lg:p-10 max-w-4xl mx-auto space-y-8">
      <Link
        href="/app/studio"
        className="inline-flex items-center gap-1.5 text-sm text-neutral-400 hover:text-white transition-colors"
      >
        <ArrowLeft className="size-4" />
        Back to Studio
      </Link>

      {/* HERO BRIEF */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-xs text-neutral-500">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-900 border border-neutral-800 px-2.5 py-0.5 text-neutral-300">
            <MediaIcon className="size-3" />
            <span className="capitalize">{mediaType}</span>
          </span>
          <span>·</span>
          <span>
            {blueprints.length} variant{blueprints.length === 1 ? '' : 's'}
          </span>
        </div>
        <h1 className="text-xl lg:text-2xl text-white leading-snug font-medium">
          {brief}
        </h1>
      </div>

      {/* VARIANTS — accent-stripe numbered sections */}
      <div className="space-y-6 pt-2">
        {blueprints.map((b, i) => (
          <VariantCard
            key={b.id}
            index={i + 1}
            blueprintId={b.id}
            label={b.variant_label || `Variant ${i + 1}`}
            renderedPrompt={b.rendered_prompt}
            schema={b.schema_json as PromptSchema}
            mediaType={b.media_type as 'video' | 'image'}
            score={scoreMap.get(b.id) ?? null}
          />
        ))}
      </div>
    </div>
  )
}

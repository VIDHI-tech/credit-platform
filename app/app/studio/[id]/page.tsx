// app/app/studio/[id]/page.tsx — batch detail. [id] is the batch_id; one
// numbered section per variant. Less boxy: hero brief + accent-stripe list of
// variants (see ../variant-card.tsx).
import { requireActiveMembership } from '@/lib/auth-helpers'
import { createClient } from '@/lib/supabase-server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Video, ImageIcon } from 'lucide-react'
import { VariantCard, type ScoreData } from '../variant-card'
import type { Outcome } from '../outcome-form'
import type { PromptSchema } from '@/lib/studio/schema'
import { can, type Role } from '@/lib/rbac'

interface PageProps { params: Promise<{ id: string }> }

export default async function StudioBatchPage({ params }: PageProps) {
  // requireActiveMembership returns the membership row so we don't have to
  // re-query memberships below — and we need both user_id and role for the
  // canDelete computation per variant.
  const membership = await requireActiveMembership()
  const { id: batchId } = await params
  const supabase = await createClient()

  // Added work_id + created_by + org_id (Phase 4) — required for the
  // AttachToWork dropdown's current value, the canDelete ownership check, and
  // for scoping the membership role + works list to THE BATCH'S org.
  const { data: blueprints, error: blueprintsError } = await supabase
    .from('prompt_blueprints')
    .select(
      'id, media_type, brief, variant_label, schema_json, rendered_prompt, work_id, created_by, org_id, created_at',
    )
    .eq('batch_id', batchId)
    .order('created_at', { ascending: true })

  if (blueprintsError) {
    console.error('[studio:batch] query failed:', blueprintsError.message)
  }

  if (!blueprints || blueprints.length === 0) notFound()

  // All blueprints in a batch share an org. Re-query membership scoped to
  // THAT org so canDelete uses the right role for multi-org users.
  // requireActiveMembership returns the user's MOST-RECENT org role, which
  // may not match if this batch is in a different org.
  const batchOrgId = blueprints[0].org_id as string
  const { data: scopedMembership } = await supabase
    .from('memberships')
    .select('role')
    .eq('user_id', membership.user_id)
    .eq('org_id', batchOrgId)
    .eq('status', 'active')
    .maybeSingle()
  // Fall back to the helper's role if for some reason the scoped lookup
  // misses (shouldn't — RLS guarantees the user is a member or they'd
  // never have seen the blueprint above).
  const role: Role = (scopedMembership?.role ?? membership.role) as Role

  // Works list scoped to the batch's org — the PATCH route validates same-org
  // anyway, but the dropdown shouldn't even offer foreign-org works.
  const { data: works } = await supabase
    .from('works')
    .select('id, title, video_type')
    .eq('org_id', batchOrgId)
    .order('created_at', { ascending: false })
    .limit(100)

  const workOptions = (works ?? []).map((w) => ({
    id: w.id as string,
    label: (w.title as string) || (w.video_type as string) || 'Untitled',
  }))

  const totalInBatch = blueprints.length

  // Fetch existing scores for these blueprints. The DESC ordering means the
  // first row per blueprint_id seen is the LATEST score — that's what we
  // surface (older scores stay in the table for the learning loop in Phase 6).
  const blueprintIds = blueprints.map((b) => b.id)
  const { data: scoreRows, error: scoresError } = blueprintIds.length
    ? await supabase
        .from('virality_scores')
        .select(
          'blueprint_id, overall_score, factor_breakdown, attention_curve, suggested_fixes, enhancement_possible, summary, tier, created_at',
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

  // Phase 5 — outcomes per blueprint. Latest-first; we keep the FIRST row seen
  // per blueprint_id, which is the latest. Older edits stay in the table as
  // history (PATCH updates updated_at and we sort by recorded_at DESC for
  // determinism — the row id never changes across edits).
  const { data: outcomeRows, error: outcomesError } = blueprintIds.length
    ? await supabase
        .from('generation_outcomes')
        .select(
          'id, blueprint_id, platform, published_url, published_at, views, watch_time_avg_seconds, shares, saves, comments, likes, went_viral',
        )
        .in('blueprint_id', blueprintIds)
        .order('recorded_at', { ascending: false })
    : { data: [] as Array<Outcome & { blueprint_id: string }>, error: null }

  if (outcomesError) {
    console.error(
      '[studio:batch] outcomes query failed:',
      outcomesError.message,
    )
  }

  const outcomeMap = new Map<string, Outcome>()
  ;(outcomeRows ?? []).forEach((o) => {
    if (!outcomeMap.has(o.blueprint_id as string)) {
      outcomeMap.set(o.blueprint_id as string, o as unknown as Outcome)
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
        {blueprints.map((b, i) => {
          // canDelete: own blueprint, OR the role has studio.delete.
          const canDelete =
            b.created_by === membership.user_id ||
            can(role, 'studio', 'delete')
          return (
            <VariantCard
              key={b.id}
              index={i + 1}
              blueprintId={b.id}
              label={b.variant_label || `Variant ${i + 1}`}
              renderedPrompt={b.rendered_prompt}
              schema={b.schema_json as PromptSchema}
              mediaType={b.media_type as 'video' | 'image'}
              score={scoreMap.get(b.id) ?? null}
              currentWorkId={(b.work_id as string | null) ?? null}
              works={workOptions}
              canDelete={canDelete}
              totalInBatch={totalInBatch}
              existingOutcome={outcomeMap.get(b.id) ?? null}
            />
          )
        })}
      </div>
    </div>
  )
}

// app/app/studio/page.tsx — Studio home.
// Less boxy: hero text + unified brief card + Recent as a borderless list,
// not a grid of cards.
import { requireActiveMembership } from '@/lib/auth-helpers'
import { createClient } from '@/lib/supabase-server'
import Link from 'next/link'
import { Video, ImageIcon, ArrowUpRight, Sparkles, Database } from 'lucide-react'
import { BriefForm } from './brief-form'

export default async function StudioPage() {
  // requireActiveMembership returns the user's most-recently-approved active
  // org — same org that BriefForm targets when generating a new prompt. The
  // Tier-2 indicator below is scoped to THAT org so it answers the question
  // the user actually has: "if I write a brief now, will it get Tier-2?"
  const membership = await requireActiveMembership()
  const supabase = await createClient()

  const [
    { data: blueprints, error: blueprintsError },
    { data: works },
    { count: outcomeCount },
  ] = await Promise.all([
    supabase
      .from('prompt_blueprints')
      .select('id, batch_id, media_type, brief, variant_label, created_at')
      .order('created_at', { ascending: false })
      .limit(60),
    supabase
      .from('works')
      .select('id, title, video_type')
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('generation_outcomes')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', membership.org_id),
  ])

  if (blueprintsError) {
    console.error('[studio] prompt_blueprints query failed:', blueprintsError.message)
  }

  // Phase 4: best score per batch. Fetched against ALL blueprints (not just
  // the deduped batch list) because each batch has multiple variants and the
  // best score may live on a sibling. RLS gates this by org membership.
  const allBlueprintIds = (blueprints ?? []).map((b) => b.id)
  const { data: allScores } = allBlueprintIds.length
    ? await supabase
        .from('virality_scores')
        .select('blueprint_id, overall_score')
        .in('blueprint_id', allBlueprintIds)
    : { data: [] as Array<{ blueprint_id: string; overall_score: number }> }

  // blueprint_id → score; one row per blueprint (the partial unique index on
  // tier=1 guarantees that), so we don't need to pick a "best".
  const scoreByBlueprint = new Map<string, number>()
  ;(allScores ?? []).forEach((s) => {
    scoreByBlueprint.set(s.blueprint_id, Number(s.overall_score))
  })

  // Compute the BEST score across a batch's variants + the variant count.
  // The DESC ordering above means we iterate newest-first, but for aggregation
  // order doesn't matter.
  const batchMeta = new Map<
    string,
    { count: number; bestScore: number | null }
  >()
  ;(blueprints ?? []).forEach((b) => {
    const existing = batchMeta.get(b.batch_id) ?? {
      count: 0,
      bestScore: null,
    }
    const s = scoreByBlueprint.get(b.id) ?? null
    batchMeta.set(b.batch_id, {
      count: existing.count + 1,
      bestScore:
        s !== null && (existing.bestScore === null || s > existing.bestScore)
          ? s
          : existing.bestScore,
    })
  })

  // Dedup depends on the DESC order above: the FIRST row per batch is newest.
  const seen = new Set<string>()
  const batches = (blueprints ?? []).filter((b) => {
    if (seen.has(b.batch_id)) return false
    seen.add(b.batch_id)
    return true
  })

  const TIER2_THRESHOLD = 50
  const outcomeCountSafe = typeof outcomeCount === 'number' ? outcomeCount : 0
  const tier2Active = outcomeCountSafe >= TIER2_THRESHOLD

  return (
    <div className="p-6 lg:p-10 max-w-4xl mx-auto space-y-10">
      {/* HERO */}
      <div className="space-y-2">
        <div className="inline-flex items-center gap-2 rounded-full bg-lime-400/10 border border-lime-400/30 px-3 py-1 text-xs text-lime-400">
          <Sparkles className="size-3.5" />
          <span>Prompt Architect</span>
        </div>
        <h1 className="text-3xl lg:text-4xl font-bold text-white tracking-tight">
          Turn a brief into a director-grade prompt
        </h1>
        <p className="text-neutral-400 text-sm max-w-2xl">
          Describe your idea — Studio drafts 2–3 distinct variants, each with the
          full structured direction (subjects, scenes, lighting, audio). Copy the
          winner into Higgsfield.
        </p>
        {/* Tier-2 indicator — only shown when at least one outcome exists,
            to avoid noise for fresh orgs. Lime pill when active, neutral
            progress pill while still under threshold. Matches the per-score
            Tier badge styling so the two surfaces tell the same story. */}
        {outcomeCountSafe > 0 ? (
          <div className="pt-1">
            {tier2Active ? (
              <span
                className="inline-flex items-center gap-1.5 rounded-full bg-lime-400/10 border border-lime-400/30 px-2.5 py-1 text-xs text-lime-400"
                title="Tier-2 scoring is active: the scorer is calibrating against your org’s recorded outcomes."
              >
                <Database className="size-3" />
                Tier 2 active ·{' '}
                <span className="font-mono tabular-nums">
                  {outcomeCountSafe}
                </span>{' '}
                outcomes
              </span>
            ) : (
              <span
                className="inline-flex items-center gap-1.5 rounded-full bg-neutral-900 border border-neutral-800 px-2.5 py-1 text-xs text-neutral-400"
                title="Tier-2 scoring unlocks once you have 50 recorded outcomes — until then the scorer uses a generic rubric."
              >
                <Database className="size-3 text-neutral-500" />
                <span className="font-mono tabular-nums text-neutral-300">
                  {outcomeCountSafe}
                </span>
                /{TIER2_THRESHOLD} outcomes ·{' '}
                <span className="text-neutral-500">
                  Tier-2 unlocks at {TIER2_THRESHOLD}
                </span>
              </span>
            )}
          </div>
        ) : null}
      </div>

      {/* BRIEF FORM */}
      <BriefForm
        works={(works ?? []).map((w) => ({
          id: w.id,
          label: w.title || w.video_type || 'Untitled',
        }))}
      />

      {/* RECENT — borderless list, not a grid of boxes */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-300">Recent briefs</h2>
          {batches.length > 0 && (
            <span className="text-xs text-neutral-500">{batches.length}</span>
          )}
        </div>

        {batches.length === 0 ? (
          <p className="text-sm text-neutral-500 py-4">
            Nothing yet. Write a brief above to generate your first prompts.
          </p>
        ) : (
          <ul className="divide-y divide-neutral-900">
            {batches.map((b) => {
              const Icon = b.media_type === 'image' ? ImageIcon : Video
              const meta = batchMeta.get(b.batch_id) ?? {
                count: 1,
                bestScore: null,
              }
              // Number.isFinite guards against any degenerate NaN/Infinity
              // slipping through Number(s.overall_score) — the column is NUMERIC
              // NOT NULL so it shouldn't happen, but a malformed cast would
              // currently render "NaN" in the chip.
              const best =
                meta.bestScore !== null && Number.isFinite(meta.bestScore)
                  ? meta.bestScore
                  : null
              // Same threshold bands as ScorePanel for visual consistency.
              const scoreCls =
                best === null
                  ? 'text-neutral-600'
                  : best >= 80
                    ? 'text-lime-400'
                    : best >= 60
                      ? 'text-amber-400'
                      : 'text-red-400'
              return (
                <li key={b.batch_id}>
                  <Link
                    href={`/app/studio/${b.batch_id}`}
                    className="group flex items-center gap-4 py-3 hover:bg-neutral-900/30 -mx-3 px-3 rounded-lg transition-colors"
                  >
                    <span className="inline-flex size-9 items-center justify-center rounded-lg bg-neutral-900 text-neutral-400 group-hover:text-lime-400 transition-colors">
                      <Icon className="size-4" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate group-hover:text-lime-400 transition-colors">
                        {b.brief}
                      </p>
                      <p className="text-xs text-neutral-500 mt-0.5 capitalize">
                        {b.media_type} ·{' '}
                        {meta.count} variant{meta.count === 1 ? '' : 's'} ·{' '}
                        {new Date(b.created_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </p>
                    </div>
                    {best !== null ? (
                      <span
                        className={`text-sm font-bold font-mono tabular-nums shrink-0 ${scoreCls}`}
                        title={`Best score in batch: ${best.toFixed(0)}`}
                      >
                        {best.toFixed(0)}
                      </span>
                    ) : null}
                    <ArrowUpRight className="size-4 text-neutral-600 group-hover:text-lime-400 transition-colors shrink-0" />
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}

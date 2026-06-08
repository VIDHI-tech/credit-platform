// app/app/studio/page.tsx — Studio home.
// Less boxy: hero text + unified brief card + Recent as a borderless list,
// not a grid of cards.
import { requireActiveMembership } from '@/lib/auth-helpers'
import { createClient } from '@/lib/supabase-server'
import Link from 'next/link'
import { Video, ImageIcon, ArrowUpRight, Sparkles } from 'lucide-react'
import { BriefForm } from './brief-form'

export default async function StudioPage() {
  await requireActiveMembership()
  const supabase = await createClient()

  const { data: blueprints, error: blueprintsError } = await supabase
    .from('prompt_blueprints')
    .select('id, batch_id, media_type, brief, variant_label, created_at')
    .order('created_at', { ascending: false })
    .limit(60)

  if (blueprintsError) {
    console.error('[studio] prompt_blueprints query failed:', blueprintsError.message)
  }

  // Dedup depends on the DESC order above: the FIRST row per batch is newest.
  const seen = new Set<string>()
  const batches = (blueprints ?? []).filter((b) => {
    if (seen.has(b.batch_id)) return false
    seen.add(b.batch_id)
    return true
  })

  const { data: works } = await supabase
    .from('works')
    .select('id, title, video_type')
    .order('created_at', { ascending: false })
    .limit(50)

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
                        {new Date(b.created_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </p>
                    </div>
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

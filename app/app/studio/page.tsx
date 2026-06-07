// app/app/studio/page.tsx — Studio home: brief form + recent batches.
import { requireActiveMembership } from '@/lib/auth-helpers'
import { createClient } from '@/lib/supabase-server'
import Link from 'next/link'
import { BriefForm } from './brief-form'

export default async function StudioPage() {
  await requireActiveMembership()
  const supabase = await createClient()

  // Recent blueprints (RLS scopes to the active org). Group by batch_id and
  // keep the newest blueprint per batch as the card.
  const { data: blueprints, error: blueprintsError } = await supabase
    .from('prompt_blueprints')
    .select('id, batch_id, media_type, brief, variant_label, created_at')
    .order('created_at', { ascending: false })
    .limit(60)

  // Don't let a failed query (e.g. migration not yet applied) render a silently
  // blank "Recent" with no trace — log it for observability.
  if (blueprintsError) {
    console.error('[studio] prompt_blueprints query failed:', blueprintsError.message)
  }

  // Dedup depends on the DESC order above: the FIRST row seen per batch is the
  // newest. If that order ever changes, this keeps the oldest instead.
  const seen = new Set<string>()
  const batches = (blueprints ?? []).filter((b) => {
    if (seen.has(b.batch_id)) return false
    seen.add(b.batch_id)
    return true
  })

  // Works for the optional attach dropdown.
  const { data: works } = await supabase
    .from('works')
    .select('id, title, video_type')
    .order('created_at', { ascending: false })
    .limit(50)

  return (
    <div className="p-6 max-w-5xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Studio</h1>
        <p className="text-neutral-400 text-sm mt-1">
          Turn a brief into director-grade prompts. Copy the winner into Higgsfield.
        </p>
      </div>

      <BriefForm
        works={(works ?? []).map((w) => ({
          id: w.id,
          label: w.title || w.video_type || 'Untitled',
        }))}
      />

      <section>
        <h2 className="text-sm font-semibold text-neutral-300 mb-3">Recent</h2>
        {batches.length === 0 ? (
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-8 text-center text-neutral-500 text-sm">
            Nothing yet. Write a brief above to generate your first prompts.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {batches.map((b) => (
              <Link
                key={b.batch_id}
                href={`/app/studio/${b.batch_id}`}
                className="block bg-neutral-900 border border-neutral-800 hover:border-neutral-700 rounded-lg p-4 transition-colors"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs px-2 py-0.5 rounded border border-neutral-700 text-neutral-300 capitalize">
                    {b.media_type}
                  </span>
                  <span className="text-xs text-neutral-500">
                    {new Date(b.created_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                </div>
                <p className="text-sm text-white line-clamp-2">{b.brief}</p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

// app/app/studio/[id]/page.tsx — batch detail. [id] is the batch_id; one card
// per variant blueprint in the batch.
import { requireActiveMembership } from '@/lib/auth-helpers'
import { createClient } from '@/lib/supabase-server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { VariantCard } from '../variant-card'
import type { PromptSchema } from '@/lib/studio/schema'

interface PageProps { params: Promise<{ id: string }> }

export default async function StudioBatchPage({ params }: PageProps) {
  await requireActiveMembership()
  const { id: batchId } = await params
  const supabase = await createClient()

  const { data: blueprints } = await supabase
    .from('prompt_blueprints')
    .select('id, media_type, brief, variant_label, schema_json, rendered_prompt, created_at')
    .eq('batch_id', batchId)
    .order('created_at', { ascending: true })

  if (!blueprints || blueprints.length === 0) notFound()

  const brief = blueprints[0].brief
  const mediaType = blueprints[0].media_type

  return (
    <div className="p-6 max-w-5xl space-y-6">
      <Link href="/app/studio" className="text-neutral-400 hover:text-white text-sm inline-flex items-center gap-1">
        ← Back to Studio
      </Link>

      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs px-2 py-0.5 rounded border border-neutral-700 text-neutral-300 capitalize">{mediaType}</span>
          <span className="text-xs text-neutral-500">{blueprints.length} variants</span>
        </div>
        <h1 className="text-xl font-bold text-white">{brief}</h1>
      </div>

      <div className="space-y-4">
        {blueprints.map((b) => (
          <VariantCard
            key={b.id}
            label={b.variant_label || 'Variant'}
            renderedPrompt={b.rendered_prompt}
            schema={b.schema_json as PromptSchema}
          />
        ))}
      </div>
    </div>
  )
}

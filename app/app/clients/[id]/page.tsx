// app/app/clients/[id]/page.tsx — client detail with live credit attribution.
import { requireActiveMembership } from '@/lib/auth-helpers'
import { createClient } from '@/lib/supabase-server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import {
  CLIENT_STATUS_COLORS,
  CLIENT_STATUS_LABELS,
  type ClientStatus,
} from '@/lib/client-helpers'
import { StatusDropdown } from './status-dropdown'
import { EditClientButton } from './edit-client-button'
import { DeleteClientButton } from './delete-client-button'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function ClientDetailPage({ params }: PageProps) {
  const membership = await requireActiveMembership()
  const { id } = await params
  const supabase = await createClient()

  const { data: client } = await supabase
    .from('clients')
    .select('id, name, industry, status, created_at')
    .eq('id', id)
    .maybeSingle()

  if (!client) notFound()

  const { data: generations } = await supabase
    .from('generations')
    .select(
      'id, display_name, result_url, media_type, credits, hf_created_at, assigned_at'
    )
    .eq('client_id', id)
    .order('hf_created_at', { ascending: false })

  const totalCredits = (generations || []).reduce(
    (sum, g) => sum + parseFloat(g.credits || '0'),
    0
  )
  const generationCount = generations?.length || 0
  const status = client.status as ClientStatus
  const canEdit = membership.role === 'master' || membership.role === 'manager'
  const canDelete = membership.role === 'master'

  return (
    <div className="p-6 max-w-5xl text-neutral-100">
      <Link
        href="/app/clients"
        className="text-neutral-400 hover:text-white text-sm inline-flex items-center gap-1 mb-4"
      >
        ← Back to Clients
      </Link>

      {/* HEADER */}
      <div className="flex items-start justify-between gap-4 mb-2">
        <h1 className="text-3xl font-bold text-white">{client.name}</h1>
        <div className="flex items-center gap-2">
          {canEdit ? (
            <StatusDropdown clientId={client.id} currentStatus={status} />
          ) : (
            <span
              className={`text-xs px-3 py-1 rounded border ${CLIENT_STATUS_COLORS[status]}`}
            >
              {CLIENT_STATUS_LABELS[status]}
            </span>
          )}
          {canEdit && (
            <EditClientButton
              client={{
                id: client.id,
                name: client.name,
                industry: client.industry,
                status,
              }}
            />
          )}
        </div>
      </div>
      <p className="text-neutral-400 mb-8">
        {client.industry || (
          <span className="text-neutral-600 italic">No industry set</span>
        )}
      </p>

      {/* CREDIT SUMMARY */}
      <section className="bg-neutral-950 border border-neutral-800 rounded-lg p-6 mb-6">
        <h2 className="text-xs uppercase tracking-wider font-semibold text-neutral-400 mb-4">
          Credit Usage
        </h2>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <div className="text-3xl font-bold text-white">
              {totalCredits.toFixed(1)}
            </div>
            <div className="text-sm text-neutral-500 mt-1">
              Total credits used
            </div>
          </div>
          <div>
            <div className="text-3xl font-bold text-white">
              {generationCount}
            </div>
            <div className="text-sm text-neutral-500 mt-1">
              Generation{generationCount !== 1 ? 's' : ''} assigned
            </div>
          </div>
        </div>
      </section>

      {/* GENERATIONS LIST */}
      <section className="bg-neutral-950 border border-neutral-800 rounded-lg overflow-hidden mb-6">
        <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between">
          <h2 className="font-semibold text-white">Assigned Generations</h2>
          <span className="text-xs text-neutral-500">{generationCount} total</span>
        </div>

        {generationCount === 0 ? (
          <div className="p-8 text-center text-neutral-500">
            <p>No generations assigned to this client yet.</p>
            <p className="text-sm mt-1">
              Go to{' '}
              <Link href="/app/sync" className="text-lime-400 hover:underline">
                Sync &amp; Assign
              </Link>{' '}
              to attribute generations.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-neutral-800">
            {generations!.map((g) => (
              <div key={g.id} className="px-4 py-3 flex items-center gap-3">
                {g.media_type === 'video' ? (
                  <video
                    src={g.result_url}
                    className="w-16 h-12 rounded object-cover bg-black shrink-0"
                    preload="metadata"
                    muted
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={g.result_url}
                    alt={g.display_name}
                    className="w-16 h-12 rounded object-cover bg-neutral-800 shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white">
                    {g.display_name}
                  </div>
                  <div className="text-xs text-neutral-500">
                    {new Date(g.hf_created_at).toLocaleString()}
                  </div>
                </div>
                <div className="text-right">
                  <div
                    className={`text-sm font-bold ${parseFloat(g.credits) > 0 ? 'text-orange-400' : 'text-neutral-500'}`}
                  >
                    {parseFloat(g.credits) > 0
                      ? parseFloat(g.credits).toFixed(1)
                      : 'free'}
                  </div>
                  <div className="text-xs text-neutral-600">credits</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* WORKS PLACEHOLDER */}
      <section className="bg-neutral-950 border border-neutral-800 rounded-lg p-6 mb-6">
        <h2 className="text-xs uppercase tracking-wider font-semibold text-neutral-400 mb-2">
          Works
        </h2>
        <p className="text-neutral-500 text-sm">
          Coming in Phase 3 — multi-step work creation with creator assignment,
          video type, deadlines, and lifecycle.
        </p>
      </section>

      {/* DELETE (master only) */}
      {canDelete && (
        <section className="bg-red-950/30 border border-red-900 rounded-lg p-6">
          <h2 className="text-xs uppercase tracking-wider font-semibold text-red-400 mb-2">
            Danger zone
          </h2>
          <p className="text-neutral-400 text-sm mb-3">
            Deleting this client also unassigns all its generations (sets
            client_id to NULL — they go back to unassigned).
          </p>
          <DeleteClientButton clientId={client.id} clientName={client.name} />
        </section>
      )}
    </div>
  )
}

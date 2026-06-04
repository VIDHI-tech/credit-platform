// app/app/clients/[id]/page.tsx — client detail: credit summary, works, generations.
import { requireActiveMembership } from '@/lib/auth-helpers'
import { createClient } from '@/lib/supabase-server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import {
  CLIENT_STATUS_COLORS,
  CLIENT_STATUS_LABELS,
  type ClientStatus,
} from '@/lib/client-helpers'
import {
  WORK_STATUS_COLORS,
  WORK_STATUS_LABELS,
  type WorkStatus,
} from '@/lib/work-helpers'
import { StatusDropdown } from './status-dropdown'
import { EditClientButton } from './edit-client-button'
import { DeleteClientButton } from './delete-client-button'
import { CreateWorkButton } from './create-work-button'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function ClientDetailPage({ params }: PageProps) {
  const membership = await requireActiveMembership()
  const { id } = await params
  const supabase = await createClient()

  const { data: client } = await supabase
    .from('clients')
    .select('id, name, industry, status')
    .eq('id', id)
    .maybeSingle()

  if (!client) notFound()

  const { data: generations } = await supabase
    .from('generations')
    .select('id, display_name, result_url, media_type, credits, hf_created_at')
    .eq('client_id', id)
    .order('hf_created_at', { ascending: false })

  const { data: works } = await supabase
    .from('works')
    .select('id, title, video_type, status, end_date, max_credits, creator_id')
    .eq('client_id', id)
    .order('created_at', { ascending: false })

  const creatorIds = [...new Set((works || []).map((w) => w.creator_id))]
  const { data: creators } = await supabase
    .from('memberships')
    .select('user_id, full_name')
    .in(
      'user_id',
      creatorIds.length > 0
        ? creatorIds
        : ['00000000-0000-0000-0000-000000000000']
    )
  const creatorNameMap = new Map(
    (creators || []).map((c) => [c.user_id, c.full_name])
  )

  const workIds = (works || []).map((w) => w.id)
  const { data: workCredits } = await supabase
    .from('generations')
    .select('work_id, credits')
    .in(
      'work_id',
      workIds.length > 0 ? workIds : ['00000000-0000-0000-0000-000000000000']
    )

  const creditByWork = new Map<string, number>()
  ;(workCredits || []).forEach((row) => {
    if (row.work_id) {
      creditByWork.set(
        row.work_id,
        (creditByWork.get(row.work_id) || 0) + parseFloat(row.credits || '0')
      )
    }
  })

  const totalCredits = (generations || []).reduce(
    (sum, g) => sum + parseFloat(g.credits || '0'),
    0
  )
  const status = client.status as ClientStatus
  const canEdit = membership.role === 'master' || membership.role === 'manager'
  const canDelete = membership.role === 'master'
  const canCreateWork = canEdit

  return (
    <div className="p-6 max-w-5xl text-neutral-100">
      <Link
        href="/app/clients"
        className="text-neutral-400 hover:text-white text-sm inline-flex items-center gap-1 mb-4"
      >
        ← Back to Clients
      </Link>

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
        <div className="grid grid-cols-3 gap-6">
          <div>
            <div className="text-3xl font-bold text-white">
              {totalCredits.toFixed(1)}
            </div>
            <div className="text-sm text-neutral-500 mt-1">Total credits</div>
          </div>
          <div>
            <div className="text-3xl font-bold text-white">
              {generations?.length || 0}
            </div>
            <div className="text-sm text-neutral-500 mt-1">Generations</div>
          </div>
          <div>
            <div className="text-3xl font-bold text-white">
              {works?.length || 0}
            </div>
            <div className="text-sm text-neutral-500 mt-1">Works</div>
          </div>
        </div>
      </section>

      {/* WORKS */}
      <section className="bg-neutral-950 border border-neutral-800 rounded-lg overflow-hidden mb-6">
        <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between">
          <h2 className="font-semibold text-white">Works</h2>
          {canCreateWork && (
            <CreateWorkButton clientId={client.id} clientName={client.name} />
          )}
        </div>
        {!works || works.length === 0 ? (
          <div className="p-8 text-center text-neutral-500">
            <p>No works yet for this client.</p>
            {canCreateWork && (
              <p className="text-sm mt-1">
                Use + Create Work above to add one.
              </p>
            )}
          </div>
        ) : (
          <div className="divide-y divide-neutral-800">
            {works.map((w) => (
              <Link
                key={w.id}
                href={`/app/works/${w.id}`}
                className="block px-4 py-3 hover:bg-neutral-900/60 transition-colors"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-white">
                        {w.title || w.video_type || 'Untitled work'}
                      </span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded border ${WORK_STATUS_COLORS[w.status as WorkStatus]}`}
                      >
                        {WORK_STATUS_LABELS[w.status as WorkStatus]}
                      </span>
                    </div>
                    <div className="text-xs text-neutral-500">
                      {w.video_type && <span>{w.video_type} · </span>}
                      Creator: {creatorNameMap.get(w.creator_id) || 'Unknown'}
                      {w.end_date && (
                        <span>
                          {' '}
                          · Due {new Date(w.end_date).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-white">
                      {(creditByWork.get(w.id) || 0).toFixed(1)}
                      {w.max_credits && (
                        <span className="text-neutral-500 text-xs">
                          {' '}
                          / {w.max_credits}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-neutral-500">credits</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* ALL GENERATIONS */}
      <section className="bg-neutral-950 border border-neutral-800 rounded-lg overflow-hidden mb-6">
        <div className="px-4 py-3 border-b border-neutral-800">
          <h2 className="font-semibold text-white">All Generations</h2>
        </div>
        {!generations || generations.length === 0 ? (
          <div className="p-6 text-center text-neutral-500 text-sm">
            No generations assigned yet.
          </div>
        ) : (
          <div className="divide-y divide-neutral-800 max-h-96 overflow-auto">
            {generations.map((g) => (
              <div key={g.id} className="px-4 py-2 flex items-center gap-3">
                {g.media_type === 'video' ? (
                  <video
                    src={g.result_url}
                    className="w-16 h-12 rounded object-cover bg-black"
                    preload="metadata"
                    muted
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={g.result_url}
                    alt={g.display_name}
                    className="w-16 h-12 rounded object-cover bg-neutral-800"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white truncate">
                    {g.display_name}
                  </div>
                  <div className="text-xs text-neutral-500">
                    {new Date(g.hf_created_at).toLocaleDateString()}
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
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {canDelete && (
        <section className="bg-red-950/30 border border-red-900 rounded-lg p-6">
          <h2 className="text-xs uppercase tracking-wider font-semibold text-red-400 mb-2">
            Danger zone
          </h2>
          <p className="text-neutral-400 text-sm mb-3">
            Deleting this client also deletes all its works and unassigns its
            generations.
          </p>
          <DeleteClientButton clientId={client.id} clientName={client.name} />
        </section>
      )}
    </div>
  )
}

// app/app/works/[id]/page.tsx — work detail: status actions + two-table assign.
import { requireActiveMembership } from '@/lib/auth-helpers'
import { createClient } from '@/lib/supabase-server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import {
  WORK_STATUS_COLORS,
  WORK_STATUS_LABELS,
  type WorkStatus,
  formatDeadline,
  allowedTransitions,
} from '@/lib/work-helpers'
import { StatusActionButtons } from './status-action-buttons'
import { AssignTables } from './assign-tables'
import { InstructionsViewer } from './instructions-viewer'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function WorkDetailPage({ params }: PageProps) {
  const membership = await requireActiveMembership()
  const { id } = await params
  const supabase = await createClient()

  const { data: work } = await supabase
    .from('works')
    .select(
      'id, title, video_type, status, start_date, end_date, start_time, end_time, max_credits, client_id, creator_id, instructions_path, notes'
    )
    .eq('id', id)
    .maybeSingle()

  if (!work) notFound()

  const [{ data: client }, { data: creator }] = await Promise.all([
    supabase
      .from('clients')
      .select('id, name, status')
      .eq('id', work.client_id)
      .maybeSingle(),
    supabase
      .from('memberships')
      .select('full_name')
      .eq('user_id', work.creator_id)
      .maybeSingle(),
  ])

  const [{ data: unassigned }, { data: assignedToClient }] = await Promise.all([
    supabase
      .from('generations')
      .select('*')
      .is('client_id', null)
      .order('hf_created_at', { ascending: false }),
    supabase
      .from('generations')
      .select('*')
      .eq('client_id', work.client_id)
      .order('hf_created_at', { ascending: false }),
  ])

  const usedCredits = (assignedToClient || [])
    .filter((g) => g.work_id === work.id)
    .reduce((s, g) => s + parseFloat(g.credits || '0'), 0)

  const status = work.status as WorkStatus
  const isOwnWork = work.creator_id === membership.user_id
  const transitions = allowedTransitions(status, membership.role, isOwnWork)
  const maxCredits = work.max_credits ? parseFloat(work.max_credits) : null

  return (
    <div className="p-6 max-w-6xl text-neutral-100">
      <Link
        href="/app/works"
        className="text-neutral-400 hover:text-white text-sm inline-flex items-center gap-1 mb-4"
      >
        ← Back to Works
      </Link>

      {/* HEADER */}
      <div className="flex items-start justify-between gap-4 mb-2">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-3xl font-bold text-white">
              {work.title || work.video_type || 'Untitled Work'}
            </h1>
            <span
              className={`text-xs px-3 py-1 rounded border ${WORK_STATUS_COLORS[status]}`}
            >
              {WORK_STATUS_LABELS[status]}
            </span>
          </div>
          <p className="text-neutral-400">
            <Link
              href={`/app/clients/${work.client_id}`}
              className="text-lime-400 hover:underline"
            >
              {client?.name}
            </Link>
            {' · '}
            Creator: {creator?.full_name || 'Unknown'}
            {work.end_date &&
              ` · Due ${formatDeadline(work.end_date, work.end_time)}`}
          </p>
        </div>

        {transitions.length > 0 && (
          <StatusActionButtons workId={work.id} transitions={transitions} />
        )}
      </div>

      {/* META GRID */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 mb-6">
        <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3">
          <div className="text-xs text-neutral-500 uppercase tracking-wider">
            Type
          </div>
          <div className="text-sm text-white mt-1">{work.video_type || '—'}</div>
        </div>
        <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3">
          <div className="text-xs text-neutral-500 uppercase tracking-wider">
            Start
          </div>
          <div className="text-sm text-white mt-1">
            {work.start_date
              ? new Date(work.start_date).toLocaleDateString()
              : '—'}
          </div>
        </div>
        <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3">
          <div className="text-xs text-neutral-500 uppercase tracking-wider">
            End
          </div>
          <div className="text-sm text-white mt-1">
            {work.end_date ? new Date(work.end_date).toLocaleDateString() : '—'}
          </div>
        </div>
        <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3">
          <div className="text-xs text-neutral-500 uppercase tracking-wider">
            Budget
          </div>
          <div className="text-sm text-white mt-1">
            {usedCredits.toFixed(1)}
            {maxCredits !== null && (
              <span className="text-neutral-500 text-xs"> / {maxCredits}</span>
            )}
            <span className="text-neutral-500 text-xs"> cr</span>
          </div>
        </div>
      </div>

      {/* CREDIT PROGRESS (if max set) */}
      {maxCredits !== null && maxCredits > 0 && (
        <div className="mb-6">
          <div className="flex justify-between text-xs text-neutral-400 mb-1">
            <span>Credit usage</span>
            <span>
              {usedCredits.toFixed(1)} / {maxCredits} (
              {((usedCredits / maxCredits) * 100).toFixed(0)}%)
            </span>
          </div>
          <div className="w-full bg-neutral-800 rounded-full h-2 overflow-hidden">
            <div
              className={`h-2 transition-all ${usedCredits > maxCredits ? 'bg-red-500' : 'bg-lime-400'}`}
              style={{
                width: `${Math.min(100, (usedCredits / maxCredits) * 100)}%`,
              }}
            />
          </div>
          {usedCredits > maxCredits && (
            <p className="text-xs text-red-400 mt-1">⚠ Over budget</p>
          )}
        </div>
      )}

      {/* INSTRUCTIONS */}
      {work.instructions_path && (
        <section className="bg-neutral-950 border border-neutral-800 rounded-lg overflow-hidden mb-6">
          <div className="px-4 py-3 border-b border-neutral-800">
            <h2 className="font-semibold text-white text-sm">Instructions</h2>
          </div>
          <InstructionsViewer path={work.instructions_path} />
        </section>
      )}

      {/* THE TWO TABLES — credit attribution */}
      <AssignTables
        workId={work.id}
        clientId={work.client_id}
        clientName={client?.name || ''}
        unassigned={unassigned || []}
        assignedToClient={assignedToClient || []}
      />
    </div>
  )
}

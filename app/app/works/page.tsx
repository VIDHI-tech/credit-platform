// app/app/works/page.tsx — works list with status tabs (RLS scopes by role).
import { requireActiveMembership } from '@/lib/auth-helpers'
import { createClient } from '@/lib/supabase-server'
import { can } from '@/lib/rbac'
import Link from 'next/link'
import {
  WORK_STATUSES,
  WORK_STATUS_LABELS,
  WORK_STATUS_COLORS,
  type WorkStatus,
  formatDeadline,
} from '@/lib/work-helpers'

interface PageProps {
  searchParams: Promise<{ status?: string }>
}

const PLACEHOLDER = '00000000-0000-0000-0000-000000000000'

export default async function WorksPage({ searchParams }: PageProps) {
  const membership = await requireActiveMembership()
  const { status: filterStatus } = await searchParams
  const supabase = await createClient()

  const { data: works } = await supabase
    .from('works')
    .select(
      'id, title, video_type, status, end_date, end_time, max_credits, creator_id, client_id'
    )
    .order('created_at', { ascending: false })

  const counts: Record<WorkStatus | 'all', number> = {
    all: works?.length || 0,
    ongoing: 0,
    in_review: 0,
    rework: 0,
    paused: 0,
    completed: 0,
  }
  ;(works || []).forEach((w) => {
    counts[w.status as WorkStatus]++
  })

  const visible =
    filterStatus && filterStatus !== 'all'
      ? (works || []).filter((w) => w.status === filterStatus)
      : works || []

  const clientIds = [...new Set(visible.map((w) => w.client_id))]
  const creatorIds = [...new Set(visible.map((w) => w.creator_id))]
  const workIds = visible.map((w) => w.id)

  const [{ data: clients }, { data: creators }, { data: workCredits }] =
    await Promise.all([
      supabase
        .from('clients')
        .select('id, name')
        .in('id', clientIds.length ? clientIds : [PLACEHOLDER]),
      supabase
        .from('memberships')
        .select('user_id, full_name')
        .in('user_id', creatorIds.length ? creatorIds : [PLACEHOLDER]),
      supabase
        .from('generations')
        .select('work_id, credits')
        .in('work_id', workIds.length ? workIds : [PLACEHOLDER]),
    ])

  const clientNameMap = new Map((clients || []).map((c) => [c.id, c.name]))
  const creatorNameMap = new Map(
    (creators || []).map((c) => [c.user_id, c.full_name])
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

  return (
    <div className="p-6 space-y-6 text-neutral-100">
      <div>
        <h1 className="text-2xl font-bold text-white">Works</h1>
        <p className="text-neutral-400 text-sm mt-1">
          {membership.role === 'creator'
            ? 'Your assigned works.'
            : 'All works across the organization.'}
        </p>
      </div>

      {/* TABS */}
      <div className="flex border-b border-neutral-800 gap-1 overflow-x-auto">
        <Link
          href="/app/works"
          className={`px-4 py-2 text-sm border-b-2 transition-colors whitespace-nowrap ${
            !filterStatus || filterStatus === 'all'
              ? 'border-lime-400 text-white'
              : 'border-transparent text-neutral-400 hover:text-white'
          }`}
        >
          All ({counts.all})
        </Link>
        {WORK_STATUSES.map((s) => (
          <Link
            key={s}
            href={`/app/works?status=${s}`}
            className={`px-4 py-2 text-sm border-b-2 transition-colors whitespace-nowrap ${
              filterStatus === s
                ? 'border-lime-400 text-white'
                : 'border-transparent text-neutral-400 hover:text-white'
            }`}
          >
            {WORK_STATUS_LABELS[s]} ({counts[s]})
          </Link>
        ))}
      </div>

      {/* WORK LIST */}
      {visible.length === 0 ? (
        <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-12 text-center">
          <p className="text-neutral-400">
            {!works || works.length === 0
              ? membership.role === 'creator'
                ? "You don't have any works assigned yet."
                : 'No works yet. Create one from a Client page.'
              : 'No works in this status.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {visible.map((w) => {
            const usedCredits = creditByWork.get(w.id) || 0
            const status = w.status as WorkStatus
            return (
              <Link
                key={w.id}
                href={`/app/works/${w.id}`}
                className="block bg-neutral-950 border border-neutral-800 hover:border-neutral-600 rounded-lg p-4 transition-colors group"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="font-semibold text-white group-hover:text-lime-400 truncate flex-1">
                    {w.title || w.video_type || 'Untitled'}
                  </h3>
                  <span
                    className={`text-xs px-2 py-0.5 rounded border ${WORK_STATUS_COLORS[status]} whitespace-nowrap`}
                  >
                    {WORK_STATUS_LABELS[status]}
                  </span>
                </div>
                <div className="text-sm text-neutral-400 mb-1">
                  {clientNameMap.get(w.client_id) || 'Unknown client'}
                </div>
                <div className="text-xs text-neutral-500 mb-3">
                  {w.video_type && <span>{w.video_type} · </span>}
                  {creatorNameMap.get(w.creator_id) || 'Unknown creator'}
                </div>
                <div className="flex items-end justify-between pt-3 border-t border-neutral-800">
                  <div className="text-xs text-neutral-500">
                    {formatDeadline(w.end_date, w.end_time) || 'No deadline'}
                  </div>
                  <div className="text-right">
                    <div className="text-base font-bold text-white">
                      {usedCredits.toFixed(1)}
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
            )
          })}
        </div>
      )}
    </div>
  )
}

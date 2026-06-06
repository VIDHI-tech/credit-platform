'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ViewToggle } from './view-toggle'
import { CalendarView } from './calendar-view'
import {
  WORK_STATUS_COLORS,
  WORK_STATUS_LABELS,
  type WorkStatus,
  formatDeadline,
  formatDateRange,
} from '@/lib/work-helpers'

type ViewMode = 'calendar' | 'cards'

interface WorkData {
  id: string
  title: string | null
  video_type: string | null
  status: string
  start_date: string | null
  end_date: string | null
  end_time: string | null
  max_credits: number | null
  creator_id: string
  client_id: string
}

interface Props {
  works: WorkData[]
  clientNameMap: Record<string, string>
  creatorNameMap: Record<string, string>
  /** Per-work ordered list of every creator user_id (primary first). */
  creatorIdsByWork: Record<string, string[]>
  creditByWork: Record<string, number>
}

export function WorksView({
  works,
  clientNameMap,
  creatorNameMap,
  creatorIdsByWork,
  creditByWork,
}: Props) {
  const [view, setView] = useState<ViewMode>('calendar')

  useEffect(() => {
    const saved = localStorage.getItem('works-view-mode')
    if (saved === 'calendar' || saved === 'cards') setView(saved)
  }, [])

  function handleViewChange(next: ViewMode) {
    setView(next)
    localStorage.setItem('works-view-mode', next)
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <ViewToggle view={view} onViewChange={handleViewChange} />
      </div>

      {view === 'calendar' ? (
        <CalendarView
          works={works.map((w) => ({
            id: w.id,
            title: w.title || w.video_type || 'Untitled',
            clientName: clientNameMap[w.client_id] || 'Unknown',
            status: w.status as WorkStatus,
            startDate: w.start_date,
            endDate: w.end_date,
          }))}
        />
      ) : (
        <>
          {works.length === 0 ? (
            <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-12 text-center">
              <p className="text-neutral-400">No works in this view.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {works.map((w) => {
                const usedCredits = creditByWork[w.id] || 0
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
                      {clientNameMap[w.client_id] || 'Unknown client'}
                    </div>
                    <div className="text-xs text-neutral-500 mb-3">
                      {w.video_type && <span>{w.video_type} · </span>}
                      {(() => {
                        const ids = creatorIdsByWork[w.id] || [w.creator_id]
                        const names = ids.map(
                          (id) => creatorNameMap[id] || 'Unknown',
                        )
                        if (names.length <= 2) return names.join(', ')
                        return `${names.slice(0, 2).join(', ')} +${names.length - 2}`
                      })()}
                    </div>
                    <div className="flex items-end justify-between pt-3 border-t border-neutral-800">
                      <div className="text-xs text-neutral-500">
                        {formatDateRange(w.start_date, w.end_date) || 'No deadline'}
                      </div>
                      <div className="text-right">
                        <div className="text-base font-bold text-white">
                          {usedCredits.toFixed(1)}
                          {w.max_credits && (
                            <span className="text-neutral-500 text-xs">
                              {' '}/ {w.max_credits}
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
        </>
      )}
    </div>
  )
}

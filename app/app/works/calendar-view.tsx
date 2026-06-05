'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { WORK_STATUS_COLORS, type WorkStatus } from '@/lib/work-helpers'

interface WorkItem {
  id: string
  title: string
  clientName: string
  status: WorkStatus
  endDate: string | null // YYYY-MM-DD
}

interface Props {
  works: WorkItem[]
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

function getFirstDayOfWeek(year: number, month: number) {
  return new Date(year, month, 1).getDay()
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function CalendarView({ works }: Props) {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())

  function prevMonth() {
    if (month === 0) {
      setMonth(11)
      setYear(year - 1)
    } else {
      setMonth(month - 1)
    }
  }

  function nextMonth() {
    if (month === 11) {
      setMonth(0)
      setYear(year + 1)
    } else {
      setMonth(month + 1)
    }
  }

  function goToday() {
    setYear(now.getFullYear())
    setMonth(now.getMonth())
  }

  const daysInMonth = getDaysInMonth(year, month)
  const firstDay = getFirstDayOfWeek(year, month)

  // Build a map: "YYYY-MM-DD" → works[]
  const worksByDate = new Map<string, WorkItem[]>()
  const noDeadline: WorkItem[] = []
  works.forEach((w) => {
    if (!w.endDate) {
      noDeadline.push(w)
      return
    }
    const existing = worksByDate.get(w.endDate) || []
    existing.push(w)
    worksByDate.set(w.endDate, existing)
  })

  const cells: (number | null)[] = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  // Pad to full rows
  while (cells.length % 7 !== 0) cells.push(null)

  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  return (
    <div className="space-y-4">
      {/* MONTH NAV */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={prevMonth}
            className="p-1.5 rounded hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
          >
            <ChevronLeft className="size-5" />
          </button>
          <h2 className="text-lg font-semibold text-white min-w-[180px] text-center">
            {MONTH_NAMES[month]} {year}
          </h2>
          <button
            onClick={nextMonth}
            className="p-1.5 rounded hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
          >
            <ChevronRight className="size-5" />
          </button>
        </div>
        <button
          onClick={goToday}
          className="text-xs text-lime-400 hover:underline"
        >
          Today
        </button>
      </div>

      {/* DAY HEADERS */}
      <div className="grid grid-cols-7 gap-px bg-neutral-800 rounded-lg overflow-hidden">
        {DAY_NAMES.map((d) => (
          <div
            key={d}
            className="bg-neutral-900 px-2 py-2 text-center text-xs text-neutral-500 font-medium"
          >
            {d}
          </div>
        ))}

        {/* DAY CELLS */}
        {cells.map((day, i) => {
          if (day === null) {
            return <div key={`empty-${i}`} className="bg-neutral-950 min-h-[100px]" />
          }
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const dayWorks = worksByDate.get(dateStr) || []
          const isToday = dateStr === todayStr

          return (
            <div
              key={dateStr}
              className={`bg-neutral-950 min-h-[100px] p-1.5 ${
                isToday ? 'ring-1 ring-inset ring-lime-400/50' : ''
              }`}
            >
              <div
                className={`text-xs mb-1 ${
                  isToday
                    ? 'text-lime-400 font-bold'
                    : 'text-neutral-500'
                }`}
              >
                {day}
              </div>
              <div className="space-y-0.5">
                {dayWorks.slice(0, 3).map((w) => (
                  <Link
                    key={w.id}
                    href={`/app/works/${w.id}`}
                    className={`block text-[10px] leading-tight px-1 py-0.5 rounded truncate border ${WORK_STATUS_COLORS[w.status]} hover:opacity-80 transition-opacity`}
                  >
                    {w.title || 'Untitled'}
                  </Link>
                ))}
                {dayWorks.length > 3 && (
                  <div className="text-[10px] text-neutral-500 px-1">
                    +{dayWorks.length - 3} more
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* NO DEADLINE ROW */}
      {noDeadline.length > 0 && (
        <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3">
          <div className="text-xs text-neutral-500 mb-2">
            No deadline ({noDeadline.length})
          </div>
          <div className="flex flex-wrap gap-1.5">
            {noDeadline.map((w) => (
              <Link
                key={w.id}
                href={`/app/works/${w.id}`}
                className={`text-[11px] px-2 py-1 rounded border ${WORK_STATUS_COLORS[w.status]} hover:opacity-80 transition-opacity`}
              >
                {w.title || 'Untitled'} · {w.clientName}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// lib/work-helpers.ts — work status constants, transitions, helpers.

export const WORK_STATUSES = [
  'ongoing',
  'in_review',
  'rework',
  'paused',
  'completed',
] as const

export type WorkStatus = (typeof WORK_STATUSES)[number]

export const WORK_STATUS_LABELS: Record<WorkStatus, string> = {
  ongoing: 'Ongoing',
  in_review: 'In Review',
  rework: 'Rework',
  paused: 'Paused',
  completed: 'Completed',
}

export const WORK_STATUS_COLORS: Record<WorkStatus, string> = {
  ongoing: 'bg-blue-900/40 text-blue-300 border-blue-700',
  in_review: 'bg-purple-900/40 text-purple-300 border-purple-700',
  rework: 'bg-orange-900/40 text-orange-300 border-orange-700',
  paused: 'bg-neutral-800 text-neutral-400 border-neutral-700',
  completed: 'bg-green-900/40 text-green-300 border-green-700',
}

type Transition = {
  to: WorkStatus
  label: string
  variant: 'primary' | 'danger' | 'success' | 'secondary'
}

/**
 * What status transitions are allowed for the given role from the current status.
 * Source of truth for UI buttons — mirrored server-side in the status API route.
 */
export function allowedTransitions(
  currentStatus: WorkStatus,
  role: 'master' | 'manager' | 'creator',
  isOwnWork: boolean
): Transition[] {
  const transitions: Transition[] = []

  // Creator on their own work: ongoing/rework → in_review
  if (
    isOwnWork &&
    (currentStatus === 'ongoing' || currentStatus === 'rework')
  ) {
    transitions.push({
      to: 'in_review',
      label: 'Send for Review',
      variant: 'primary',
    })
  }

  // Master/manager actions
  if (role === 'master' || role === 'manager') {
    if (currentStatus === 'ongoing' || currentStatus === 'rework') {
      transitions.push({ to: 'paused', label: 'Pause', variant: 'secondary' })
    }
    if (currentStatus === 'paused') {
      transitions.push({ to: 'ongoing', label: 'Resume', variant: 'primary' })
    }
    if (currentStatus === 'in_review') {
      transitions.push({
        to: 'rework',
        label: 'Send to Rework',
        variant: 'danger',
      })
      transitions.push({
        to: 'completed',
        label: 'Mark Completed',
        variant: 'success',
      })
    }
  }

  return transitions
}

/**
 * Format date/time fields into a single readable deadline string.
 */
export function formatDeadline(
  end_date: string | null,
  end_time: string | null
): string | null {
  if (!end_date) return null
  const date = new Date(end_date + (end_time ? `T${end_time}` : 'T23:59'))
  return (
    date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }) +
    (end_time
      ? ' · ' +
        date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      : '')
  )
}

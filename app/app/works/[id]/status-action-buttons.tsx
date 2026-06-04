'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import type { WorkStatus } from '@/lib/work-helpers'

interface Transition {
  to: WorkStatus
  label: string
  variant: 'primary' | 'danger' | 'success' | 'secondary'
}

interface Props {
  workId: string
  transitions: Transition[]
}

const colors: Record<Transition['variant'], string> = {
  primary: 'bg-lime-400 hover:bg-lime-300 text-black font-semibold',
  danger: 'bg-orange-600 hover:bg-orange-500 text-white',
  success: 'bg-green-600 hover:bg-green-500 text-white',
  secondary: 'bg-neutral-700 hover:bg-neutral-600 text-white',
}

export function StatusActionButtons({ workId, transitions }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleTransition(toStatus: WorkStatus) {
    setBusy(toStatus)
    setError(null)
    const res = await fetch(`/api/works/${workId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: toStatus }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error || 'Transition failed')
      setBusy(null)
      return
    }
    router.refresh()
    setBusy(null)
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-2">
        {transitions.map((t) => (
          <Button
            key={t.to}
            onClick={() => handleTransition(t.to)}
            disabled={busy !== null}
            className={colors[t.variant]}
            size="sm"
          >
            {busy === t.to ? '…' : t.label}
          </Button>
        ))}
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}

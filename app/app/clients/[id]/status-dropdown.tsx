'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  CLIENT_STATUSES,
  CLIENT_STATUS_LABELS,
  CLIENT_STATUS_COLORS,
  type ClientStatus,
} from '@/lib/client-helpers'

interface Props {
  clientId: string
  currentStatus: ClientStatus
}

export function StatusDropdown({ clientId, currentStatus }: Props) {
  const router = useRouter()
  const [status, setStatus] = useState<ClientStatus>(currentStatus)
  const [busy, setBusy] = useState(false)
  const [isPending, startTransition] = useTransition()

  async function handleChange(value: string) {
    const newStatus = value as ClientStatus
    setStatus(newStatus)
    setBusy(true)

    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('clients')
        .update({ status: newStatus })
        .eq('id', clientId)

      if (error) {
        console.error('Status update failed:', error)
        setStatus(currentStatus) // revert on error
      } else {
        startTransition(() => {
          router.refresh()
        })
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Select
      value={status}
      onValueChange={(v) => handleChange(v as string)}
      disabled={busy || isPending}
    >
      <SelectTrigger
        className={`w-36 h-8 text-xs border ${CLIENT_STATUS_COLORS[status]}`}
      >
        <SelectValue>
          {(v) => {
            const val = v as ClientStatus | null
            return val ? CLIENT_STATUS_LABELS[val] : 'Status'
          }}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {CLIENT_STATUSES.map((s) => (
          <SelectItem key={s} value={s} className="text-xs">
            {CLIENT_STATUS_LABELS[s]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

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
  // Local state seeded once from the server-rendered prop. The client
  // component instance survives router.refresh() (same mount), so the value
  // the user just picked stays put through the refresh — no flicker, no
  // useEffect-driven re-sync (which trips react-hooks/set-state-in-effect).
  const [status, setStatus] = useState<ClientStatus>(currentStatus)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  async function handleChange(value: string) {
    const newStatus = value as ClientStatus
    if (newStatus === status) return
    const prev = status
    setStatus(newStatus)
    setBusy(true)
    setError(null)

    try {
      const supabase = createClient()
      const { data, error: updateError } = await supabase
        .from('clients')
        .update({ status: newStatus })
        .eq('id', clientId)
        .select('id')

      if (updateError) {
        console.error('[status-dropdown] update failed:', updateError)
        setStatus(prev)
        setError(updateError.message)
        return
      }
      // RLS may silently filter the UPDATE (policy denies → 0 rows touched,
      // no error). Verify here so the UI never lies about persistence.
      if (!data || data.length === 0) {
        setStatus(prev)
        setError('Not permitted — no row updated')
        return
      }
      startTransition(() => {
        router.refresh()
      })
    } catch (err) {
      setStatus(prev)
      setError(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Select
        value={status}
        onValueChange={(v) => handleChange(v as string)}
        disabled={busy}
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
      {(busy || isPending) && (
        <span className="text-[10px] text-neutral-500">Saving…</span>
      )}
      {error && (
        <span className="text-[10px] text-red-400 max-w-[200px] text-right">
          {error}
        </span>
      )}
    </div>
  )
}

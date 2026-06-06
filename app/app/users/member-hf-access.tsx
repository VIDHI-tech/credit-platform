'use client'

// app/app/users/member-hf-access.tsx — inline HF account access controls
// shown in every Active Member row (master only). Renders a compact
// "K / N HF" pill that expands into a per-connection toggle panel.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { ChevronDown, ChevronRight, Check } from 'lucide-react'

interface HfConnection {
  id: string
  label: string
  hf_email: string | null
}

interface Grant {
  id: string
  connection_id: string
  user_id: string
}

interface Props {
  orgId: string
  memberUserId: string
  /** false for non-master viewers / for member roles that don't take grants
   *  (master role doesn't need grants — they see all). */
  enabled: boolean
  connections: HfConnection[]
  initialGrants: Grant[]
}

export function MemberHfAccess({
  orgId,
  memberUserId,
  enabled,
  connections,
  initialGrants,
}: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [grants, setGrants] = useState<Grant[]>(initialGrants)
  const [busy, setBusy] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Filter to grants for THIS member.
  const memberGrants = grants.filter((g) => g.user_id === memberUserId)
  const granted = (connId: string) =>
    memberGrants.some((g) => g.connection_id === connId)
  const grantIdFor = (connId: string) =>
    memberGrants.find((g) => g.connection_id === connId)?.id

  async function toggle(connId: string) {
    const key = `${memberUserId}:${connId}`
    setBusy(key)
    setError(null)
    const supabase = createClient()
    const existingId = grantIdFor(connId)

    // Snapshot for revert-on-error.
    const snapshot = grants

    if (existingId) {
      // Optimistic delete
      setGrants((prev) => prev.filter((g) => g.id !== existingId))
      const { error: err } = await supabase
        .from('hf_connection_grants')
        .delete()
        .eq('id', existingId)
      if (err) {
        setGrants(snapshot)
        setError(err.message)
        setBusy(null)
        return
      }
    } else {
      const { data, error: err } = await supabase
        .from('hf_connection_grants')
        .insert({ org_id: orgId, connection_id: connId, user_id: memberUserId })
        .select('id, connection_id, user_id')
        .single()
      if (err) {
        setError(err.message)
        setBusy(null)
        return
      }
      if (data) setGrants((prev) => [...prev, data])
    }
    setBusy(null)
    startTransition(() => {
      router.refresh()
    })
  }

  async function grantAll() {
    setBusy(`all:${memberUserId}`)
    setError(null)
    const missing = connections.filter((c) => !granted(c.id))
    if (missing.length === 0) {
      setBusy(null)
      return
    }
    const supabase = createClient()
    const rows = missing.map((c) => ({
      org_id: orgId,
      connection_id: c.id,
      user_id: memberUserId,
    }))
    const { data, error: err } = await supabase
      .from('hf_connection_grants')
      .insert(rows)
      .select('id, connection_id, user_id')
    if (err) {
      setError(err.message)
      setBusy(null)
      return
    }
    if (data) setGrants((prev) => [...prev, ...data])
    setBusy(null)
    startTransition(() => {
      router.refresh()
    })
  }

  async function revokeAll() {
    setBusy(`all:${memberUserId}`)
    setError(null)
    if (memberGrants.length === 0) {
      setBusy(null)
      return
    }
    const supabase = createClient()
    // Snapshot for revert-on-error.
    const snapshot = grants
    // Optimistic remove
    setGrants((prev) => prev.filter((g) => g.user_id !== memberUserId))
    const { error: err } = await supabase
      .from('hf_connection_grants')
      .delete()
      .in(
        'id',
        memberGrants.map((g) => g.id),
      )
    if (err) {
      setGrants(snapshot)
      setError(err.message)
      setBusy(null)
      return
    }
    setBusy(null)
    startTransition(() => {
      router.refresh()
    })
  }

  // Nothing to render when there are no connections at all.
  if (connections.length === 0) return null

  // For roles that don't take HF grants (e.g. master is auto-allowed),
  // show a passive label rather than the toggle.
  if (!enabled) {
    return (
      <div className="text-[10px] text-neutral-500 uppercase tracking-wider">
        Master access
      </div>
    )
  }

  const grantedCount = memberGrants.length
  const disabled = busy !== null || isPending

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-white px-2 py-1 rounded border border-neutral-800 bg-neutral-900/50 hover:border-neutral-700 transition-colors"
      >
        {open ? (
          <ChevronDown className="size-3" />
        ) : (
          <ChevronRight className="size-3" />
        )}
        <span className="font-mono">
          {grantedCount}/{connections.length}
        </span>
        <span>HF</span>
      </button>

      {open && (
        <div className="absolute right-4 mt-9 z-20 w-80 max-w-[90vw] bg-neutral-950 border border-neutral-800 rounded-lg shadow-xl p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xs text-neutral-400">
              Higgsfield account access
            </div>
            <div className="flex gap-2 text-xs">
              <button
                type="button"
                onClick={grantAll}
                disabled={disabled || grantedCount === connections.length}
                className="text-lime-400 hover:underline disabled:text-neutral-700 disabled:no-underline"
              >
                Grant all
              </button>
              <span className="text-neutral-700">·</span>
              <button
                type="button"
                onClick={revokeAll}
                disabled={disabled || grantedCount === 0}
                className="text-red-400 hover:underline disabled:text-neutral-700 disabled:no-underline"
              >
                Revoke all
              </button>
            </div>
          </div>

          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {connections.map((conn) => {
              const isGranted = granted(conn.id)
              const key = `${memberUserId}:${conn.id}`
              const rowBusy =
                busy === key || busy === `all:${memberUserId}` || isPending
              return (
                <button
                  key={conn.id}
                  type="button"
                  disabled={rowBusy}
                  onClick={() => toggle(conn.id)}
                  className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-md border transition-colors text-left ${
                    isGranted
                      ? 'border-lime-800 bg-lime-950/30'
                      : 'border-neutral-800 bg-neutral-900/30 hover:border-neutral-700'
                  } ${rowBusy ? 'opacity-60' : ''}`}
                >
                  <div className="min-w-0">
                    <div className="text-sm text-white truncate">
                      {conn.label}
                    </div>
                    {conn.hf_email && (
                      <div className="text-xs text-neutral-500 truncate">
                        {conn.hf_email}
                      </div>
                    )}
                  </div>
                  {isGranted ? (
                    <div className="size-5 rounded-full bg-lime-400 flex items-center justify-center shrink-0">
                      <Check className="size-3 text-black" />
                    </div>
                  ) : (
                    <div className="size-5 rounded-full border-2 border-neutral-600 shrink-0" />
                  )}
                </button>
              )
            })}
          </div>

          {error && (
            <div className="text-xs text-red-400 px-1">{error}</div>
          )}
        </div>
      )}
    </div>
  )
}

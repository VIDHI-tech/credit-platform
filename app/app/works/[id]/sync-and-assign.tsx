'use client'

// app/app/works/[id]/sync-and-assign.tsx — right-hand 50% container that
// drives a two-step modal flow:
//   1. Click "Sync & Assign"  → POST /api/hf-sync   (button → "Syncing…")
//      → on success, fetch unassigned generations → open MODAL A.
//   2. MODAL A — multi-select unassigned generations. Sticky header with
//      "Assign" + "Cancel". "Assign" opens MODAL B.
//   3. MODAL B — pick a client (defaulted to the current work's client) and
//      hit "Actual usage" or "Wastage". Both buttons fan out per-selected
//      generation:
//        - Actual usage → POST /api/works/{workId}/assign-generation
//                          with { generationId, clientId } per gen
//        - Wastage     → POST /api/generations/{generationId}/waste
//                          with { is_waste: true } per gen
//
// After the batch settles, the modal closes, the selection clears, and
// router.refresh() pulls the new server state so the Assigned + Wastage
// tables below update.

import { useState, useEffect, useCallback, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Check, X, RefreshCw } from 'lucide-react'

interface UnassignedGeneration {
  id: string
  display_name: string
  result_url: string
  media_type: string
  credits: string
  hf_created_at: string
  hf_connection_label: string | null
}

interface ClientOption {
  id: string
  name: string
}

interface Props {
  workId: string
  clientId: string
  clientName: string
  userRole: 'master' | 'manager' | 'creator'
}

function MediaPreview({
  url,
  mediaType,
  name,
}: {
  url: string
  mediaType: string
  name: string
}) {
  if (mediaType === 'video') {
    return (
      <video
        src={url}
        className="w-14 h-10 rounded object-cover bg-black"
        preload="metadata"
        muted
      />
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={name}
      className="w-14 h-10 rounded object-cover bg-neutral-800"
      loading="lazy"
    />
  )
}

export function SyncAndAssign({ workId, clientId, clientName, userRole }: Props) {
  const router = useRouter()
  const [supabase] = useState(() => createClient())

  // useTransition tracks router.refresh() as a pending React state so the
  // button stays disabled until the server-rendered tree has actually updated
  // — no flicker of "enabled" between the API response and the UI catching up.
  const [isPending, startTransition] = useTransition()

  // Button-level
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)

  // Modal A — picker
  const [pickerOpen, setPickerOpen] = useState(false)
  const [unassigned, setUnassigned] = useState<UnassignedGeneration[]>([])
  const [loadingUnassigned, setLoadingUnassigned] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [accountFilter, setAccountFilter] = useState<string | null>(null)

  // Modal B — destination
  const [destOpen, setDestOpen] = useState(false)
  const [clients, setClients] = useState<ClientOption[]>([])
  const [destClientId, setDestClientId] = useState<string>(clientId)
  const [batchBusy, setBatchBusy] = useState<null | 'actual' | 'waste'>(null)
  const [batchError, setBatchError] = useState<string | null>(null)

  // Load the unassigned list (called after a successful sync and any time the
  // modal needs a refresh — e.g. on first manual open if user clicks again).
  const loadUnassigned = useCallback(async () => {
    setLoadingUnassigned(true)
    const { data } = await supabase
      .from('generations')
      .select(
        'id, display_name, result_url, media_type, credits, hf_created_at, hf_connection_label, is_waste',
      )
      .is('client_id', null)
      .order('hf_created_at', { ascending: false })
    // Exclude already-wasted entries — they belong to the Wastage table below.
    const useful = (data || []).filter((g) => !g.is_waste)
    setUnassigned(useful as UnassignedGeneration[])
    setLoadingUnassigned(false)
  }, [supabase])

  // Load the client dropdown when the destination modal opens.
  useEffect(() => {
    if (!destOpen) return
    let cancelled = false
    async function load() {
      const { data } = await supabase
        .from('clients')
        .select('id, name')
        .order('name')
      if (!cancelled) setClients(data || [])
    }
    load()
    return () => {
      cancelled = true
    }
  }, [destOpen, supabase])

  async function handleSync() {
    setSyncing(true)
    setSyncError(null)
    setSyncMessage(null)
    try {
      const res = await fetch('/api/hf-sync', { method: 'POST' })
      if (res.status === 409) {
        setSyncError(
          userRole === 'master'
            ? 'No Higgsfield account connected. Go to Settings to add one.'
            : "You don't have access to any Higgsfield account yet. Ask your admin to grant you access.",
        )
        return
      }
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setSyncError(`Sync failed: ${data?.error || 'unknown error'}`)
        return
      }
      setSyncMessage(data?.message || 'Sync complete.')
      // Reload unassigned and open picker
      await loadUnassigned()
      setSelectedIds(new Set())
      setAccountFilter(null)
      setPickerOpen(true)
      // Keep the Assigned/Wastage tables fresh too — wrapped in a transition
      // so the Sync button stays disabled until the refresh completes.
      startTransition(() => {
        router.refresh()
      })
    } catch (err) {
      setSyncError(
        `Sync failed: ${err instanceof Error ? err.message : 'network error'}`,
      )
    } finally {
      setSyncing(false)
    }
  }

  function toggleSelect(genId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(genId)) next.delete(genId)
      else next.add(genId)
      return next
    })
  }

  const visibleUnassigned = accountFilter
    ? unassigned.filter((g) => g.hf_connection_label === accountFilter)
    : unassigned

  const allVisibleSelected =
    visibleUnassigned.length > 0 &&
    visibleUnassigned.every((g) => selectedIds.has(g.id))

  function toggleSelectAllVisible() {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allVisibleSelected) {
        visibleUnassigned.forEach((g) => next.delete(g.id))
      } else {
        visibleUnassigned.forEach((g) => next.add(g.id))
      }
      return next
    })
  }

  // The available account labels for the filter chips
  const availableAccounts = Array.from(
    new Set(unassigned.map((g) => g.hf_connection_label).filter(Boolean)),
  ) as string[]

  function openDestination() {
    if (selectedIds.size === 0) return
    setDestClientId(clientId) // default to current work's client
    setBatchError(null)
    setDestOpen(true)
  }

  async function runBatch(mode: 'actual' | 'waste') {
    if (selectedIds.size === 0) return
    if (mode === 'actual' && !destClientId) {
      setBatchError('Pick a client first.')
      return
    }
    setBatchBusy(mode)
    setBatchError(null)
    const ids = Array.from(selectedIds)

    const failures: string[] = []
    if (mode === 'actual') {
      const results = await Promise.all(
        ids.map(async (gid) => {
          const res = await fetch(`/api/works/${workId}/assign-generation`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ generationId: gid, clientId: destClientId }),
          })
          if (!res.ok) {
            const d = await res.json().catch(() => ({}))
            failures.push(`${gid.slice(0, 8)}: ${d?.error || res.statusText}`)
          }
        }),
      )
      void results
    } else {
      const results = await Promise.all(
        ids.map(async (gid) => {
          const res = await fetch(`/api/generations/${gid}/waste`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_waste: true }),
          })
          if (!res.ok) {
            const d = await res.json().catch(() => ({}))
            failures.push(`${gid.slice(0, 8)}: ${d?.error || res.statusText}`)
          }
        }),
      )
      void results
    }

    setBatchBusy(null)
    if (failures.length > 0 && failures.length === ids.length) {
      setBatchError(`All ${failures.length} failed: ${failures.slice(0, 3).join('; ')}`)
      return
    }
    if (failures.length > 0) {
      setBatchError(
        `${failures.length} of ${ids.length} failed: ${failures.slice(0, 3).join('; ')}`,
      )
    }
    // Refresh and close — close picker too because those rows are gone now.
    setDestOpen(false)
    setPickerOpen(false)
    setSelectedIds(new Set())
    // Wrap in a transition so the action buttons stay disabled until the
    // server-rendered Assigned/Wastage tables actually update.
    startTransition(() => {
      router.refresh()
    })
  }

  return (
    <>
      <section className="bg-neutral-950 border border-neutral-800 rounded-lg overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b border-neutral-800">
          <h2 className="font-semibold text-white text-sm">Sync &amp; Assign</h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Pull fresh generations from Higgsfield, then pick which ones to
            attribute to a client.
          </p>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 gap-4">
          <Button
            onClick={handleSync}
            disabled={syncing || isPending}
            size="lg"
            className="bg-lime-400 hover:bg-lime-300 text-black font-semibold min-w-[14rem]"
          >
            {syncing || isPending ? (
              <>
                <RefreshCw className="size-4 mr-2 animate-spin" />
                {syncing ? 'Syncing…' : 'Updating…'}
              </>
            ) : (
              <>
                <RefreshCw className="size-4 mr-2" />
                Sync &amp; Assign
              </>
            )}
          </Button>
          {syncMessage && !syncError && (
            <p className="text-xs text-lime-400 text-center max-w-md">
              ✓ {syncMessage}
            </p>
          )}
          {syncError && (
            <div className="bg-red-950/50 border border-red-800 text-red-300 px-3 py-2 rounded text-xs flex items-center justify-between gap-2 max-w-md">
              <span>{syncError}</span>
              {syncError.includes('Settings') && (
                <a
                  href="/app/settings"
                  className="text-lime-400 hover:underline shrink-0"
                >
                  Open Settings →
                </a>
              )}
            </div>
          )}
        </div>
      </section>

      {/* MODAL A — picker */}
      {pickerOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={() => !batchBusy && !isPending && setPickerOpen(false)}
        >
          <div
            className="bg-neutral-950 border border-neutral-800 rounded-lg max-w-6xl w-full max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* STICKY HEADER */}
            <div className="sticky top-0 z-10 bg-neutral-950 border-b border-neutral-800 px-4 py-3">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                  <h2 className="font-semibold text-white text-sm">
                    Pick generations to attribute
                  </h2>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    {selectedIds.size} of {visibleUnassigned.length} selected
                    {accountFilter ? ` · filtered: ${accountFilter}` : ''}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setPickerOpen(false)}
                    disabled={batchBusy !== null || isPending}
                    className="h-8 text-xs"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={openDestination}
                    disabled={
                      selectedIds.size === 0 ||
                      batchBusy !== null ||
                      isPending
                    }
                    className="h-8 text-xs bg-lime-400 hover:bg-lime-300 text-black font-semibold"
                  >
                    Assign ({selectedIds.size})
                  </Button>
                </div>
              </div>

              {/* Filter chips */}
              {availableAccounts.length > 0 && (
                <div className="flex flex-wrap gap-1.5 items-center">
                  <span className="text-[10px] text-neutral-500 uppercase tracking-wider mr-1">
                    Account:
                  </span>
                  <button
                    type="button"
                    onClick={() => setAccountFilter(null)}
                    className={`text-xs px-2 py-0.5 rounded transition-colors ${
                      accountFilter === null
                        ? 'bg-lime-400 text-black'
                        : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                    }`}
                  >
                    All
                  </button>
                  {availableAccounts.map((label) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setAccountFilter(label)}
                      className={`text-xs px-2 py-0.5 rounded transition-colors ${
                        accountFilter === label
                          ? 'bg-lime-400 text-black'
                          : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                  <span className="text-neutral-700 mx-1">·</span>
                  <button
                    type="button"
                    onClick={toggleSelectAllVisible}
                    disabled={visibleUnassigned.length === 0}
                    className="text-xs text-lime-400 hover:underline disabled:text-neutral-600 disabled:no-underline"
                  >
                    {allVisibleSelected ? 'Deselect all' : 'Select all'}
                  </button>
                </div>
              )}
            </div>

            {/* LIST */}
            <div className="flex-1 overflow-auto">
              {loadingUnassigned ? (
                <div className="p-8 text-center text-neutral-500 text-sm">
                  Loading…
                </div>
              ) : visibleUnassigned.length === 0 ? (
                <div className="p-8 text-center text-neutral-500 text-sm">
                  <p>No unassigned generations.</p>
                  <p className="text-xs mt-1">
                    {accountFilter
                      ? 'Try clearing the account filter or sync again.'
                      : 'Sync again later for new entries.'}
                  </p>
                </div>
              ) : (
                <table className="w-full text-xs">
                  <tbody className="divide-y divide-neutral-800">
                    {visibleUnassigned.map((g) => {
                      const checked = selectedIds.has(g.id)
                      return (
                        <tr
                          key={g.id}
                          onClick={() => toggleSelect(g.id)}
                          className={`cursor-pointer transition-colors ${
                            checked
                              ? 'bg-lime-950/30'
                              : 'hover:bg-neutral-900/60'
                          }`}
                        >
                          <td className="px-3 py-2 w-8">
                            <div
                              className={`size-5 rounded border-2 flex items-center justify-center transition-colors ${
                                checked
                                  ? 'border-lime-400 bg-lime-400'
                                  : 'border-neutral-600 bg-transparent'
                              }`}
                            >
                              {checked && (
                                <Check className="size-3 text-black" />
                              )}
                            </div>
                          </td>
                          <td className="px-2 py-2">
                            <MediaPreview
                              url={g.result_url}
                              mediaType={g.media_type}
                              name={g.display_name}
                            />
                          </td>
                          <td className="px-2 py-2">
                            <div className="font-medium text-white">
                              {g.display_name}
                            </div>
                            {g.hf_connection_label && (
                              <div className="text-[10px] text-neutral-500 mt-0.5">
                                from{' '}
                                <span className="text-lime-400">
                                  {g.hf_connection_label}
                                </span>
                              </div>
                            )}
                          </td>
                          <td className="px-2 py-2 text-right">
                            <span
                              className={`font-bold ${
                                parseFloat(g.credits) > 0
                                  ? 'text-orange-400'
                                  : 'text-neutral-500'
                              }`}
                            >
                              {parseFloat(g.credits) > 0
                                ? parseFloat(g.credits).toFixed(1)
                                : 'free'}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL B — destination */}
      {destOpen && (
        <div
          className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4"
          onClick={() => !batchBusy && !isPending && setDestOpen(false)}
        >
          <div
            className="bg-neutral-950 border border-neutral-800 rounded-lg max-w-md w-full flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-white text-sm">
                  Assign {selectedIds.size} generation
                  {selectedIds.size === 1 ? '' : 's'}
                </h2>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Pick the destination client, then mark as actual usage or
                  wastage.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  !batchBusy && !isPending && setDestOpen(false)
                }
                disabled={batchBusy !== null || isPending}
                className="p-1 rounded hover:bg-neutral-800 transition-colors disabled:opacity-40"
              >
                <X className="size-4 text-neutral-400" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div>
                <label className="text-xs text-neutral-400 uppercase tracking-wider">
                  Client
                </label>
                <Select
                  value={destClientId}
                  onValueChange={(v) => setDestClientId(v as string)}
                  disabled={batchBusy !== null || isPending}
                >
                  <SelectTrigger className="mt-1 bg-neutral-900 border-neutral-700">
                    <SelectValue>
                      {(v) => {
                        const val = v as string | null
                        if (!val) return 'Pick a client'
                        const found = clients.find((c) => c.id === val)
                        if (found) return found.name
                        if (val === clientId) return clientName
                        return val
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {clients.length === 0 ? (
                      <div className="px-2 py-1.5 text-xs text-neutral-500">
                        Loading clients…
                      </div>
                    ) : (
                      clients.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                          {c.id === clientId && (
                            <Badge
                              variant="outline"
                              className="ml-2 text-lime-300 border-lime-700 text-[10px]"
                            >
                              this work
                            </Badge>
                          )}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                {destClientId !== clientId && (
                  <div className="mt-2 bg-yellow-950/30 border border-yellow-800 text-yellow-300 px-3 py-2 rounded text-xs">
                    Heads-up: you&apos;re assigning to a different client. These
                    generations will not appear in this work&apos;s totals.
                  </div>
                )}
              </div>

              {batchError && (
                <div className="bg-red-950/50 border border-red-800 text-red-300 px-3 py-2 rounded text-xs">
                  {batchError}
                </div>
              )}
            </div>

            <div className="px-4 py-3 border-t border-neutral-800 flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => runBatch('waste')}
                disabled={batchBusy !== null || isPending || selectedIds.size === 0}
                className="text-yellow-400 border-yellow-700 hover:bg-yellow-950"
              >
                {batchBusy === 'waste'
                  ? 'Marking…'
                  : isPending
                    ? 'Updating…'
                    : 'Wastage'}
              </Button>
              <Button
                onClick={() => runBatch('actual')}
                disabled={batchBusy !== null || isPending || selectedIds.size === 0}
                className="bg-lime-400 hover:bg-lime-300 text-black font-semibold"
              >
                {batchBusy === 'actual'
                  ? 'Assigning…'
                  : isPending
                    ? 'Updating…'
                    : 'Actual usage'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

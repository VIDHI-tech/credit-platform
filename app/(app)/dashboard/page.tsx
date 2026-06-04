// app/(app)/dashboard/page.tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface Client {
  id: string
  name: string
  industry: string
}

interface Generation {
  id: string
  external_id: string
  display_name: string
  job_set_type: string
  result_url: string
  media_type: string
  prompt: string
  credits: string // NUMERIC comes back as string from Supabase
  hf_created_at: string
  client_id: string | null
  assigned_at: string | null
}

interface ClientTotal {
  client_id: string
  client_name: string
  total_credits: number
  generation_count: number
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
        className="w-16 h-12 rounded object-cover bg-black"
        preload="metadata"
        muted
        onMouseEnter={(e) => {
          void (e.currentTarget as HTMLVideoElement).play()
        }}
        onMouseLeave={(e) => {
          const v = e.currentTarget as HTMLVideoElement
          v.pause()
          v.currentTime = 0
        }}
      />
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={name}
      className="w-16 h-12 rounded object-cover bg-neutral-800"
      loading="lazy"
    />
  )
}

export default function DashboardPage() {
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [clients, setClients] = useState<Client[]>([])
  const [unassigned, setUnassigned] = useState<Generation[]>([])
  const [clientTotals, setClientTotals] = useState<ClientTotal[]>([])
  const [assigning, setAssigning] = useState<string | null>(null) // id being assigned

  const loadData = useCallback(async () => {
    // Load clients
    const { data: clientData } = await supabase
      .from('clients')
      .select('id, name, industry')
      .order('name')
    setClients(clientData || [])

    // Load unassigned generations
    const { data: unassignedData } = await supabase
      .from('generations')
      .select('*')
      .is('client_id', null)
      .order('hf_created_at', { ascending: false })
    setUnassigned(unassignedData || [])

    // Load client totals
    const { data: assignedData } = await supabase
      .from('generations')
      .select('client_id, credits')
      .not('client_id', 'is', null)

    if (assignedData && clientData) {
      const totals = new Map<string, { credits: number; count: number }>()
      assignedData.forEach((row) => {
        if (row.client_id) {
          const existing = totals.get(row.client_id) || { credits: 0, count: 0 }
          totals.set(row.client_id, {
            credits: existing.credits + parseFloat(row.credits || '0'),
            count: existing.count + 1,
          })
        }
      })

      const totalsArray: ClientTotal[] = Array.from(totals.entries())
        .map(([clientId, { credits, count }]) => ({
          client_id: clientId,
          client_name: clientData.find((c) => c.id === clientId)?.name || 'Unknown',
          total_credits: credits,
          generation_count: count,
        }))
        .sort((a, b) => b.total_credits - a.total_credits)

      setClientTotals(totalsArray)
    }
  }, [])

  useEffect(() => {
    // Wrapped in an inline async fn so state updates land after the await
    // boundary (satisfies react-hooks/set-state-in-effect).
    async function init() {
      await loadData()
    }
    init()
  }, [loadData])

  async function handleSync() {
    setSyncing(true)
    setSyncError(null)
    setSyncMessage(null)

    try {
      const res = await fetch('/api/hf-sync', { method: 'POST' })
      const data = await res.json()

      if (!res.ok) throw new Error(data.error || 'Sync failed')

      setSyncMessage(data.message)
      await loadData()
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  async function handleAssign(generationId: string, clientId: string) {
    setAssigning(generationId)
    try {
      const res = await fetch('/api/hf-assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ generationId, clientId }),
      })
      if (!res.ok) throw new Error('Assign failed')
      await loadData()
    } catch (err) {
      console.error('Assign error:', err)
    } finally {
      setAssigning(null)
    }
  }

  const totalCreditsSpent = clientTotals.reduce(
    (sum, c) => sum + c.total_credits,
    0
  )
  const unassignedCredits = unassigned.reduce(
    (sum, g) => sum + parseFloat(g.credits || '0'),
    0
  )

  return (
    <div className="p-6 text-neutral-100">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* HEADER */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-white">Overview</h1>
            <p className="text-neutral-400 text-sm mt-1">
              Higgsfield credits, resolved to the client they belong to.
            </p>
          </div>
          <Button
            onClick={handleSync}
            disabled={syncing}
            className="bg-lime-400 hover:bg-lime-300 text-black font-semibold px-6"
          >
            {syncing ? 'Syncing…' : '⟳ Sync from Higgsfield'}
          </Button>
        </div>

        {/* SYNC STATUS */}
        {syncMessage && (
          <div className="bg-green-950/50 border border-green-800 text-green-300 px-4 py-2 rounded text-sm">
            ✓ {syncMessage}
          </div>
        )}
        {syncError && (
          <div className="bg-red-950/50 border border-red-800 text-red-300 px-4 py-2 rounded text-sm">
            ✗ {syncError}
          </div>
        )}

        {/* METRICS ROW */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-4">
            <p className="text-neutral-400 text-xs uppercase tracking-wide">
              Unassigned Credits
            </p>
            <p className="text-2xl font-bold text-yellow-400 mt-1">
              {unassignedCredits.toFixed(1)}
            </p>
            <p className="text-neutral-500 text-xs mt-1">
              {unassigned.length} generations
            </p>
          </div>
          <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-4">
            <p className="text-neutral-400 text-xs uppercase tracking-wide">
              Assigned Credits
            </p>
            <p className="text-2xl font-bold text-green-400 mt-1">
              {totalCreditsSpent.toFixed(1)}
            </p>
            <p className="text-neutral-500 text-xs mt-1">
              across {clientTotals.length} clients
            </p>
          </div>
          <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-4">
            <p className="text-neutral-400 text-xs uppercase tracking-wide">
              Total Credits Tracked
            </p>
            <p className="text-2xl font-bold text-white mt-1">
              {(unassignedCredits + totalCreditsSpent).toFixed(1)}
            </p>
            <p className="text-neutral-500 text-xs mt-1">this sync window</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6">
          {/* TABLE A: UNASSIGNED */}
          <div className="bg-neutral-950 border border-neutral-800 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between">
              <h2 className="font-semibold text-white">Unassigned Generations</h2>
              <Badge
                variant="outline"
                className="text-yellow-400 border-yellow-700"
              >
                {unassigned.length} pending
              </Badge>
            </div>

            {unassigned.length === 0 ? (
              <div className="p-8 text-center text-neutral-500">
                <p>No unassigned generations.</p>
                <p className="text-sm mt-1">
                  Hit Sync to pull your Higgsfield history.
                </p>
              </div>
            ) : (
              <div className="overflow-auto max-h-[600px]">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-900 sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2 text-neutral-400 font-medium">
                        Preview
                      </th>
                      <th className="text-left px-3 py-2 text-neutral-400 font-medium">
                        Model
                      </th>
                      <th className="text-right px-3 py-2 text-neutral-400 font-medium">
                        Credits
                      </th>
                      <th className="text-left px-3 py-2 text-neutral-400 font-medium">
                        Assign to
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800">
                    {unassigned.map((gen) => (
                      <tr
                        key={gen.id}
                        className="hover:bg-neutral-900/60 transition-colors"
                      >
                        <td className="px-3 py-2">
                          <MediaPreview
                            url={gen.result_url}
                            mediaType={gen.media_type}
                            name={gen.display_name}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-medium text-white text-xs">
                            {gen.display_name}
                          </div>
                          {gen.prompt && (
                            <div className="text-neutral-500 text-xs mt-0.5 line-clamp-2 max-w-[140px]">
                              {gen.prompt}
                            </div>
                          )}
                          <div className="text-neutral-600 text-xs mt-0.5">
                            {new Date(gen.hf_created_at).toLocaleDateString()}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <span
                            className={`font-bold text-sm ${
                              parseFloat(gen.credits) > 0
                                ? 'text-orange-400'
                                : 'text-neutral-500'
                            }`}
                          >
                            {parseFloat(gen.credits) > 0
                              ? `${parseFloat(gen.credits).toFixed(1)}`
                              : 'free'}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <Select
                            onValueChange={(clientId) =>
                              handleAssign(gen.id, clientId as string)
                            }
                            disabled={assigning === gen.id}
                          >
                            <SelectTrigger className="w-36 h-7 text-xs bg-neutral-900 border-neutral-700">
                              <SelectValue
                                placeholder={
                                  assigning === gen.id
                                    ? 'Assigning…'
                                    : 'Pick client'
                                }
                              />
                            </SelectTrigger>
                            <SelectContent>
                              {clients.map((client) => (
                                <SelectItem
                                  key={client.id}
                                  value={client.id}
                                  className="text-xs"
                                >
                                  {client.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* TABLE B: CLIENT TOTALS */}
          <div className="bg-neutral-950 border border-neutral-800 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-neutral-800">
              <h2 className="font-semibold text-white">
                Client-wise Credit Usage
              </h2>
              <p className="text-neutral-400 text-xs mt-0.5">
                The goal: which client cost how much.
              </p>
            </div>

            {clientTotals.length === 0 ? (
              <div className="p-8 text-center text-neutral-500">
                <p>No assignments yet.</p>
                <p className="text-sm mt-1">
                  Assign generations from the left table.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-neutral-800">
                {clientTotals.map((ct, index) => (
                  <div
                    key={ct.client_id}
                    className="px-4 py-3 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-neutral-600 text-sm w-5">
                        #{index + 1}
                      </span>
                      <div>
                        <div className="font-medium text-white">
                          {ct.client_name}
                        </div>
                        <div className="text-neutral-500 text-xs">
                          {ct.generation_count} generation
                          {ct.generation_count !== 1 ? 's' : ''}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-bold text-white">
                        {ct.total_credits.toFixed(1)}
                      </div>
                      <div className="text-neutral-500 text-xs">credits</div>
                    </div>
                  </div>
                ))}

                {/* Total bar */}
                <div className="px-4 py-3 flex items-center justify-between bg-neutral-900">
                  <span className="text-neutral-400 text-sm font-medium">
                    Total assigned
                  </span>
                  <div className="text-right">
                    <div className="text-xl font-bold text-lime-400">
                      {totalCreditsSpent.toFixed(1)}
                    </div>
                    <div className="text-neutral-500 text-xs">credits</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

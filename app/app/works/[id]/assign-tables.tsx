'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Trash2, Undo2 } from 'lucide-react'

interface Generation {
  id: string
  display_name: string
  result_url: string
  media_type: string
  credits: string
  hf_created_at: string
  work_id: string | null
  assigned_at: string | null
  assigned_by: string | null
  is_waste: boolean
}

interface Props {
  workId: string
  clientId: string
  clientName: string
  unassigned: Generation[]
  assignedToClient: Generation[]
  userRole: 'master' | 'manager' | 'creator'
  userId: string
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
      className="w-14 h-10 rounded object-cover bg-neutral-800"
      loading="lazy"
    />
  )
}

function UnassignButton({
  generationId,
  assignedAt,
  assignedBy,
  userRole,
  userId,
  onDone,
}: {
  generationId: string
  assignedAt: string | null
  assignedBy: string | null
  userRole: string
  userId: string
  onDone: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [timeLeft, setTimeLeft] = useState<number | null>(null)

  const isMasterOrManager = userRole === 'master' || userRole === 'manager'
  const isAssigner = assignedBy === userId

  useEffect(() => {
    if (isMasterOrManager) return // always visible
    if (!isAssigner || !assignedAt) return

    const assignedTime = new Date(assignedAt).getTime()
    function check() {
      const remaining = 10000 - (Date.now() - assignedTime)
      if (remaining <= 0) {
        setTimeLeft(0)
      } else {
        setTimeLeft(Math.ceil(remaining / 1000))
      }
    }
    check()
    const interval = setInterval(check, 1000)
    return () => clearInterval(interval)
  }, [isMasterOrManager, isAssigner, assignedAt])

  // Don't show for creators after 10s or if they didn't assign it
  if (!isMasterOrManager) {
    if (!isAssigner || timeLeft === 0 || timeLeft === null) return null
  }

  async function handleUnassign() {
    setBusy(true)
    const res = await fetch(`/api/generations/${generationId}/unassign`, {
      method: 'POST',
    })
    setBusy(false)
    if (res.ok) onDone()
  }

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={handleUnassign}
      disabled={busy}
      className="h-6 text-xs px-2 text-red-400 border-red-900 hover:bg-red-950"
    >
      {busy ? '…' : isMasterOrManager ? 'Unassign' : `Undo (${timeLeft}s)`}
    </Button>
  )
}

export function AssignTables({
  workId,
  clientId,
  clientName,
  unassigned: allUnassigned,
  assignedToClient,
  userRole,
  userId,
}: Props) {
  const router = useRouter()
  const [syncing, setSyncing] = useState(false)
  const [assigning, setAssigning] = useState<string | null>(null)
  const [wasting, setWasting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showWasted, setShowWasted] = useState(false)

  // Split unassigned into non-waste and waste
  const unassigned = allUnassigned.filter((g) => !g.is_waste)
  const wasted = allUnassigned.filter((g) => g.is_waste)

  async function handleSync() {
    setSyncing(true)
    setError(null)
    const res = await fetch('/api/hf-sync', { method: 'POST' })
    setSyncing(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(`Sync failed: ${data.error || 'unknown'}`)
      return
    }
    router.refresh()
  }

  async function handleAssign(generationId: string) {
    setAssigning(generationId)
    setError(null)
    const res = await fetch(`/api/works/${workId}/assign-generation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ generationId, clientId }),
    })
    setAssigning(null)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(`Assign failed: ${data.error || 'unknown'}`)
      return
    }
    router.refresh()
  }

  async function handleWaste(generationId: string, isWaste: boolean) {
    setWasting(generationId)
    setError(null)
    const res = await fetch(`/api/generations/${generationId}/waste`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_waste: isWaste }),
    })
    setWasting(null)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(`Waste failed: ${data.error || 'unknown'}`)
      return
    }
    router.refresh()
  }

  const assignedToThisWork = assignedToClient.filter((g) => g.work_id === workId)
  const assignedElsewhere = assignedToClient.filter((g) => g.work_id !== workId)
  const isMasterOrManager = userRole === 'master' || userRole === 'manager'

  return (
    <div className="space-y-3">
      {error && (
        <div className="bg-red-950/50 border border-red-800 text-red-300 px-3 py-2 rounded text-sm">
          {error}
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* TABLE A: UNASSIGNED */}
        <div className="bg-neutral-950 border border-neutral-800 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-white text-sm">
                Unassigned Generations
              </h2>
              <p className="text-xs text-neutral-500">
                {unassigned.length} pending · across whole org
              </p>
            </div>
            <Button
              onClick={handleSync}
              disabled={syncing}
              size="sm"
              className="bg-lime-400 hover:bg-lime-300 text-black font-semibold"
            >
              {syncing ? '…' : '⟳ Sync'}
            </Button>
          </div>
          {unassigned.length === 0 ? (
            <div className="p-6 text-center text-neutral-500 text-sm">
              <p>No unassigned generations.</p>
              <p className="text-xs mt-1">Click Sync to pull from Higgsfield.</p>
            </div>
          ) : (
            <div className="max-h-[500px] overflow-auto">
              <table className="w-full text-xs">
                <tbody className="divide-y divide-neutral-800">
                  {unassigned.map((g) => (
                    <tr key={g.id} className="hover:bg-neutral-900/60">
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
                      </td>
                      <td className="px-2 py-2 text-right">
                        <span
                          className={`font-bold ${parseFloat(g.credits) > 0 ? 'text-orange-400' : 'text-neutral-500'}`}
                        >
                          {parseFloat(g.credits) > 0
                            ? parseFloat(g.credits).toFixed(1)
                            : 'free'}
                        </span>
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            onClick={() => handleAssign(g.id)}
                            disabled={assigning === g.id}
                            className="bg-lime-400 hover:bg-lime-300 text-black font-semibold h-6 text-xs px-2"
                          >
                            {assigning === g.id ? '…' : 'Assign'}
                          </Button>
                          <button
                            onClick={() => handleWaste(g.id, true)}
                            disabled={wasting === g.id}
                            className="p-1 rounded text-neutral-500 hover:text-red-400 hover:bg-red-950/50 transition-colors"
                            title="Mark as waste"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* WASTED SECTION (collapsed) */}
          {wasted.length > 0 && (
            <div className="border-t border-neutral-800">
              <button
                onClick={() => setShowWasted(!showWasted)}
                className="w-full px-4 py-2 text-xs text-neutral-500 hover:text-neutral-300 flex items-center justify-between"
              >
                <span>Wasted ({wasted.length})</span>
                <span>{showWasted ? '▾' : '▸'}</span>
              </button>
              {showWasted && (
                <div className="max-h-[200px] overflow-auto">
                  <table className="w-full text-xs">
                    <tbody className="divide-y divide-neutral-800">
                      {wasted.map((g) => (
                        <tr key={g.id} className="bg-red-950/10">
                          <td className="px-2 py-2">
                            <MediaPreview
                              url={g.result_url}
                              mediaType={g.media_type}
                              name={g.display_name}
                            />
                          </td>
                          <td className="px-2 py-2">
                            <div className="font-medium text-neutral-500 line-through">
                              {g.display_name}
                            </div>
                          </td>
                          <td className="px-2 py-2 text-right">
                            <span className="font-bold text-neutral-600">
                              {parseFloat(g.credits) > 0
                                ? parseFloat(g.credits).toFixed(1)
                                : 'free'}
                            </span>
                          </td>
                          <td className="px-2 py-2">
                            {isMasterOrManager && (
                              <button
                                onClick={() => handleWaste(g.id, false)}
                                disabled={wasting === g.id}
                                className="p-1 rounded text-neutral-500 hover:text-lime-400 hover:bg-lime-950/50 transition-colors"
                                title="Un-waste"
                              >
                                <Undo2 className="size-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* TABLE B: ASSIGNED TO THIS CLIENT */}
        <div className="bg-neutral-950 border border-neutral-800 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-800">
            <h2 className="font-semibold text-white text-sm">
              Assigned to {clientName}
            </h2>
            <p className="text-xs text-neutral-500">
              {assignedToThisWork.length} on this work ·{' '}
              {assignedElsewhere.length} on other works
            </p>
          </div>
          {assignedToClient.length === 0 ? (
            <div className="p-6 text-center text-neutral-500 text-sm">
              <p>Nothing assigned to {clientName} yet.</p>
            </div>
          ) : (
            <div className="max-h-[500px] overflow-auto">
              <table className="w-full text-xs">
                <tbody className="divide-y divide-neutral-800">
                  {assignedToClient.map((g) => (
                    <tr
                      key={g.id}
                      className={g.work_id === workId ? 'bg-lime-950/20' : ''}
                    >
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
                        <div className="text-neutral-500 text-xs">
                          {g.work_id === workId ? (
                            <Badge
                              variant="outline"
                              className="text-lime-300 border-lime-700 text-xs"
                            >
                              This work
                            </Badge>
                          ) : (
                            <span className="text-neutral-600">other work</span>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-2 text-right">
                        <span
                          className={`font-bold ${parseFloat(g.credits) > 0 ? 'text-orange-400' : 'text-neutral-500'}`}
                        >
                          {parseFloat(g.credits) > 0
                            ? parseFloat(g.credits).toFixed(1)
                            : 'free'}
                        </span>
                      </td>
                      <td className="px-2 py-2">
                        <UnassignButton
                          generationId={g.id}
                          assignedAt={g.assigned_at}
                          assignedBy={g.assigned_by}
                          userRole={userRole}
                          userId={userId}
                          onDone={() => router.refresh()}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

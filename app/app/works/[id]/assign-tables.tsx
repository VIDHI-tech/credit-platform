'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Undo2 } from 'lucide-react'

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
  wasted_at: string | null
  wasted_by: string | null
  hf_connection_label: string | null
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
    if (isMasterOrManager) return
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

function WastageButton({
  generationId,
  wastedAt,
  wastedBy,
  userRole,
  userId,
  onDone,
}: {
  generationId: string
  wastedAt: string | null
  wastedBy: string | null
  userRole: string
  userId: string
  onDone: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [timeLeft, setTimeLeft] = useState<number | null>(null)

  const isMaster = userRole === 'master'
  const isWaster = wastedBy === userId
  const isWasted = wastedAt !== null

  useEffect(() => {
    if (!isWasted || !wastedAt) return
    if (!isMaster && !isWaster) return

    const wastedTime = new Date(wastedAt).getTime()
    function check() {
      const remaining = 10000 - (Date.now() - wastedTime)
      if (remaining <= 0) {
        setTimeLeft(0)
      } else {
        setTimeLeft(Math.ceil(remaining / 1000))
      }
    }
    check()
    const interval = setInterval(check, 1000)
    return () => clearInterval(interval)
  }, [isWasted, wastedAt, isMaster, isWaster])

  async function handleToggleWaste() {
    setBusy(true)
    const res = await fetch(`/api/generations/${generationId}/waste`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_waste: !isWasted }),
    })
    setBusy(false)
    if (res.ok) onDone()
  }

  if (!isWasted) return null

  // Show useful button if within 10s (for the person who wasted it) or anytime for master
  const showUsefulButton = (isWaster && timeLeft! > 0) || isMaster

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={handleToggleWaste}
      disabled={busy}
      className="h-6 text-xs px-2 text-lime-400 border-lime-700 hover:bg-lime-950"
    >
      {busy ? '…' : (
        <>
          <Undo2 className="size-3 mr-1" />
          {isWaster ? `Mark Useful (${timeLeft}s)` : 'Mark Useful'}
        </>
      )}
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

  // Split unassigned into useful and wasted
  const useful = allUnassigned.filter((g) => !g.is_waste)
  const wasted = allUnassigned.filter((g) => g.is_waste)

  async function handleSync() {
    setSyncing(true)
    setError(null)
    const res = await fetch('/api/hf-sync', { method: 'POST' })
    setSyncing(false)
    if (res.status === 409) {
      if (userRole === 'master') {
        setError('No Higgsfield account connected. Go to Settings to add one.')
      } else {
        setError('You don\'t have access to any Higgsfield account yet. Ask your admin to grant you access.')
      }
      return
    }
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

  async function handleMarkWaste(generationId: string) {
    setWasting(generationId)
    setError(null)
    const res = await fetch(`/api/generations/${generationId}/waste`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_waste: true }),
    })
    setWasting(null)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(`Failed: ${data.error || 'unknown'}`)
      return
    }
    router.refresh()
  }

  const assignedToThisWork = assignedToClient.filter((g) => g.work_id === workId)
  const assignedElsewhere = assignedToClient.filter((g) => g.work_id !== workId)

  return (
    <div className="space-y-3">
      {error && (
        <div className="bg-red-950/50 border border-red-800 text-red-300 px-3 py-2 rounded text-sm flex items-center justify-between">
          <span>{error}</span>
          {error.includes('Settings') && (
            <a href="/app/settings" className="text-lime-400 hover:underline text-xs ml-4">
              Open Settings →
            </a>
          )}
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* TABLE A: UNASSIGNED (Useful) */}
        <div className="bg-neutral-950 border border-neutral-800 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-white text-sm">
                Unassigned Generations
              </h2>
              <p className="text-xs text-neutral-500">
                {useful.length} pending · ready to use
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
          {useful.length === 0 ? (
            <div className="p-6 text-center text-neutral-500 text-sm">
              <p>No unassigned generations.</p>
              <p className="text-xs mt-1">Click Sync to pull from Higgsfield.</p>
            </div>
          ) : (
            <div className="max-h-[500px] overflow-auto">
              <table className="w-full text-xs">
                <tbody className="divide-y divide-neutral-800">
                  {useful.map((g) => (
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
                        {g.hf_connection_label && (
                          <div className="text-xs text-neutral-500 mt-0.5">
                            from <span className="text-lime-400">{g.hf_connection_label}</span>
                          </div>
                        )}
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
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleMarkWaste(g.id)}
                            disabled={wasting === g.id}
                            className="h-6 text-xs px-2 text-yellow-400 border-yellow-700 hover:bg-yellow-950"
                          >
                            {wasting === g.id ? '…' : 'Wastage'}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
                        <div className="text-neutral-500 text-xs mt-0.5 space-y-0.5">
                          <div>
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
                          {g.hf_connection_label && (
                            <div className="text-neutral-500 text-xs">
                              from <span className="text-lime-400">{g.hf_connection_label}</span>
                            </div>
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

        {/* TABLE C: WASTAGE */}
        <div className="bg-neutral-950 border border-red-900/50 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-800">
            <h2 className="font-semibold text-white text-sm flex items-center gap-2">
              Wastage
              {wasted.length > 0 && (
                <Badge variant="outline" className="text-red-400 border-red-700">
                  {wasted.length}
                </Badge>
              )}
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Marked as not useful
            </p>
          </div>
          {wasted.length === 0 ? (
            <div className="p-6 text-center text-neutral-500 text-sm">
              <p>No wastage yet.</p>
            </div>
          ) : (
            <div className="max-h-[500px] overflow-auto">
              <table className="w-full text-xs">
                <tbody className="divide-y divide-neutral-800">
                  {wasted.map((g) => (
                    <tr key={g.id} className="bg-red-950/10 hover:bg-red-950/20">
                      <td className="px-2 py-2">
                        <MediaPreview
                          url={g.result_url}
                          mediaType={g.media_type}
                          name={g.display_name}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <div className="font-medium text-neutral-400 line-through">
                          {g.display_name}
                        </div>
                        <div className="text-xs text-neutral-600 mt-0.5 space-y-0.5">
                          <div>
                            Marked {g.wasted_at ? new Date(g.wasted_at).toLocaleTimeString() : ''}
                          </div>
                          {g.hf_connection_label && (
                            <div className="text-neutral-600">
                              from <span className="text-red-400">{g.hf_connection_label}</span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-2 text-right">
                        <span className="font-bold text-red-400">
                          {parseFloat(g.credits) > 0
                            ? parseFloat(g.credits).toFixed(1)
                            : 'free'}
                        </span>
                      </td>
                      <td className="px-2 py-2">
                        <WastageButton
                          generationId={g.id}
                          wastedAt={g.wasted_at}
                          wastedBy={g.wasted_by}
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

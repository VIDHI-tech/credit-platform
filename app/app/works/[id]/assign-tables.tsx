'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface Generation {
  id: string
  display_name: string
  result_url: string
  media_type: string
  credits: string
  hf_created_at: string
  work_id: string | null
}

interface Props {
  workId: string
  clientId: string
  clientName: string
  unassigned: Generation[]
  assignedToClient: Generation[]
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

export function AssignTables({
  workId,
  clientId,
  clientName,
  unassigned,
  assignedToClient,
}: Props) {
  const router = useRouter()
  const [syncing, setSyncing] = useState(false)
  const [assigning, setAssigning] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

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

  const assignedToThisWork = assignedToClient.filter((g) => g.work_id === workId)
  const assignedElsewhere = assignedToClient.filter((g) => g.work_id !== workId)

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
                        <Button
                          size="sm"
                          onClick={() => handleAssign(g.id)}
                          disabled={assigning === g.id}
                          className="bg-lime-400 hover:bg-lime-300 text-black font-semibold h-6 text-xs px-2"
                        >
                          {assigning === g.id ? '…' : 'Assign'}
                        </Button>
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

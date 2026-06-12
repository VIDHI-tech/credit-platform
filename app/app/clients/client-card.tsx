import Link from 'next/link'
import {
  CLIENT_STATUS_COLORS,
  CLIENT_STATUS_LABELS,
  type ClientStatus,
} from '@/lib/client-helpers'

interface Props {
  client: {
    id: string
    name: string
    industry: string | null
    status: ClientStatus
    totalCredits: number
    generationCount: number
  }
  archived?: boolean
}

export function ClientCard({ client, archived }: Props) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className={`font-semibold truncate flex-1 ${archived ? 'text-neutral-500' : 'text-white group-hover:text-lime-400 transition-colors'}`}>
          {client.name}
        </h3>
        {archived ? (
          <span className="text-xs px-2 py-0.5 rounded border bg-neutral-800 text-neutral-500 border-neutral-700 whitespace-nowrap">
            Archived
          </span>
        ) : (
          <span
            className={`text-xs px-2 py-0.5 rounded border ${CLIENT_STATUS_COLORS[client.status]} whitespace-nowrap`}
          >
            {CLIENT_STATUS_LABELS[client.status]}
          </span>
        )}
      </div>

      <p className={`text-sm mb-4 ${archived ? 'text-neutral-600' : 'text-neutral-400'}`}>
        {client.industry || (
          <span className="text-neutral-600">No industry set</span>
        )}
      </p>

      <div className="flex items-center justify-between pt-3 border-t border-neutral-800">
        <div className="text-xs text-neutral-500">
          {client.generationCount > 0
            ? `${client.generationCount} generation${client.generationCount > 1 ? 's' : ''}`
            : 'No generations assigned'}
        </div>
        <div className="text-right">
          <div className={`text-lg font-bold ${archived ? 'text-neutral-500' : 'text-white'}`}>
            {client.totalCredits > 0 ? client.totalCredits.toFixed(1) : '0'}
          </div>
          <div className="text-xs text-neutral-500">credits</div>
        </div>
      </div>
    </>
  )

  if (archived) {
    return (
      <Link
        href={`/app/clients/${client.id}`}
        className="block rounded-lg p-4 transition-colors border bg-neutral-950 border-neutral-800 opacity-60 bg-gradient-to-br from-neutral-800/30 via-neutral-900 to-neutral-800/30"
      >
        {content}
      </Link>
    )
  }

  return (
    <Link
      href={`/app/clients/${client.id}`}
      className="block rounded-lg p-4 transition-colors border bg-neutral-950 border-neutral-800 hover:border-neutral-600 group"
    >
      {content}
    </Link>
  )
}

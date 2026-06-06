'use client'

// app/onboarding/join-org/page.tsx
// Privacy-friendly join flow: no organization is shown until the user types
// at least 2 chars. A debounced ilike search returns matching orgs to pick
// from. This avoids leaking the full org directory to anyone who lands here.

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Search, Check } from 'lucide-react'

interface Org {
  id: string
  name: string
}

export default function JoinOrgPage() {
  const router = useRouter()
  const [supabase] = useState(() => createClient())

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Org[]>([])
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)

  const [selected, setSelected] = useState<Org | null>(null)
  const [fullName, setFullName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Debounced search — only fires when the user has typed at least 2 chars.
  // Stale error message is cleared the moment the user starts typing again.
  useEffect(() => {
    setError(null)
    const trimmed = query.trim()
    if (trimmed.length < 2) {
      setResults([])
      setSearched(false)
      return
    }
    setSearching(true)
    const handle = setTimeout(async () => {
      const { data } = await supabase
        .from('organizations')
        .select('id, name')
        .ilike('name', `%${trimmed}%`)
        .order('name')
        .limit(20)
      setResults(data || [])
      setSearching(false)
      setSearched(true)
    }, 250)
    return () => clearTimeout(handle)
  }, [query, supabase])

  // If the currently-selected org no longer matches the new query, drop it
  // so the user re-picks deliberately.
  useEffect(() => {
    if (selected && !results.some((o) => o.id === selected.id)) {
      setSelected(null)
    }
  }, [results, selected])

  async function handleJoin() {
    if (!selected || !fullName.trim()) {
      setError('Pick an organization and enter your name')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const { data: membershipId, error: rpcErr } = await supabase.rpc(
        'request_join_org',
        {
          target_org_id: selected.id,
          user_full_name: fullName.trim(),
        },
      )
      if (rpcErr) throw rpcErr

      // Check if auto-approved (invitation existed) and route accordingly.
      const { data: membership } = await supabase
        .from('memberships')
        .select('status')
        .eq('id', membershipId)
        .maybeSingle()

      startTransition(() => {
        if (membership?.status === 'active') {
          router.push('/app/dashboard')
        } else {
          router.push('/onboarding/pending')
        }
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong'
      setError(
        message.includes('unique')
          ? 'You already requested to join this org'
          : message,
      )
      setSubmitting(false)
    }
  }

  const disabled = submitting || isPending

  return (
    <div className="min-h-screen flex items-center justify-center bg-black p-4">
      <div className="max-w-md w-full space-y-6 bg-neutral-950 border border-neutral-800 rounded-lg p-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Join Organization</h1>
          <p className="text-neutral-400 text-sm mt-1">
            Search for your organization by name. The admin will approve your
            request unless you&apos;ve already been invited.
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <Label htmlFor="orgSearch" className="text-neutral-300">
              Search organization
            </Label>
            <div className="relative mt-1">
              <Search className="size-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <Input
                id="orgSearch"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Type at least 2 characters…"
                className="pl-9 bg-neutral-900 border-neutral-700 text-white"
                disabled={disabled}
                autoFocus
              />
            </div>

            {/* Results */}
            <div className="mt-2 space-y-2 max-h-60 overflow-y-auto">
              {query.trim().length < 2 ? (
                <p className="text-xs text-neutral-500 px-1">
                  Search hides the full directory — only orgs matching your
                  query will appear.
                </p>
              ) : searching ? (
                <p className="text-xs text-neutral-500 px-1">Searching…</p>
              ) : searched && results.length === 0 ? (
                <p className="text-xs text-neutral-500 px-1">
                  No organization matches &ldquo;{query.trim()}&rdquo;. Ask your
                  admin to confirm the exact name, or{' '}
                  <button
                    type="button"
                    onClick={() => router.push('/onboarding/create-org')}
                    className="text-lime-400 hover:underline"
                  >
                    create a new one
                  </button>
                  .
                </p>
              ) : (
                results.map((org) => {
                  const isSelected = selected?.id === org.id
                  return (
                    <button
                      key={org.id}
                      type="button"
                      onClick={() => setSelected(org)}
                      disabled={disabled}
                      className={`w-full text-left px-3 py-2 rounded border transition-colors flex items-center justify-between gap-3 ${
                        isSelected
                          ? 'bg-lime-950/40 border-lime-500 text-white'
                          : 'bg-neutral-900 border-neutral-700 text-neutral-300 hover:border-neutral-600'
                      }`}
                    >
                      <span className="truncate">{org.name}</span>
                      {isSelected && (
                        <Check className="size-4 shrink-0 text-lime-400" />
                      )}
                    </button>
                  )
                })
              )}
            </div>
          </div>

          <div>
            <Label htmlFor="fullName" className="text-neutral-300">
              Your name
            </Label>
            <Input
              id="fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Vidhi"
              className="mt-1 bg-neutral-900 border-neutral-700 text-white"
              disabled={disabled}
            />
          </div>
        </div>

        {error && (
          <div className="bg-red-950/50 border border-red-800 text-red-300 px-3 py-2 rounded text-sm">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => router.push('/onboarding')}
            disabled={disabled}
            className="flex-1"
          >
            Back
          </Button>
          <Button
            onClick={handleJoin}
            disabled={disabled || !selected || !fullName.trim()}
            className="flex-1 bg-lime-400 hover:bg-lime-300 text-black font-semibold"
          >
            {submitting
              ? 'Submitting…'
              : isPending
                ? 'Going…'
                : 'Request to Join'}
          </Button>
        </div>
      </div>
    </div>
  )
}

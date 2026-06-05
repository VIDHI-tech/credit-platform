'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface Org {
  id: string
  name: string
}

export default function JoinOrgPage() {
  const router = useRouter()
  const [orgs, setOrgs] = useState<Org[]>([])
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null)
  const [fullName, setFullName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data } = await supabase
        .from('organizations')
        .select('id, name')
        .order('name')
      setOrgs(data || [])
    }
    load()
  }, [])

  async function handleJoin() {
    if (!selectedOrgId || !fullName.trim()) {
      setError('Pick an org and enter your name')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const supabase = createClient()
      const { data: membershipId, error } = await supabase.rpc('request_join_org', {
        target_org_id: selectedOrgId,
        user_full_name: fullName.trim(),
      })
      if (error) throw error

      // Check if auto-approved (invitation existed)
      const { data: membership } = await supabase
        .from('memberships')
        .select('status')
        .eq('id', membershipId)
        .maybeSingle()

      if (membership?.status === 'active') {
        router.push('/app/dashboard')
      } else {
        router.push('/onboarding/pending')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong'
      setError(
        message.includes('unique')
          ? 'You already requested to join this org'
          : message
      )
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-black p-4">
      <div className="max-w-md w-full space-y-6 bg-neutral-950 border border-neutral-800 rounded-lg p-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Join Organization</h1>
          <p className="text-neutral-400 text-sm mt-1">
            Pick yours, the admin will approve.
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <Label className="text-neutral-300">Organization</Label>
            <div className="mt-1 space-y-2 max-h-60 overflow-y-auto">
              {orgs.length === 0 ? (
                <p className="text-neutral-500 text-sm">
                  No organizations exist yet. Ask your admin to create one first.
                </p>
              ) : (
                orgs.map((org) => (
                  <button
                    key={org.id}
                    onClick={() => setSelectedOrgId(org.id)}
                    className={`w-full text-left px-3 py-2 rounded border transition-colors ${
                      selectedOrgId === org.id
                        ? 'bg-lime-950/40 border-lime-500 text-white'
                        : 'bg-neutral-900 border-neutral-700 text-neutral-300 hover:border-neutral-600'
                    }`}
                  >
                    {org.name}
                  </button>
                ))
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
              disabled={submitting}
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
            disabled={submitting}
            className="flex-1"
          >
            Back
          </Button>
          <Button
            onClick={handleJoin}
            disabled={submitting || !selectedOrgId}
            className="flex-1 bg-lime-400 hover:bg-lime-300 text-black font-semibold"
          >
            {submitting ? 'Submitting…' : 'Request to Join'}
          </Button>
        </div>
      </div>
    </div>
  )
}

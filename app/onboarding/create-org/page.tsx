'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function CreateOrgPage() {
  const router = useRouter()
  const [orgName, setOrgName] = useState('')
  const [fullName, setFullName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate() {
    if (!orgName.trim() || !fullName.trim()) {
      setError('Both fields are required')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const supabase = createClient()
      const { error } = await supabase.rpc('create_org_with_master', {
        org_name: orgName.trim(),
        user_full_name: fullName.trim(),
      })
      if (error) throw error
      router.push('/app/dashboard')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong'
      setError(
        message.includes('unique')
          ? 'An org with that name already exists'
          : message
      )
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-black p-4">
      <div className="max-w-md w-full space-y-6 bg-neutral-950 border border-neutral-800 rounded-lg p-8">
        <div>
          <h1 className="text-2xl font-bold text-white">
            Create Your Organization
          </h1>
          <p className="text-neutral-400 text-sm mt-1">
            You&apos;ll become the master admin.
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <Label htmlFor="orgName" className="text-neutral-300">
              Organization name
            </Label>
            <Input
              id="orgName"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="e.g. Palnesto Studio"
              className="mt-1 bg-neutral-900 border-neutral-700 text-white"
              disabled={submitting}
            />
          </div>
          <div>
            <Label htmlFor="fullName" className="text-neutral-300">
              Your name
            </Label>
            <Input
              id="fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Abhishek"
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
            onClick={handleCreate}
            disabled={submitting}
            className="flex-1 bg-lime-400 hover:bg-lime-300 text-black font-semibold"
          >
            {submitting ? 'Creating…' : 'Create Organization'}
          </Button>
        </div>
      </div>
    </div>
  )
}

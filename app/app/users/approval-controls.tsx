'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export function ApprovalControls({ membershipId }: { membershipId: string }) {
  const router = useRouter()
  const [role, setRole] = useState<'manager' | 'creator'>('creator')
  const [busy, setBusy] = useState(false)

  async function handleApprove() {
    setBusy(true)
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    await supabase
      .from('memberships')
      .update({
        status: 'active',
        role,
        approved_at: new Date().toISOString(),
        approved_by: user?.id,
      })
      .eq('id', membershipId)
    router.refresh()
  }

  async function handleReject() {
    setBusy(true)
    const supabase = createClient()
    await supabase
      .from('memberships')
      .update({ status: 'rejected' })
      .eq('id', membershipId)
    router.refresh()
  }

  return (
    <div className="flex gap-2 items-center">
      <Select
        value={role}
        onValueChange={(v) => setRole(v as 'manager' | 'creator')}
      >
        <SelectTrigger className="w-28 h-8 text-xs bg-neutral-900 border-neutral-700">
          <SelectValue>
            {(v) => {
              const val = v as string | null
              if (!val) return 'Role'
              return val.charAt(0).toUpperCase() + val.slice(1)
            }}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="creator">Creator</SelectItem>
          <SelectItem value="manager">Manager</SelectItem>
        </SelectContent>
      </Select>
      <Button
        size="sm"
        onClick={handleApprove}
        disabled={busy}
        className="bg-green-600 hover:bg-green-500 text-white h-8"
      >
        Approve
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={handleReject}
        disabled={busy}
        className="h-8 text-red-400 border-red-900 hover:bg-red-950"
      >
        Reject
      </Button>
    </div>
  )
}

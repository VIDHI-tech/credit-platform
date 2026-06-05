'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { X } from 'lucide-react'

type Role = 'master' | 'manager' | 'creator'

const ROLE_LABELS: Record<Role, string> = {
  master: 'Master',
  manager: 'Manager',
  creator: 'Creator',
}

interface Invitation {
  id: string
  email: string
  role: string
  created_at: string
  used_at: string | null
}

interface Props {
  orgId: string
  initialInvitations: Invitation[]
}

export function InviteUserSection({ orgId, initialInvitations }: Props) {
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  const [invitations, setInvitations] = useState<Invitation[]>(initialInvitations)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('creator')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [newJoiner, setNewJoiner] = useState<string | null>(null)

  // Realtime: watch for used_at being set (invitation accepted)
  useEffect(() => {
    const channel = supabase
      .channel('invitations-watch')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'invitations',
          filter: `org_id=eq.${orgId}`,
        },
        (payload) => {
          const updated = payload.new as Invitation
          setInvitations(prev =>
            prev.map(i => i.id === updated.id ? { ...i, used_at: updated.used_at } : i)
          )
          // Show a flash notification if just joined
          if (updated.used_at && !payload.old.used_at) {
            setNewJoiner(updated.email)
            setTimeout(() => setNewJoiner(null), 6000)
            router.refresh() // refresh page so they appear in Active Members too
          }
        }
      )
      .subscribe()

    return () => { void supabase.removeChannel(channel) }
  }, [supabase, orgId, router])

  async function handleInvite() {
    const trimmed = email.trim().toLowerCase()
    if (!trimmed) return
    if (!trimmed.includes('@')) {
      setError('Please enter a valid email address')
      return
    }

    setSending(true)
    setError(null)
    setSuccess(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { data, error: e } = await supabase
        .from('invitations')
        .insert({
          org_id: orgId,
          email: trimmed,
          role,
          invited_by: user.id,
        })
        .select('id, email, role, created_at, used_at')
        .single()

      if (e) {
        if (e.message.includes('duplicate') || e.message.includes('unique')) {
          throw new Error('This email has already been invited')
        }
        throw e
      }

      if (data) {
        setInvitations(prev => [data, ...prev])
        setEmail('')
        setSuccess(`Invitation sent to ${trimmed}. They will be auto-approved as ${ROLE_LABELS[role]} when they sign up.`)
        setTimeout(() => setSuccess(null), 5000)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to invite')
    } finally {
      setSending(false)
    }
  }

  async function handleRevoke(id: string) {
    const { error: e } = await supabase
      .from('invitations')
      .delete()
      .eq('id', id)
    if (e) {
      setError(e.message)
      return
    }
    setInvitations(prev => prev.filter(i => i.id !== id))
  }

  const pending = invitations.filter(i => !i.used_at)
  const used = invitations.filter(i => i.used_at)

  return (
    <section className="bg-neutral-950 border border-neutral-800 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-neutral-800">
        <h2 className="font-semibold text-white">Invite Users</h2>
        <p className="text-xs text-neutral-500 mt-0.5">
          Pre-approve an email so they skip the pending queue when they sign up or log in.
        </p>
      </div>

      <div className="p-4 space-y-4">
        {/* INVITE FORM */}
        <div className="flex gap-2">
          <Input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="user@example.com"
            className="flex-1 bg-neutral-900 border-neutral-700 text-white"
            onKeyDown={e => { if (e.key === 'Enter') handleInvite() }}
            disabled={sending}
          />
          <Select value={role} onValueChange={v => setRole(v as Role)}>
            <SelectTrigger className="w-28 bg-neutral-900 border-neutral-700">
              <SelectValue>
                {(v) => {
                  const val = v as Role | null
                  return val ? ROLE_LABELS[val] : 'Role'
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="creator">Creator</SelectItem>
              <SelectItem value="manager">Manager</SelectItem>
              <SelectItem value="master">Master</SelectItem>
            </SelectContent>
          </Select>
          <Button
            onClick={handleInvite}
            disabled={sending || !email.trim()}
            className="bg-lime-400 text-black hover:bg-lime-300 font-semibold"
          >
            {sending ? 'Inviting…' : 'Invite'}
          </Button>
        </div>

        {error && (
          <div className="bg-red-950/40 border border-red-900 text-red-300 text-sm px-3 py-2 rounded">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-green-950/40 border border-green-900 text-green-300 text-sm px-3 py-2 rounded">
            {success}
          </div>
        )}
        {newJoiner && (
          <div className="bg-lime-950/50 border border-lime-700 text-lime-300 text-sm px-3 py-2 rounded flex items-center gap-2">
            <span className="text-lg">🎉</span>
            <span><span className="font-semibold">{newJoiner}</span> just joined the org!</span>
          </div>
        )}

        {/* PENDING INVITATIONS */}
        {pending.length > 0 && (
          <div>
            <h3 className="text-xs text-neutral-500 uppercase tracking-wider mb-2">
              Pending Invitations ({pending.length})
            </h3>
            <div className="divide-y divide-neutral-800 bg-neutral-900 rounded-lg overflow-hidden">
              {pending.map(inv => (
                <div key={inv.id} className="px-3 py-2 flex items-center justify-between">
                  <div>
                    <span className="text-sm text-white">{inv.email}</span>
                    <span className="text-xs text-neutral-500 ml-2 capitalize">
                      {inv.role}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleRevoke(inv.id)}
                    className="h-6 w-6 p-0 text-neutral-500 hover:text-red-400"
                  >
                    <X className="size-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* USED INVITATIONS */}
        {used.length > 0 && (
          <div>
            <h3 className="text-xs text-neutral-500 uppercase tracking-wider mb-2">
              Accepted ({used.length})
            </h3>
            <div className="divide-y divide-neutral-800 bg-neutral-900 rounded-lg overflow-hidden">
              {used.map(inv => (
                <div key={inv.id} className="px-3 py-2 flex items-center justify-between">
                  <div>
                    <span className="text-sm text-neutral-400">{inv.email}</span>
                    <span className="text-xs text-neutral-600 ml-2 capitalize">
                      {inv.role}
                    </span>
                  </div>
                  <span className="text-xs text-green-500">Joined</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

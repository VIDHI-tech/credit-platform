'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

export function AddAccountDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-neutral-950 border-neutral-800 text-white">
        {open && <AddAccountForm onOpenChange={onOpenChange} />}
      </DialogContent>
    </Dialog>
  )
}

type Step = 'idle' | 'starting' | 'waiting' | 'error'

function AddAccountForm({
  onOpenChange,
}: {
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [step, setStep] = useState<Step>('idle')
  const [label, setLabel] = useState('')
  const [verificationUri, setVerificationUri] = useState('')
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancelled = useRef(false)

  // Cleanup only — stop polling when the dialog unmounts/closes.
  useEffect(() => {
    return () => {
      cancelled.current = true
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  function schedulePoll(deviceCode: string, intervalSec: number) {
    timer.current = setTimeout(async () => {
      if (cancelled.current) return
      try {
        const res = await fetch('/api/hf/connect/poll', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceCode, label: label.trim() }),
        })
        const d = await res.json()
        if (cancelled.current) return
        if (d.status === 'done') {
          router.refresh()
          onOpenChange(false)
          return
        }
        if (d.status === 'error') {
          setError(d.error || 'Login failed')
          setStep('error')
          return
        }
        schedulePoll(deviceCode, intervalSec) // pending → keep polling
      } catch {
        if (!cancelled.current) schedulePoll(deviceCode, intervalSec)
      }
    }, intervalSec * 1000)
  }

  async function handleStart() {
    setError(null)
    setStep('starting')
    try {
      const res = await fetch('/api/hf/connect/start', { method: 'POST' })
      const d = await res.json()
      if (!res.ok) {
        setError(d.error || 'Failed to start login')
        setStep('error')
        return
      }
      setVerificationUri(d.verification_uri)
      setStep('waiting')
      window.open(d.verification_uri, '_blank', 'noopener')
      schedulePoll(d.device_code, d.interval || 3)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start login')
      setStep('error')
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Add Higgsfield account</DialogTitle>
        <DialogDescription className="text-neutral-400">
          A Higgsfield login page opens in a new tab. Sign in as the account you
          want to connect, approve, and come back here.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-2">
        {(step === 'idle' || step === 'starting') && (
          <>
            <div>
              <Label htmlFor="label" className="text-neutral-300">
                Label (optional)
              </Label>
              <Input
                id="label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Main account, Client X account"
                className="mt-1 bg-neutral-900 border-neutral-700 text-white"
                disabled={step === 'starting'}
              />
            </div>
            <Button
              onClick={handleStart}
              disabled={step === 'starting'}
              className="bg-lime-400 hover:bg-lime-300 text-black font-semibold w-full"
            >
              {step === 'starting' ? 'Starting…' : 'Start Higgsfield login'}
            </Button>
          </>
        )}

        {step === 'waiting' && (
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2 text-lime-300">
              <span className="inline-block size-2 rounded-full bg-lime-400 animate-pulse" />
              Waiting for you to approve in the Higgsfield tab…
            </div>
            <p className="text-neutral-400">
              Didn&apos;t see the tab open?{' '}
              <a
                href={verificationUri}
                target="_blank"
                rel="noopener noreferrer"
                className="text-lime-400 hover:underline"
              >
                Open the Higgsfield login
              </a>
              . After you approve, this closes automatically.
            </p>
          </div>
        )}

        {step === 'error' && (
          <div className="space-y-3">
            <div className="bg-red-950/50 border border-red-800 text-red-300 px-3 py-2 rounded text-sm">
              {error}
            </div>
            <Button
              onClick={handleStart}
              className="bg-lime-400 hover:bg-lime-300 text-black font-semibold"
            >
              Try again
            </Button>
          </div>
        )}
      </div>
    </>
  )
}

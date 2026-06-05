'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Step = 'idle' | 'starting' | 'waiting' | 'error'

// Inline (non-modal) "add Higgsfield account" flow. Expands below the button.
export function AddAccountPanel({
  onDone,
  onCancel,
}: {
  onDone: () => void
  onCancel: () => void
}) {
  const [step, setStep] = useState<Step>('idle')
  const [label, setLabel] = useState('')
  const [verificationUri, setVerificationUri] = useState('')
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancelled = useRef(false)

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
          onDone()
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

  async function handleImportCli() {
    setError(null)
    setStep('starting')
    try {
      const res = await fetch('/api/hf/connect/import-cli', { method: 'POST' })
      const d = await res.json()
      if (!res.ok) {
        setError(d.error || 'Import failed')
        setStep('error')
        return
      }
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
      setStep('error')
    }
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
    <div className="border-t border-neutral-800 bg-neutral-900/40 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">
          Connect a Higgsfield account
        </h3>
        <button
          onClick={onCancel}
          className="text-xs text-neutral-500 hover:text-white"
        >
          Cancel
        </button>
      </div>

      {(step === 'idle' || step === 'starting') && (
        <div className="space-y-3">
          <div>
            <Label htmlFor="hf-label" className="text-neutral-300 text-xs">
              Label (optional)
            </Label>
            <Input
              id="hf-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Main account, Client X account"
              className="mt-1 bg-neutral-900 border-neutral-700 text-white"
              disabled={step === 'starting'}
            />
          </div>
          <p className="text-xs text-neutral-500">
            A Higgsfield login opens in a new tab. Sign in as the account you
            want to connect and approve — this panel finishes automatically.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={handleStart}
              disabled={step === 'starting'}
              className="bg-lime-400 hover:bg-lime-300 text-black font-semibold"
            >
              {step === 'starting' ? 'Starting…' : 'Start Higgsfield login'}
            </Button>
            <button
              onClick={handleImportCli}
              disabled={step === 'starting'}
              className="text-xs text-neutral-400 hover:text-white underline underline-offset-2 disabled:opacity-50"
            >
              or use the CLI login on this machine
            </button>
          </div>
        </div>
      )}

      {step === 'waiting' && (
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2 text-lime-300">
            <span className="inline-block size-2 rounded-full bg-lime-400 animate-pulse" />
            Waiting for you to approve in the Higgsfield tab…
          </div>
          <p className="text-neutral-400 text-xs">
            Tab didn&apos;t open?{' '}
            <a
              href={verificationUri}
              target="_blank"
              rel="noopener noreferrer"
              className="text-lime-400 hover:underline"
            >
              Open the Higgsfield login
            </a>
            .
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
  )
}

'use client'

// app/app/studio/brief-form.tsx — the Studio input. On submit, POSTs the brief
// to /api/studio/generate-prompt and navigates to the new batch page. Shows
// shimmer cards while Claude works.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

type MediaType = 'video' | 'image'

// base-ui Select can't take an empty-string item value; use a sentinel for "no work".
const NONE_WORK = '__none'

const PLATFORMS: Record<string, string> = {
  tiktok: 'TikTok', reels: 'Instagram Reels', shorts: 'YouTube Shorts',
  youtube: 'YouTube', instagram_feed: 'Instagram Feed', other: 'Other',
}
const VIDEO_MODELS = ['Kling 3.0', 'Kling 2.6', 'Seedance 2.0', 'Veo 3.1', 'Veo 3.1 Lite']
const IMAGE_MODELS = ['Nano Banana Pro', 'Nano Banana 2', 'Seedream', 'GPT Image']

interface WorkOption { id: string; label: string }

export function BriefForm({ works }: { works: WorkOption[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [brief, setBrief] = useState('')
  const [mediaType, setMediaType] = useState<MediaType>('video')
  const [platform, setPlatform] = useState('tiktok')
  const [audience, setAudience] = useState('')
  const [targetModel, setTargetModel] = useState('')
  const [workId, setWorkId] = useState(NONE_WORK)

  const models = mediaType === 'video' ? VIDEO_MODELS : IMAGE_MODELS

  async function handleGenerate() {
    if (!brief.trim()) { setError('Write a brief first'); return }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/studio/generate-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brief, mediaType, platform,
          targetAudience: audience,
          targetModel: targetModel || undefined,
          workId: workId === NONE_WORK ? null : workId,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Generation failed')
      startTransition(() => router.push(`/app/studio/${data.batchId}`))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Generation failed')
      setBusy(false)
    }
  }

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 space-y-4">
      <div>
        <Label className="text-neutral-300 text-sm">Brief</Label>
        <Textarea
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          placeholder="e.g. A 15s UGC reel of a girl unboxing our stuffed cookie, funny deadpan reaction, ends on the gooey center reveal"
          className="mt-1 bg-neutral-800 border-neutral-700 text-white min-h-24"
          disabled={busy}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <Label className="text-neutral-300 text-xs">Type</Label>
          <Select value={mediaType} onValueChange={(v) => { setMediaType(v as MediaType); setTargetModel('') }}>
            <SelectTrigger className="mt-1 bg-neutral-800 border-neutral-700">
              <SelectValue>{(v: unknown) => (v === 'image' ? 'Image' : 'Video')}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="video">Video</SelectItem>
              <SelectItem value="image">Image</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-neutral-300 text-xs">Platform</Label>
          <Select value={platform} onValueChange={(v) => setPlatform(v as string)}>
            <SelectTrigger className="mt-1 bg-neutral-800 border-neutral-700">
              <SelectValue>{(v: unknown) => PLATFORMS[v as string] ?? 'Platform'}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {Object.entries(PLATFORMS).map(([k, label]) => (
                <SelectItem key={k} value={k}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-neutral-300 text-xs">Target model</Label>
          <Select value={targetModel} onValueChange={(v) => setTargetModel(v as string)}>
            <SelectTrigger className="mt-1 bg-neutral-800 border-neutral-700">
              <SelectValue>{(v: unknown) => (v as string) || 'Any'}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {models.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-neutral-300 text-xs">Attach to work</Label>
          <Select value={workId} onValueChange={(v) => setWorkId(v as string)}>
            <SelectTrigger className="mt-1 bg-neutral-800 border-neutral-700">
              <SelectValue>
                {(v: unknown) => works.find((w) => w.id === (v as string))?.label || 'None'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_WORK}>None</SelectItem>
              {works.map((w) => <SelectItem key={w.id} value={w.id}>{w.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label className="text-neutral-300 text-xs">Target audience (optional)</Label>
        <Input
          value={audience}
          onChange={(e) => setAudience(e.target.value)}
          placeholder="e.g. Gen-Z snack lovers, India, English"
          className="mt-1 bg-neutral-800 border-neutral-700 text-white"
          disabled={busy}
        />
      </div>

      {error && (
        <div className="bg-red-950/40 border border-red-900 text-red-300 px-3 py-2 rounded text-sm">{error}</div>
      )}

      <Button
        onClick={handleGenerate}
        disabled={busy || isPending || !brief.trim()}
        className="bg-lime-400 text-black hover:bg-lime-300"
      >
        {busy ? 'Generating variants…' : isPending ? 'Opening…' : 'Generate prompts'}
      </Button>

      {busy && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-28 rounded-lg bg-neutral-800/60 animate-pulse" />
          ))}
        </div>
      )}
    </div>
  )
}

'use client'

// app/app/studio/brief-form.tsx — Studio input.
// Single unified container (no nested boxes). Big brief textarea up top, then
// pill-style segmented controls and chip groups underneath. Generate is a
// large lime pill at the bottom right.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, Video, ImageIcon, ChevronDown } from 'lucide-react'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

type MediaType = 'video' | 'image'

// base-ui Select can't take an empty-string item value; use a sentinel for "no work".
const NONE_WORK = '__none'

const PLATFORMS: Array<{ id: string; label: string }> = [
  { id: 'tiktok', label: 'TikTok' },
  { id: 'reels', label: 'Reels' },
  { id: 'shorts', label: 'Shorts' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'instagram_feed', label: 'IG Feed' },
  { id: 'other', label: 'Other' },
]
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
    <div className="relative">
      {/* Soft glow behind the form for a non-boxy feel */}
      <div className="absolute -inset-px rounded-2xl bg-gradient-to-br from-lime-400/10 via-transparent to-transparent blur-sm pointer-events-none" />

      <div className="relative rounded-2xl bg-neutral-950/80 border border-neutral-800/80 backdrop-blur-sm overflow-hidden">
        {/* BRIEF — textarea is the hero, no inner box chrome */}
        <div className="px-6 pt-6 pb-2">
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            placeholder="What do you want to make? e.g. A 15s UGC reel of a girl unboxing our stuffed cookie, deadpan reaction, ends on the gooey center reveal."
            disabled={busy}
            rows={3}
            className="w-full bg-transparent border-0 outline-none resize-none text-white placeholder:text-neutral-600 text-lg leading-relaxed focus:ring-0"
          />
        </div>

        <div className="border-t border-neutral-900 px-6 py-4 space-y-4">
          {/* MEDIA TYPE — segmented pill */}
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[10px] uppercase tracking-wider text-neutral-500 w-16">Type</span>
            <div className="inline-flex rounded-full bg-neutral-900 p-0.5 border border-neutral-800">
              <button
                type="button"
                onClick={() => { setMediaType('video'); setTargetModel('') }}
                disabled={busy}
                className={mediaType === 'video'
                  ? 'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1 text-xs font-medium bg-lime-400 text-black'
                  : 'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1 text-xs font-medium text-neutral-400 hover:text-white'
                }
              >
                <Video className="size-3.5" /> Video
              </button>
              <button
                type="button"
                onClick={() => { setMediaType('image'); setTargetModel('') }}
                disabled={busy}
                className={mediaType === 'image'
                  ? 'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1 text-xs font-medium bg-lime-400 text-black'
                  : 'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1 text-xs font-medium text-neutral-400 hover:text-white'
                }
              >
                <ImageIcon className="size-3.5" /> Image
              </button>
            </div>
          </div>

          {/* PLATFORM — chip group */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-neutral-500 w-16">For</span>
            <div className="flex flex-wrap gap-1.5">
              {PLATFORMS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPlatform(p.id)}
                  disabled={busy}
                  className={platform === p.id
                    ? 'rounded-full px-3 py-1 text-xs font-medium bg-lime-400 text-black'
                    : 'rounded-full px-3 py-1 text-xs font-medium bg-neutral-900 border border-neutral-800 text-neutral-300 hover:border-neutral-700 hover:text-white'
                  }
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* TARGET MODEL — chip group, optional */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-neutral-500 w-16">Model</span>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setTargetModel('')}
                disabled={busy}
                className={targetModel === ''
                  ? 'rounded-full px-3 py-1 text-xs font-medium bg-lime-400 text-black'
                  : 'rounded-full px-3 py-1 text-xs font-medium bg-neutral-900 border border-neutral-800 text-neutral-300 hover:border-neutral-700 hover:text-white'
                }
              >
                Any
              </button>
              {models.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setTargetModel(m)}
                  disabled={busy}
                  className={targetModel === m
                    ? 'rounded-full px-3 py-1 text-xs font-medium bg-lime-400 text-black'
                    : 'rounded-full px-3 py-1 text-xs font-medium bg-neutral-900 border border-neutral-800 text-neutral-300 hover:border-neutral-700 hover:text-white'
                  }
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* AUDIENCE — inline minimal input */}
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[10px] uppercase tracking-wider text-neutral-500 w-16">Audience</span>
            <input
              type="text"
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              placeholder="optional · e.g. Gen-Z snack lovers, India, English"
              disabled={busy}
              className="flex-1 min-w-0 bg-transparent border-0 border-b border-neutral-800 focus:border-lime-400 outline-none text-sm text-white placeholder:text-neutral-600 py-1 transition-colors"
            />
          </div>

          {/* ATTACH — kept as Select since list is dynamic; styled compact */}
          {works.length > 0 && (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[10px] uppercase tracking-wider text-neutral-500 w-16">Attach</span>
              <Select value={workId} onValueChange={(v) => setWorkId(v as string)}>
                <SelectTrigger className="h-7 bg-neutral-900 border-neutral-800 text-xs rounded-full px-3 gap-1.5 hover:border-neutral-700">
                  <SelectValue>
                    {(v: unknown) => {
                      const sel = v as string
                      if (sel === NONE_WORK) return <span className="text-neutral-500">No work</span>
                      return works.find((w) => w.id === sel)?.label || 'No work'
                    }}
                  </SelectValue>
                  <ChevronDown className="size-3 text-neutral-500" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_WORK}>No work</SelectItem>
                  {works.map((w) => <SelectItem key={w.id} value={w.id}>{w.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* CTA bar */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-neutral-900 bg-neutral-950/60">
          {error ? (
            <span className="text-xs text-red-400">{error}</span>
          ) : (
            <span className="text-xs text-neutral-500">
              {brief.trim().length > 0
                ? `${brief.trim().length} characters · ${mediaType} for ${platform}`
                : 'Describe your idea above to start'}
            </span>
          )}

          <button
            type="button"
            onClick={handleGenerate}
            disabled={busy || isPending || !brief.trim()}
            className="inline-flex items-center gap-2 rounded-full bg-lime-400 hover:bg-lime-300 text-black font-semibold px-5 py-2 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Sparkles className="size-4" />
            {busy ? 'Generating variants…' : isPending ? 'Opening…' : 'Generate prompts'}
          </button>
        </div>
      </div>

      {/* SHIMMER — only when generating, sits below the form */}
      {busy && (
        <div className="mt-4 space-y-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="flex gap-3 items-stretch rounded-xl overflow-hidden"
            >
              <div className="w-1 bg-gradient-to-b from-lime-400/40 to-lime-400/10 animate-pulse" />
              <div className="flex-1 h-24 bg-neutral-900/50 animate-pulse" />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

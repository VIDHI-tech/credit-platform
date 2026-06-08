'use client'

// app/app/studio/variant-card.tsx — one variant rendered as a numbered section
// with a left-edge lime accent stripe (no full box border). Copy button +
// collapsible structured breakdown.

import { useState } from 'react'
import { Check, Copy, ChevronRight } from 'lucide-react'
import type { PromptSchema } from '@/lib/studio/schema'

export function VariantCard({
  index, label, renderedPrompt, schema,
}: {
  index: number
  label: string
  renderedPrompt: string
  schema: PromptSchema
}) {
  const [copied, setCopied] = useState(false)
  const [showSchema, setShowSchema] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(renderedPrompt)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="group flex gap-4 items-stretch">
      {/* LEFT ACCENT STRIPE with the variant number */}
      <div className="flex flex-col items-center gap-2 pt-1">
        <span className="inline-flex size-7 items-center justify-center rounded-full bg-lime-400/10 border border-lime-400/30 text-lime-400 text-xs font-semibold font-mono">
          {index}
        </span>
        <div className="flex-1 w-px bg-gradient-to-b from-lime-400/30 via-neutral-800 to-transparent" />
      </div>

      {/* BODY */}
      <div className="flex-1 min-w-0 pb-2">
        {/* Title row */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <h3 className="text-base font-semibold text-white leading-tight">
            {label}
          </h3>
          <button
            type="button"
            onClick={handleCopy}
            className={copied
              ? 'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium bg-lime-400 text-black transition-colors'
              : 'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium bg-neutral-900 border border-neutral-800 text-neutral-300 hover:border-lime-400 hover:text-lime-400 transition-colors'
            }
          >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            {copied ? 'Copied' : 'Copy prompt'}
          </button>
        </div>

        {/* Rendered prompt — subtle bg, no border */}
        <pre className="rounded-xl bg-neutral-900/60 p-4 text-sm text-neutral-200 whitespace-pre-wrap font-mono max-h-96 overflow-auto leading-relaxed">
          {renderedPrompt}
        </pre>

        {/* Schema toggle */}
        <button
          type="button"
          onClick={() => setShowSchema((v) => !v)}
          className="mt-2 inline-flex items-center gap-1.5 text-xs text-neutral-500 hover:text-white transition-colors"
        >
          <ChevronRight
            className={showSchema ? 'size-3.5 rotate-90 transition-transform' : 'size-3.5 transition-transform'}
          />
          {showSchema ? 'Hide structured breakdown' : 'Show structured breakdown'}
        </button>
        {showSchema && (
          <pre className="mt-2 rounded-xl bg-neutral-900/40 p-4 text-xs text-neutral-500 whitespace-pre-wrap font-mono max-h-80 overflow-auto">
            {JSON.stringify(schema, null, 2)}
          </pre>
        )}
      </div>
    </div>
  )
}

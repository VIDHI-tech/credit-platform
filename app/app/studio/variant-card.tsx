'use client'

// app/app/studio/variant-card.tsx — one variant: copyable rendered prompt +
// collapsible structured breakdown. (Scoring / Enhance UI lands in Phases 2/3.)

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { PromptSchema } from '@/lib/studio/schema'

export function VariantCard({
  label, renderedPrompt, schema,
}: {
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
    <div className="bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between">
        <h3 className="font-semibold text-white text-sm">{label}</h3>
        <Button size="sm" onClick={handleCopy} className="bg-lime-400 text-black hover:bg-lime-300 h-8">
          {copied ? 'Copied ✓' : 'Copy prompt'}
        </Button>
      </div>

      <pre className="p-4 text-sm text-neutral-200 whitespace-pre-wrap font-mono max-h-96 overflow-auto">
        {renderedPrompt}
      </pre>

      <button
        onClick={() => setShowSchema((v) => !v)}
        className="w-full px-4 py-2 text-xs text-neutral-400 hover:text-white border-t border-neutral-800 text-left"
      >
        {showSchema ? '▾ Hide structured breakdown' : '▸ Show structured breakdown'}
      </button>
      {showSchema && (
        <pre className="px-4 pb-4 text-xs text-neutral-500 whitespace-pre-wrap font-mono max-h-80 overflow-auto">
          {JSON.stringify(schema, null, 2)}
        </pre>
      )}
    </div>
  )
}

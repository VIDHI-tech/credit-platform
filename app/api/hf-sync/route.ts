// app/api/hf-sync/route.ts
// Server-side route that runs the Higgsfield CLI and upserts into Supabase.
import { NextResponse } from 'next/server'
import { fetchHFGenerations } from '@/lib/hf-adapter'
import { supabase } from '@/lib/supabase'

// execSync requires the Node.js runtime (not edge), and the result must never be cached.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    // 1. Fetch from HF CLI
    const generations = fetchHFGenerations()

    if (generations.length === 0) {
      return NextResponse.json({
        synced: 0,
        message: 'No completed generations found',
      })
    }

    // 2. Upsert into Supabase (dedupe on external_id).
    // The row objects intentionally OMIT client_id and assigned_at so that
    // re-syncing never overwrites existing assignments.
    const rows = generations.map((g) => ({
      external_id: g.externalId,
      display_name: g.displayName,
      job_set_type: g.jobSetType,
      result_url: g.resultUrl,
      media_type: g.mediaType,
      prompt: g.prompt,
      credits: g.credits,
      hf_created_at: g.createdAt,
      synced_at: new Date().toISOString(),
    }))

    const { error } = await supabase.from('generations').upsert(rows, {
      onConflict: 'external_id',
      ignoreDuplicates: false, // update non-assignment fields on re-sync
    })

    if (error) {
      console.error('Supabase upsert error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      synced: generations.length,
      message: `Synced ${generations.length} generations`,
    })
  } catch (err) {
    console.error('Sync error:', err)
    let message = err instanceof Error ? err.message : 'Sync failed'
    const cause = (err as { cause?: { code?: string } })?.cause?.code
    if (cause) message += ` (${cause})`
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

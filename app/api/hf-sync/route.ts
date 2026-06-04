// app/api/hf-sync/route.ts — runs the HF CLI and upserts into the user's org.
import { NextResponse } from 'next/server'
import { fetchHFGenerations } from '@/lib/hf-adapter'
import { createClient } from '@/lib/supabase-server'

// execSync requires the Node.js runtime; never cache.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Resolve the user's active org.
    const { data: membership } = await supabase
      .from('memberships')
      .select('org_id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle()

    if (!membership) {
      return NextResponse.json(
        { error: 'No active organization' },
        { status: 403 }
      )
    }

    const generations = fetchHFGenerations()
    if (generations.length === 0) {
      return NextResponse.json({ synced: 0, message: 'No generations found' })
    }

    // Stamp org_id; OMIT client_id/assigned_at so re-sync never wipes assignments.
    const rows = generations.map((g) => ({
      org_id: membership.org_id,
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

    const { error } = await supabase
      .from('generations')
      .upsert(rows, { onConflict: 'org_id,external_id', ignoreDuplicates: false })

    if (error) {
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

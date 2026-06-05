// app/api/hf-sync/route.ts — sync from the org's ACTIVE Higgsfield connection.
import { NextResponse } from 'next/server'
import { fetchHFGenerations } from '@/lib/hf-adapter'
import { withActiveHFToken, NoHFConnectionError } from '@/lib/hf-connection'
import { createClient } from '@/lib/supabase-server'

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

    // Pull generations using the active connection's token (auto-refresh on 401).
    const generations = await withActiveHFToken(
      supabase,
      membership.org_id,
      (token) => fetchHFGenerations(token)
    )

    if (generations.length === 0) {
      return NextResponse.json({ synced: 0, message: 'No generations found' })
    }

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
    if (err instanceof NoHFConnectionError) {
      return NextResponse.json(
        { error: 'No Higgsfield account connected. Add one in Settings.' },
        { status: 409 }
      )
    }
    console.error('Sync error:', err)
    let message = err instanceof Error ? err.message : 'Sync failed'
    const cause = (err as { cause?: { code?: string } })?.cause?.code
    if (cause) message += ` (${cause})`
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

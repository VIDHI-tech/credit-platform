// app/api/works/[id]/route.ts — edit + delete a work.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** PATCH — edit work fields (master/manager only). */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { data: work } = await supabase
      .from('works')
      .select('id, org_id')
      .eq('id', id)
      .maybeSingle()
    if (!work) {
      return NextResponse.json({ error: 'Work not found' }, { status: 404 })
    }

    const { data: membership } = await supabase
      .from('memberships')
      .select('role')
      .eq('user_id', user.id)
      .eq('org_id', work.org_id)
      .eq('status', 'active')
      .maybeSingle()
    if (!membership || (membership.role !== 'master' && membership.role !== 'manager')) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    // Only allow specific fields to be updated. `creator_ids` is handled
    // separately below since it needs to sync the work_creators join table.
    const allowedFields = [
      'title', 'creator_id', 'video_type', 'max_credits',
      'start_date', 'end_date', 'start_time', 'end_time', 'notes',
    ]
    const update: Record<string, unknown> = {}
    for (const key of allowedFields) {
      if (key in body) update[key] = body[key]
    }

    const incomingCreatorIds: string[] | undefined = Array.isArray(
      body.creator_ids,
    )
      ? body.creator_ids.filter((v: unknown) => typeof v === 'string')
      : undefined

    if (Object.keys(update).length === 0 && !incomingCreatorIds) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    if (Object.keys(update).length > 0) {
      const { error } = await supabase
        .from('works')
        .update(update)
        .eq('id', id)
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
    }

    // Sync work_creators: full replace. Clients pass the complete list
    // (primary first); we wipe and re-insert. The composite PK on
    // (work_id, user_id) plus ON CONFLICT DO NOTHING protects against
    // duplicates.
    if (incomingCreatorIds) {
      if (incomingCreatorIds.length === 0) {
        return NextResponse.json(
          { error: 'creator_ids must include at least one user' },
          { status: 400 },
        )
      }
      const { error: delErr } = await supabase
        .from('work_creators')
        .delete()
        .eq('work_id', id)
      if (delErr) {
        return NextResponse.json({ error: delErr.message }, { status: 500 })
      }
      const rows = incomingCreatorIds.map((uid) => ({
        work_id: id,
        user_id: uid,
        added_by: user.id,
      }))
      const { error: insErr } = await supabase
        .from('work_creators')
        .insert(rows)
      if (insErr) {
        return NextResponse.json({ error: insErr.message }, { status: 500 })
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Update failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/** DELETE — delete a work (master only). Generations' work_id → null via FK cascade. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { data: work } = await supabase
      .from('works')
      .select('id, org_id')
      .eq('id', id)
      .maybeSingle()
    if (!work) {
      return NextResponse.json({ error: 'Work not found' }, { status: 404 })
    }

    const { data: membership } = await supabase
      .from('memberships')
      .select('role')
      .eq('user_id', user.id)
      .eq('org_id', work.org_id)
      .eq('status', 'active')
      .maybeSingle()
    if (!membership || membership.role !== 'master') {
      return NextResponse.json({ error: 'Only master can delete works' }, { status: 403 })
    }

    // Unassign generations from this work first
    await supabase
      .from('generations')
      .update({ work_id: null })
      .eq('work_id', id)

    const { error } = await supabase
      .from('works')
      .delete()
      .eq('id', id)
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Delete failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

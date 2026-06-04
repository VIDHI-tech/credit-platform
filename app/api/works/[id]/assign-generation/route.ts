// app/api/works/[id]/assign-generation/route.ts — assign a generation to BOTH client + work.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: workId } = await params
    const { generationId, clientId } = await req.json()
    if (!generationId || !clientId) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { data: work } = await supabase
      .from('works')
      .select('id, client_id, creator_id, org_id')
      .eq('id', workId)
      .maybeSingle()
    if (!work) {
      return NextResponse.json({ error: 'Work not found' }, { status: 404 })
    }
    if (work.client_id !== clientId) {
      return NextResponse.json({ error: 'Client mismatch' }, { status: 400 })
    }

    const { data: membership } = await supabase
      .from('memberships')
      .select('role')
      .eq('user_id', user.id)
      .eq('org_id', work.org_id)
      .eq('status', 'active')
      .maybeSingle()
    if (!membership) {
      return NextResponse.json({ error: 'Not a member' }, { status: 403 })
    }

    const canAssign =
      membership.role === 'master' ||
      membership.role === 'manager' ||
      work.creator_id === user.id
    if (!canAssign) {
      return NextResponse.json(
        { error: 'Cannot assign to this work' },
        { status: 403 }
      )
    }

    const { error } = await supabase
      .from('generations')
      .update({
        client_id: clientId,
        work_id: workId,
        assigned_at: new Date().toISOString(),
      })
      .eq('id', generationId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Assign failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// app/api/generations/[id]/unassign/route.ts — unassign a generation from its client/work.
// Creator: only within 10s of assignment. Master/manager: anytime.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: generationId } = await params
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Get the generation
    const { data: gen } = await supabase
      .from('generations')
      .select('id, assigned_by, assigned_at, org_id')
      .eq('id', generationId)
      .maybeSingle()
    if (!gen) {
      return NextResponse.json({ error: 'Generation not found' }, { status: 404 })
    }

    // Get user's membership
    const { data: membership } = await supabase
      .from('memberships')
      .select('role, org_id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle()
    if (!membership) {
      return NextResponse.json({ error: 'Not a member' }, { status: 403 })
    }

    const isMasterOrManager = membership.role === 'master' || membership.role === 'manager'

    if (!isMasterOrManager) {
      // Creator: must be the one who assigned it, within 10s
      if (gen.assigned_by !== user.id) {
        return NextResponse.json(
          { error: 'You did not assign this generation' },
          { status: 403 }
        )
      }
      if (gen.assigned_at) {
        const elapsed = Date.now() - new Date(gen.assigned_at).getTime()
        if (elapsed > 10000) {
          return NextResponse.json(
            { error: 'Unassign window expired (10 seconds)' },
            { status: 403 }
          )
        }
      }
    }

    const { error } = await supabase
      .from('generations')
      .update({
        client_id: null,
        work_id: null,
        assigned_at: null,
        assigned_by: null,
      })
      .eq('id', generationId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unassign failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

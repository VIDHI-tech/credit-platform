// app/api/works/[id]/status/route.ts — status transitions with server-side enforcement.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import type { WorkStatus } from '@/lib/work-helpers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Role = 'master' | 'manager' | 'creator'

const ALLOWED: Record<
  WorkStatus,
  { roles: Role[]; from: WorkStatus[]; ownWorkOnly?: boolean }[]
> = {
  in_review: [
    {
      roles: ['creator', 'manager'],
      from: ['ongoing', 'rework'],
      ownWorkOnly: true,
    },
  ],
  paused: [{ roles: ['master', 'manager'], from: ['ongoing', 'rework'] }],
  ongoing: [{ roles: ['master', 'manager'], from: ['paused'] }],
  rework: [{ roles: ['master', 'manager'], from: ['in_review'] }],
  completed: [{ roles: ['master', 'manager'], from: ['in_review'] }],
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { to } = (await req.json()) as { to: WorkStatus }
    if (!to || !ALLOWED[to]) {
      return NextResponse.json({ error: 'Invalid target status' }, { status: 400 })
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
      .select('id, org_id, creator_id, status')
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
    if (!membership) {
      return NextResponse.json(
        { error: 'Not a member of this org' },
        { status: 403 }
      )
    }

    const role = membership.role as Role
    const isOwn = work.creator_id === user.id
    const currentStatus = work.status as WorkStatus

    const rule = ALLOWED[to].find((r) => r.roles.includes(role))
    if (!rule) {
      return NextResponse.json(
        { error: `${role} cannot transition to ${to}` },
        { status: 403 }
      )
    }
    if (!rule.from.includes(currentStatus)) {
      return NextResponse.json(
        { error: `Cannot move from ${currentStatus} to ${to}` },
        { status: 400 }
      )
    }
    if (rule.ownWorkOnly && !isOwn) {
      return NextResponse.json(
        { error: 'Only the assigned creator can do this' },
        { status: 403 }
      )
    }

    const { error } = await supabase
      .from('works')
      .update({ status: to })
      .eq('id', id)
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, status: to })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Transition failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

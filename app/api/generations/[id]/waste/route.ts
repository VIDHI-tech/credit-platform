// app/api/generations/[id]/waste/route.ts — mark/unmark a generation as waste.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: generationId } = await params
    const { is_waste } = (await req.json()) as { is_waste: boolean }
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Any active member can mark as waste; only master/manager can un-waste
    const { data: membership } = await supabase
      .from('memberships')
      .select('role')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle()
    if (!membership) {
      return NextResponse.json({ error: 'Not a member' }, { status: 403 })
    }

    if (!is_waste && membership.role === 'creator') {
      return NextResponse.json(
        { error: 'Only master/manager can un-waste' },
        { status: 403 }
      )
    }

    const updateData = is_waste
      ? {
          is_waste: true,
          wasted_at: new Date().toISOString(),
          wasted_by: user.id,
        }
      : {
          is_waste: false,
          wasted_at: null,
          wasted_by: null,
        }

    const { error } = await supabase
      .from('generations')
      .update(updateData)
      .eq('id', generationId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Waste toggle failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

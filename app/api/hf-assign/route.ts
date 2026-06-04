// app/api/hf-assign/route.ts
// Assigns a generation to a client (sets client_id + assigned_at).
import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const { generationId, clientId } = await req.json()

    if (!generationId || !clientId) {
      return NextResponse.json(
        { error: 'generationId and clientId required' },
        { status: 400 }
      )
    }

    const { error } = await supabase
      .from('generations')
      .update({
        client_id: clientId,
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

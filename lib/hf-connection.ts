// lib/hf-connection.ts — server-side helper to use an org's active HF token,
// transparently refreshing + persisting it on 401. SERVER ONLY.
import type { SupabaseClient } from '@supabase/supabase-js'
import { decrypt, encrypt } from './hf-crypto'
import { refreshTokens, expiresAtFrom } from './hf-auth'
import { HFUnauthorizedError } from './hf-adapter'

export class NoHFConnectionError extends Error {
  constructor() {
    super('No active Higgsfield account connected')
    this.name = 'NoHFConnectionError'
  }
}

interface ConnRow {
  id: string
  access_token_enc: string
  refresh_token_enc: string
}

/**
 * Run `fn` with the active connection's decrypted access token. If the call
 * throws HFUnauthorizedError, refresh the token once, persist the rotated
 * pair (via the SECURITY DEFINER rpc), and retry.
 */
export async function withActiveHFToken<T>(
  supabase: SupabaseClient,
  orgId: string,
  fn: (accessToken: string) => Promise<T>
): Promise<T> {
  const { data: conn } = await supabase
    .from('hf_connections')
    .select('id, access_token_enc, refresh_token_enc')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .maybeSingle<ConnRow>()

  if (!conn) throw new NoHFConnectionError()

  try {
    return await fn(decrypt(conn.access_token_enc))
  } catch (err) {
    if (!(err instanceof HFUnauthorizedError)) throw err

    // Refresh and persist, then retry once.
    const tokens = await refreshTokens(decrypt(conn.refresh_token_enc))
    await supabase.rpc('hf_rotate_tokens', {
      p_id: conn.id,
      p_access_enc: encrypt(tokens.access_token),
      p_refresh_enc: encrypt(tokens.refresh_token),
      p_expires_at: expiresAtFrom(tokens),
    })
    return await fn(tokens.access_token)
  }
}

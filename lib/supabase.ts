// lib/supabase.ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Supabase is fronted by Cloudflare. From Node's fetch, the first (cold)
// TCP/TLS connection occasionally exceeds undici's 10s connect timeout and
// throws "TypeError: fetch failed" (UND_ERR_CONNECT_TIMEOUT). A fresh attempt
// recovers reliably, so wrap fetch with a small backoff retry.
//
// Only thrown errors (network/timeout) are retried — PostgREST returns HTTP
// errors as normal responses, so real errors (e.g. a bad column) are NOT
// retried. Our writes are idempotent (upsert on external_id; assign sets a
// fixed value), so re-sending on a lost response is safe.
const fetchWithRetry: typeof fetch = async (input, init) => {
  let lastError: unknown
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await fetch(input, init)
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)))
    }
  }
  throw lastError
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: fetchWithRetry },
})

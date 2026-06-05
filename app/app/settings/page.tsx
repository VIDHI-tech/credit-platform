// app/app/settings/page.tsx — master-only. Manage HF connections + industries + video types.
import { requireRole } from '@/lib/auth-helpers'
import { createClient } from '@/lib/supabase-server'
import { ConnectionsList } from './connections-list'
import { IndustriesSection } from './industries-section'

interface ConnectionRow {
  id: string
  label: string
  hf_email: string | null
  is_active: boolean
  created_at: string
}

interface IndustryRow {
  id: string
  name: string
}

export default async function SettingsPage() {
  const membership = await requireRole(['master'])
  const supabase = await createClient()

  // NOTE: never select the *_enc token columns into the page — tokens stay server-side.
  const [{ data: connections }, { data: industries }] = await Promise.all([
    supabase
      .from('hf_connections')
      .select('id, label, hf_email, is_active, created_at')
      .eq('org_id', membership.org_id)
      .order('created_at', { ascending: true }),
    supabase
      .from('industries')
      .select('id, name')
      .eq('org_id', membership.org_id)
      .order('name'),
  ])

  return (
    <div className="p-6 max-w-3xl space-y-6 text-neutral-100">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-neutral-400 text-sm mt-1">
          Manage accounts, industries, and other organization settings.
        </p>
      </div>

      <section className="bg-neutral-950 border border-neutral-800 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-800">
          <h2 className="font-semibold text-white">Higgsfield Accounts</h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Sync &amp; Assign pulls from every enabled account you have access
            to. Disable an account to keep it idle without revoking creator
            grants.
          </p>
        </div>
        <ConnectionsList
          orgId={membership.org_id}
          connections={(connections as ConnectionRow[]) || []}
        />
      </section>

      <section className="bg-neutral-950 border border-neutral-800 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-800">
          <h2 className="font-semibold text-white">Industries</h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Manage the industry dropdown used when creating works.
            Add, rename, or delete industries here.
          </p>
        </div>
        <IndustriesSection
          orgId={membership.org_id}
          industries={(industries as IndustryRow[]) || []}
        />
      </section>
    </div>
  )
}

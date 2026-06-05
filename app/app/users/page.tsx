// app/app/users/page.tsx — master only. Pending requests + active members + HF grants.
import { requireRole } from '@/lib/auth-helpers'
import { createClient } from '@/lib/supabase-server'
import { ApprovalControls } from './approval-controls'
import { AccountGrantsManager } from './account-grants-manager'

export default async function UsersPage() {
  const membership = await requireRole(['master'])
  const supabase = await createClient()

  const [{ data: pending }, { data: active }, { data: connections }, { data: grants }] = await Promise.all([
    supabase
      .from('memberships')
      .select('id, user_id, full_name, requested_at')
      .eq('org_id', membership.org_id)
      .eq('status', 'pending')
      .order('requested_at', { ascending: false }),
    supabase
      .from('memberships')
      .select('id, user_id, full_name, role, approved_at')
      .eq('org_id', membership.org_id)
      .eq('status', 'active')
      .order('approved_at', { ascending: true }),
    supabase
      .from('hf_connections')
      .select('id, label, hf_email')
      .eq('org_id', membership.org_id)
      .order('created_at', { ascending: true }),
    supabase
      .from('hf_connection_grants')
      .select('id, connection_id, user_id')
      .eq('org_id', membership.org_id),
  ])

  const creators = (active || []).filter((m) => m.role === 'creator')

  return (
    <div className="p-6 space-y-8 text-neutral-100">
      <div>
        <h1 className="text-2xl font-bold text-white">Users &amp; Approvals</h1>
        <p className="text-neutral-400 text-sm mt-1">
          Manage who can access {membership.org_name}.
        </p>
      </div>

      {/* PENDING */}
      <section className="bg-neutral-950 border border-neutral-800 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between">
          <h2 className="font-semibold text-white">Pending Requests</h2>
          <span className="text-yellow-400 text-sm">{pending?.length || 0}</span>
        </div>
        {!pending || pending.length === 0 ? (
          <div className="p-6 text-center text-neutral-500 text-sm">
            No pending requests.
          </div>
        ) : (
          <div className="divide-y divide-neutral-800">
            {pending.map((p) => (
              <div
                key={p.id}
                className="px-4 py-3 flex items-center justify-between gap-4"
              >
                <div>
                  <div className="font-medium text-white">{p.full_name}</div>
                  <div className="text-xs text-neutral-500">
                    Requested {new Date(p.requested_at).toLocaleString()}
                  </div>
                </div>
                <ApprovalControls membershipId={p.id} />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ACTIVE */}
      <section className="bg-neutral-950 border border-neutral-800 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between">
          <h2 className="font-semibold text-white">Active Members</h2>
          <span className="text-green-400 text-sm">{active?.length || 0}</span>
        </div>
        <div className="divide-y divide-neutral-800">
          {active?.map((a) => (
            <div
              key={a.id}
              className="px-4 py-3 flex items-center justify-between"
            >
              <div>
                <div className="font-medium text-white">{a.full_name}</div>
                <div className="text-xs text-neutral-500 capitalize">
                  {a.role}
                </div>
              </div>
              <span className="text-xs text-neutral-500">
                Joined {new Date(a.approved_at).toLocaleDateString('en-US')}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* HF ACCOUNT ACCESS */}
      <section className="bg-neutral-950 border border-neutral-800 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-800">
          <h2 className="font-semibold text-white">Higgsfield Account Access</h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Control which HF accounts each creator can use. Expand a creator to
            toggle individual accounts.
          </p>
        </div>
        <AccountGrantsManager
          orgId={membership.org_id}
          connections={(connections || []).map((c) => ({
            id: c.id,
            label: c.label,
            hf_email: c.hf_email,
          }))}
          creators={creators.map((c) => ({
            id: c.id,
            user_id: c.user_id,
            full_name: c.full_name,
          }))}
          grants={(grants || []).map((g) => ({
            id: g.id,
            connection_id: g.connection_id,
            user_id: g.user_id,
          }))}
        />
      </section>
    </div>
  )
}

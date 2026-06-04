// app/app/dashboard/page.tsx — placeholder. Phase 5 builds the real dashboard.
import { requireActiveMembership } from '@/lib/auth-helpers'

export default async function DashboardPage() {
  const membership = await requireActiveMembership()

  return (
    <div className="p-8 space-y-6 text-neutral-100">
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-neutral-400 text-sm mt-1">
          Welcome, {membership.full_name}. (Full dashboard arrives in Phase 5.)
        </p>
      </div>
      <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-6 text-neutral-400">
        <p>
          Coming in Phase 5: deadlines, unassigned tokens, totals, client status
          breakdown.
        </p>
        <p className="mt-2">For now → Sync &amp; Assign in the sidebar.</p>
      </div>
    </div>
  )
}

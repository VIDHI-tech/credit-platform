// app/app/reports/page.tsx — the north-star report (master/manager only).
import { requireRole } from '@/lib/auth-helpers'
import { createClient } from '@/lib/supabase-server'
import Link from 'next/link'
import { DateRangeFilter } from './date-range-filter'
import { ClientChart } from './client-chart'
import { CreatorChart } from './creator-chart'
import { ModelChart } from './model-chart'
import { TrendsChart } from './trends-chart'
import { GenerationsDrilldown } from './generations-drilldown'
import { ExportButton } from './export-button'

interface PageProps {
  searchParams: Promise<{
    from?: string
    to?: string
    clientId?: string
    model?: string
    creatorId?: string
  }>
}

export default async function ReportsPage({ searchParams }: PageProps) {
  await requireRole(['master', 'manager'])
  const params = await searchParams
  const supabase = await createClient()

  // Default range: last 30 days
  const today = new Date()
  today.setHours(23, 59, 59, 999)
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)
  thirtyDaysAgo.setHours(0, 0, 0, 0)

  const fromDate = params.from || thirtyDaysAgo.toISOString().split('T')[0]
  const toDate = params.to || today.toISOString().split('T')[0]

  const [{ data: generations }, { data: clients }, { data: works }, { data: memberships }] =
    await Promise.all([
      supabase
        .from('generations')
        .select(
          'id, display_name, result_url, media_type, credits, client_id, work_id, hf_created_at'
        )
        .gte('hf_created_at', `${fromDate}T00:00:00Z`)
        .lte('hf_created_at', `${toDate}T23:59:59Z`)
        .order('hf_created_at', { ascending: false }),
      supabase.from('clients').select('id, name'),
      supabase.from('works').select('id, title, video_type, creator_id, client_id'),
      supabase
        .from('memberships')
        .select('user_id, full_name')
        .eq('status', 'active'),
    ])

  const clientMap = new Map((clients || []).map((c) => [c.id, c.name]))
  const memberMap = new Map((memberships || []).map((m) => [m.user_id, m.full_name]))
  const workMap = new Map((works || []).map((w) => [w.id, w]))

  // ===== AGGREGATIONS =====
  const totalCredits = (generations || []).reduce(
    (s, g) => s + parseFloat(g.credits || '0'),
    0
  )
  const totalGenerations = generations?.length || 0

  // CLIENT-WISE
  const byClient = new Map<string, { name: string; credits: number; count: number }>()
  ;(generations || []).forEach((g) => {
    if (!g.client_id) return
    const existing = byClient.get(g.client_id) || {
      name: clientMap.get(g.client_id) || 'Unknown',
      credits: 0,
      count: 0,
    }
    existing.credits += parseFloat(g.credits || '0')
    existing.count++
    byClient.set(g.client_id, existing)
  })
  const clientData = Array.from(byClient.entries())
    .map(([id, d]) => ({
      id,
      name: d.name,
      credits: parseFloat(d.credits.toFixed(2)),
      count: d.count,
      percent:
        totalCredits > 0
          ? parseFloat(((d.credits / totalCredits) * 100).toFixed(1))
          : 0,
    }))
    .sort((a, b) => b.credits - a.credits)

  // CREATOR-WISE (via work join)
  const byCreator = new Map<string, { name: string; credits: number; count: number }>()
  ;(generations || []).forEach((g) => {
    if (!g.work_id) return
    const work = workMap.get(g.work_id)
    if (!work) return
    const existing = byCreator.get(work.creator_id) || {
      name: memberMap.get(work.creator_id) || 'Unknown',
      credits: 0,
      count: 0,
    }
    existing.credits += parseFloat(g.credits || '0')
    existing.count++
    byCreator.set(work.creator_id, existing)
  })
  const creatorData = Array.from(byCreator.entries())
    .map(([id, d]) => ({
      id,
      name: d.name,
      credits: parseFloat(d.credits.toFixed(2)),
      count: d.count,
    }))
    .sort((a, b) => b.credits - a.credits)

  // MODEL-WISE
  const byModel = new Map<string, { credits: number; count: number }>()
  ;(generations || []).forEach((g) => {
    const existing = byModel.get(g.display_name) || { credits: 0, count: 0 }
    existing.credits += parseFloat(g.credits || '0')
    existing.count++
    byModel.set(g.display_name, existing)
  })
  const modelData = Array.from(byModel.entries())
    .map(([name, d]) => ({
      name,
      credits: parseFloat(d.credits.toFixed(2)),
      count: d.count,
    }))
    .sort((a, b) => b.credits - a.credits)

  // DAILY TREND
  const byDay = new Map<string, { credits: number; count: number }>()
  ;(generations || []).forEach((g) => {
    const day = g.hf_created_at.split('T')[0]
    const existing = byDay.get(day) || { credits: 0, count: 0 }
    existing.credits += parseFloat(g.credits || '0')
    existing.count++
    byDay.set(day, existing)
  })
  const trendData = Array.from(byDay.entries())
    .map(([date, d]) => ({
      date,
      credits: parseFloat(d.credits.toFixed(2)),
      count: d.count,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))

  // DRILL-DOWN (filtered by url params)
  const filteredGenerations = (generations || []).filter((g) => {
    if (params.clientId && g.client_id !== params.clientId) return false
    if (params.model && g.display_name !== params.model) return false
    if (params.creatorId) {
      if (!g.work_id) return false
      const w = workMap.get(g.work_id)
      if (!w || w.creator_id !== params.creatorId) return false
    }
    return true
  })

  const csvData = clientData.map((c) => ({
    Client: c.name,
    Credits: c.credits,
    'Percent of Total': c.percent + '%',
    Generations: c.count,
  }))

  const uniqueModels = Array.from(
    new Set((generations || []).map((g) => g.display_name))
  )

  return (
    <div className="p-6 space-y-6 text-neutral-100">
      {/* HEADER + DATE FILTER */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Reports</h1>
          <p className="text-neutral-400 text-sm mt-1">
            Credit usage from <span className="text-white">{fromDate}</span> to{' '}
            <span className="text-white">{toDate}</span>
          </p>
        </div>
        <DateRangeFilter
          key={`${fromDate}-${toDate}`}
          fromDate={fromDate}
          toDate={toDate}
        />
      </div>

      {/* KPI ROW */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KpiCard
          label="Total Credits"
          value={totalCredits.toFixed(1)}
          subtext="in selected period"
          color="white"
        />
        <KpiCard
          label="Generations"
          value={totalGenerations.toString()}
          subtext="all models"
          color="white"
        />
        <KpiCard
          label="Top Client"
          value={clientData[0]?.name || '—'}
          subtext={`${(clientData[0]?.credits || 0).toFixed(1)} credits`}
          color="lime"
        />
        <KpiCard
          label="Top Model"
          value={modelData[0]?.name || '—'}
          subtext={`${(modelData[0]?.credits || 0).toFixed(1)} credits`}
          color="orange"
        />
      </div>

      {/* ★ CLIENT-WISE — THE NORTH STAR ★ */}
      <section className="bg-neutral-950 border border-lime-900/50 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold text-white text-lg">
              ★ Client-Wise Credit Usage
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              {clientData.length} clients with credit attribution in this period
            </p>
          </div>
          <ExportButton
            filename={`client-report-${fromDate}-to-${toDate}.csv`}
            data={csvData}
          />
        </div>
        {clientData.length === 0 ? (
          <div className="p-8 text-center text-neutral-500">
            <p>No credits assigned to clients in this period.</p>
            <p className="text-xs mt-1">
              Try a wider date range or assign generations in /app/sync.
            </p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4 p-4">
            <ClientChart data={clientData.slice(0, 10)} />
            <div className="overflow-auto max-h-80">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-neutral-950">
                  <tr className="text-xs text-neutral-500 border-b border-neutral-800">
                    <th className="text-left py-2 pl-2">Client</th>
                    <th className="text-right py-2">Credits</th>
                    <th className="text-right py-2">%</th>
                    <th className="text-right py-2 pr-2">Gens</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800">
                  {clientData.map((row) => (
                    <tr key={row.id} className="hover:bg-neutral-900/40">
                      <td className="py-2 pl-2 text-white">
                        <Link
                          href={`/app/clients/${row.id}`}
                          className="hover:text-lime-400 hover:underline"
                        >
                          {row.name}
                        </Link>
                      </td>
                      <td className="py-2 text-right text-orange-400 font-bold">
                        {row.credits.toFixed(1)}
                      </td>
                      <td className="py-2 text-right text-neutral-400">
                        {row.percent.toFixed(0)}%
                      </td>
                      <td className="py-2 text-right pr-2 text-neutral-400">
                        {row.count}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-neutral-700">
                  <tr>
                    <td className="py-2 pl-2 text-neutral-400 font-medium">
                      Total
                    </td>
                    <td className="py-2 text-right text-white font-bold">
                      {clientData.reduce((s, r) => s + r.credits, 0).toFixed(1)}
                    </td>
                    <td className="py-2 text-right text-neutral-500">100%</td>
                    <td className="py-2 text-right pr-2 text-neutral-400">
                      {clientData.reduce((s, r) => s + r.count, 0)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* CREATOR-WISE */}
      {creatorData.length > 0 && (
        <section className="bg-neutral-950 border border-neutral-800 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-800">
            <h2 className="font-semibold text-white">Creator-Wise Credit Usage</h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Credits attributed via work assignments
            </p>
          </div>
          <div className="p-4">
            <CreatorChart data={creatorData} />
          </div>
        </section>
      )}

      {/* MODEL BREAKDOWN */}
      <section className="bg-neutral-950 border border-neutral-800 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-800">
          <h2 className="font-semibold text-white">Credits by Model</h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Which models burn the most credits
          </p>
        </div>
        {modelData.length === 0 ? (
          <div className="p-8 text-center text-neutral-500">
            No generations in this period.
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4 p-4">
            <ModelChart data={modelData.filter((d) => d.credits > 0)} />
            <div className="overflow-auto max-h-80">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-neutral-950">
                  <tr className="text-xs text-neutral-500 border-b border-neutral-800">
                    <th className="text-left py-2 pl-2">Model</th>
                    <th className="text-right py-2">Credits</th>
                    <th className="text-right py-2 pr-2">Gens</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800">
                  {modelData.map((row) => (
                    <tr key={row.name}>
                      <td className="py-2 pl-2 text-white">{row.name}</td>
                      <td
                        className={`py-2 text-right font-bold ${row.credits > 0 ? 'text-orange-400' : 'text-neutral-600'}`}
                      >
                        {row.credits > 0 ? row.credits.toFixed(1) : 'free'}
                      </td>
                      <td className="py-2 text-right pr-2 text-neutral-400">
                        {row.count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* DAILY TREND */}
      <section className="bg-neutral-950 border border-neutral-800 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-800">
          <h2 className="font-semibold text-white">Daily Credit Usage</h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Credits spent per day in this period
          </p>
        </div>
        <div className="p-4">
          {trendData.length === 0 ? (
            <div className="text-center text-neutral-500 py-8">No data.</div>
          ) : (
            <TrendsChart data={trendData} />
          )}
        </div>
      </section>

      {/* DRILL-DOWN GENERATIONS */}
      <section className="bg-neutral-950 border border-neutral-800 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-800">
          <h2 className="font-semibold text-white">All Generations in Period</h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            {filteredGenerations.length}{' '}
            {filteredGenerations.length === 1 ? 'generation' : 'generations'} —
            drill down with filters
          </p>
        </div>
        <GenerationsDrilldown
          generations={filteredGenerations.map((g) => ({
            id: g.id,
            display_name: g.display_name,
            result_url: g.result_url,
            media_type: g.media_type,
            credits: parseFloat(g.credits || '0'),
            hf_created_at: g.hf_created_at,
            client_name: g.client_id
              ? clientMap.get(g.client_id) || 'Unknown'
              : 'Unassigned',
            creator_name: g.work_id
              ? memberMap.get(workMap.get(g.work_id)?.creator_id || '') ||
                'Unknown'
              : '—',
          }))}
          clients={clients || []}
          memberships={memberships || []}
          models={uniqueModels}
          activeFilters={{
            clientId: params.clientId,
            model: params.model,
            creatorId: params.creatorId,
          }}
          fromDate={fromDate}
          toDate={toDate}
        />
      </section>
    </div>
  )
}

function KpiCard({
  label,
  value,
  subtext,
  color,
}: {
  label: string
  value: string
  subtext: string
  color: 'white' | 'lime' | 'orange'
}) {
  const colors = {
    white: 'text-white',
    lime: 'text-lime-400',
    orange: 'text-orange-400',
  }
  return (
    <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-4">
      <p className="text-neutral-400 text-xs uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold ${colors[color]} mt-1 truncate`}>
        {value}
      </p>
      <p className="text-neutral-500 text-xs mt-1">{subtext}</p>
    </div>
  )
}

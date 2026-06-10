// app/app/works/page.tsx — works list with status tabs + calendar/card toggle.
// Tabs filter client-side (instant). Uses works_with_credit_totals() RPC to
// aggregate credits server-side instead of pulling every generations row.

import { Suspense } from "react";
import { requireActiveMembership } from "@/lib/auth-helpers";
import { createClient } from "@/lib/supabase-server";
import { WorksView } from "./works-view";
import { can } from "@/lib/rbac";

const WORK_ALLOWED_CLIENT_STATUSES = ["trial", "ongoing", "in_talk"];

interface PageProps {
  searchParams: Promise<{ status?: string }>;
}

export default async function WorksPage({ searchParams }: PageProps) {
  const membership = await requireActiveMembership();
  const { status: filterStatus } = await searchParams;

  return (
    <div className="p-6 space-y-6 text-neutral-100">
      <div>
        <h1 className="text-2xl font-bold text-white">Works</h1>
        <p className="text-neutral-400 text-sm mt-1">
          {membership.role === "creator"
            ? "Your assigned works."
            : "All works across the organization."}
        </p>
      </div>
      <Suspense fallback={<WorksSkeleton />}>
        <WorksContent initialFilterStatus={filterStatus} />
      </Suspense>
    </div>
  );
}

const PLACEHOLDER = "00000000-0000-0000-0000-000000000000";

interface WorkRpcRow {
  id: string;
  title: string | null;
  video_type: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  end_time: string | null;
  max_credits: string | null;
  creator_id: string;
  client_id: string;
  credit_sum: string | number;
}

async function WorksContent({ initialFilterStatus }: { initialFilterStatus?: string }) {
  const membership = await requireActiveMembership();
  const supabase = await createClient();

  // WAVE 1 — all three queries fire in parallel.
  // - works_with_credit_totals() RPC = works rows + per-work credit sum (no more pulling every generation row)
  // - clients query
  // - work_creators is org-scoped via RLS, so no need to .in() filter
  const [
    { data: worksRaw, error: worksError },
    { data: allClients },
    { data: workCreators },
  ] = await Promise.all([
    supabase.rpc("works_with_credit_totals"),
    supabase.from("clients").select("id, name, status").order("name"),
    supabase
      .from("work_creators")
      .select("work_id, user_id, added_at")
      .order("added_at", { ascending: true }),
  ]);

  if (worksError) {
    console.error("[works] works_with_credit_totals RPC failed:", worksError.message);
  }

  const works = (worksRaw || []) as WorkRpcRow[];

  // Derive every creator ID we'll need from wave 1 results — no extra round trip.
  const creatorIdSet = new Set<string>();
  works.forEach((w) => creatorIdSet.add(w.creator_id));
  (workCreators || []).forEach((wc) => creatorIdSet.add(wc.user_id));
  const creatorIds = Array.from(creatorIdSet);

  // WAVE 2 — single query for all creator names.
  const { data: creators } = await supabase
    .from("memberships")
    .select("user_id, full_name")
    .in("user_id", creatorIds.length ? creatorIds : [PLACEHOLDER]);

  // Build lookup maps.
  const clientNameMap: Record<string, string> = {};
  const clientStatusMap: Record<string, string> = {};
  (allClients || []).forEach((c) => {
    clientNameMap[c.id] = c.name;
    clientStatusMap[c.id] = c.status;
  });
  const creatorNameMap: Record<string, string> = {};
  (creators || []).forEach((c) => {
    creatorNameMap[c.user_id] = c.full_name;
  });

  // Credit map straight from the RPC — no JS reduce over generations.
  const creditByWork: Record<string, number> = {};
  works.forEach((w) => {
    creditByWork[w.id] =
      typeof w.credit_sum === "number"
        ? w.credit_sum
        : parseFloat(w.credit_sum || "0");
  });

  // Per-work creator lists from work_creators (already fetched in wave 1).
  const additionalByWork = new Map<string, string[]>();
  (workCreators || []).forEach((wc) => {
    const arr = additionalByWork.get(wc.work_id) || [];
    arr.push(wc.user_id);
    additionalByWork.set(wc.work_id, arr);
  });
  const creatorIdsByWork: Record<string, string[]> = {};
  works.forEach((w) => {
    const fromJoin = additionalByWork.get(w.id) || [];
    const others = fromJoin.filter((id) => id !== w.creator_id);
    creatorIdsByWork[w.id] = [w.creator_id, ...others];
  });

  const canCreateWork = can(membership.role, "works", "create");
  const calendarClients = (allClients || []).map((c) => ({
    id: c.id,
    name: c.name,
    canCreateWork:
      canCreateWork && WORK_ALLOWED_CLIENT_STATUSES.includes(c.status),
  }));

  // Shape rows for WorksView (drop the credit_sum, keep WorkData shape).
  const allWorks = works.map((w) => ({
    id: w.id,
    title: w.title,
    video_type: w.video_type,
    status: w.status,
    start_date: w.start_date,
    end_date: w.end_date,
    end_time: w.end_time,
    max_credits: w.max_credits ? parseFloat(w.max_credits) : null,
    creator_id: w.creator_id,
    client_id: w.client_id,
  }));

  return (
    <WorksView
      allWorks={allWorks}
      clientNameMap={clientNameMap}
      clientStatusMap={clientStatusMap}
      creatorNameMap={creatorNameMap}
      creatorIdsByWork={creatorIdsByWork}
      creditByWork={creditByWork}
      clients={calendarClients}
      initialFilterStatus={initialFilterStatus}
      isCreator={membership.role === "creator"}
    />
  );
}

function WorksSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="h-44 rounded-lg bg-neutral-900" />
        <div className="h-44 rounded-lg bg-neutral-900" />
        <div className="h-44 rounded-lg bg-neutral-900" />
      </div>
    </div>
  );
}

// app/app/works/page.tsx — works list with status tabs + calendar/card toggle.
// Tabs filter client-side (instant) — all works are fetched once.

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

async function WorksContent({ initialFilterStatus }: { initialFilterStatus?: string }) {
  const membership = await requireActiveMembership();
  const supabase = await createClient();

  const [{ data: works }, { data: allClients }] = await Promise.all([
    supabase
      .from("works")
      .select(
        "id, title, video_type, status, start_date, end_date, end_time, max_credits, creator_id, client_id",
      )
      .order("created_at", { ascending: false }),
    supabase.from("clients").select("id, name, status").order("name"),
  ]);

  const allWorks = works || [];
  const workIds = allWorks.map((w) => w.id);

  const canCreateWork = can(membership.role, "works", "create");
  const calendarClients = (allClients || []).map((c) => ({
    id: c.id,
    name: c.name,
    canCreateWork:
      canCreateWork && WORK_ALLOWED_CLIENT_STATUSES.includes(c.status),
  }));

  const [{ data: workCredits }, { data: workCreators }] = await Promise.all([
    supabase
      .from("generations")
      .select("work_id, credits")
      .in("work_id", workIds.length ? workIds : [PLACEHOLDER]),
    supabase
      .from("work_creators")
      .select("work_id, user_id, added_at")
      .in("work_id", workIds.length ? workIds : [PLACEHOLDER])
      .order("added_at", { ascending: true }),
  ]);

  const creatorIdSet = new Set<string>();
  allWorks.forEach((w) => creatorIdSet.add(w.creator_id));
  (workCreators || []).forEach((wc) => creatorIdSet.add(wc.user_id));
  const creatorIds = Array.from(creatorIdSet);
  const { data: creators } = await supabase
    .from("memberships")
    .select("user_id, full_name")
    .in("user_id", creatorIds.length ? creatorIds : [PLACEHOLDER]);

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
  const creditByWork: Record<string, number> = {};
  (workCredits || []).forEach((row) => {
    if (row.work_id) {
      creditByWork[row.work_id] =
        (creditByWork[row.work_id] || 0) + parseFloat(row.credits || "0");
    }
  });

  const additionalByWork = new Map<string, string[]>();
  (workCreators || []).forEach((wc) => {
    const arr = additionalByWork.get(wc.work_id) || [];
    arr.push(wc.user_id);
    additionalByWork.set(wc.work_id, arr);
  });
  const creatorIdsByWork: Record<string, string[]> = {};
  allWorks.forEach((w) => {
    const fromJoin = additionalByWork.get(w.id) || [];
    const others = fromJoin.filter((id) => id !== w.creator_id);
    creatorIdsByWork[w.id] = [w.creator_id, ...others];
  });

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

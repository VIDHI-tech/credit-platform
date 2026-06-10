// app/app/works/page.tsx — works list with status tabs + calendar/card toggle.

import { Suspense } from "react";
import { requireActiveMembership } from "@/lib/auth-helpers";
import { createClient } from "@/lib/supabase-server";
import Link from "next/link";
import {
  WORK_STATUSES,
  WORK_STATUS_LABELS,
  type WorkStatus,
} from "@/lib/work-helpers";
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
        <WorksContent filterStatus={filterStatus} />
      </Suspense>
    </div>
  );
}

const PLACEHOLDER = "00000000-0000-0000-0000-000000000000";

async function WorksContent({ filterStatus }: { filterStatus?: string }) {
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

  const counts: Record<WorkStatus | "all", number> = {
    all: works?.length || 0,
    ongoing: 0,
    in_review: 0,
    rework: 0,
    paused: 0,
    completed: 0,
  };
  (works || []).forEach((w) => {
    counts[w.status as WorkStatus]++;
  });

  const visible =
    filterStatus && filterStatus !== "all"
      ? (works || []).filter((w) => w.status === filterStatus)
      : works || [];

  const workIds = visible.map((w) => w.id);

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
  visible.forEach((w) => creatorIdSet.add(w.creator_id));
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
  visible.forEach((w) => {
    const fromJoin = additionalByWork.get(w.id) || [];
    const others = fromJoin.filter((id) => id !== w.creator_id);
    creatorIdsByWork[w.id] = [w.creator_id, ...others];
  });

  return (
    <>
      {/* TABS */}
      <div className="flex border-b border-neutral-800 gap-1 overflow-x-auto">
        <Link
          href="/app/works"
          className={`px-4 py-2 text-sm border-b-2 transition-colors whitespace-nowrap ${
            !filterStatus || filterStatus === "all"
              ? "border-lime-400 text-white"
              : "border-transparent text-neutral-400 hover:text-white"
          }`}
        >
          All ({counts.all})
        </Link>
        {WORK_STATUSES.map((s) => (
          <Link
            key={s}
            href={`/app/works?status=${s}`}
            className={`px-4 py-2 text-sm border-b-2 transition-colors whitespace-nowrap ${
              filterStatus === s
                ? "border-lime-400 text-white"
                : "border-transparent text-neutral-400 hover:text-white"
            }`}
          >
            {WORK_STATUS_LABELS[s]} ({counts[s]})
          </Link>
        ))}
      </div>

      {/* WORKS CONTENT — calendar/cards toggle */}
      {visible.length === 0 ? (
        <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-12 text-center">
          <p className="text-neutral-400">
            {!works || works.length === 0
              ? membership.role === "creator"
                ? "You don't have any works assigned yet."
                : "No works yet. Create one from a Client page."
              : "No works in this status."}
          </p>
        </div>
      ) : (
        <WorksView
          works={visible}
          clientNameMap={clientNameMap}
          clientStatusMap={clientStatusMap}
          creatorNameMap={creatorNameMap}
          creatorIdsByWork={creatorIdsByWork}
          creditByWork={creditByWork}
          clients={calendarClients}
        />
      )}
    </>
  );
}

function WorksSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="flex gap-2 border-b border-neutral-800 pb-2">
        <div className="h-8 w-16 rounded bg-neutral-900" />
        <div className="h-8 w-24 rounded bg-neutral-900" />
        <div className="h-8 w-20 rounded bg-neutral-900" />
        <div className="h-8 w-20 rounded bg-neutral-900" />
        <div className="h-8 w-24 rounded bg-neutral-900" />
        <div className="h-8 w-24 rounded bg-neutral-900" />
      </div>
      <div className="flex justify-end">
        <div className="h-9 w-32 rounded bg-neutral-900" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="h-44 rounded-lg bg-neutral-900" />
        <div className="h-44 rounded-lg bg-neutral-900" />
        <div className="h-44 rounded-lg bg-neutral-900" />
        <div className="h-44 rounded-lg bg-neutral-900" />
        <div className="h-44 rounded-lg bg-neutral-900" />
        <div className="h-44 rounded-lg bg-neutral-900" />
      </div>
    </div>
  );
}

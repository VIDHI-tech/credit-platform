// app/app/works/page.tsx — works list with status tabs + calendar/card toggle.
import { requireActiveMembership } from "@/lib/auth-helpers";
import { createClient } from "@/lib/supabase-server";
import Link from "next/link";
import {
  WORK_STATUSES,
  WORK_STATUS_LABELS,
  type WorkStatus,
} from "@/lib/work-helpers";
import { WorksView } from "./works-view";

interface PageProps {
  searchParams: Promise<{ status?: string }>;
}

const PLACEHOLDER = "00000000-0000-0000-0000-000000000000";

export default async function WorksPage({ searchParams }: PageProps) {
  const membership = await requireActiveMembership();
  const { status: filterStatus } = await searchParams;
  const supabase = await createClient();

  const { data: works } = await supabase
    .from("works")
    .select(
      "id, title, video_type, status, start_date, end_date, end_time, max_credits, creator_id, client_id",
    )
    .order("created_at", { ascending: false });

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

  const clientIds = [...new Set(visible.map((w) => w.client_id))];
  const creatorIds = [...new Set(visible.map((w) => w.creator_id))];
  const workIds = visible.map((w) => w.id);

  const [{ data: clients }, { data: creators }, { data: workCredits }] =
    await Promise.all([
      supabase
        .from("clients")
        .select("id, name")
        .in("id", clientIds.length ? clientIds : [PLACEHOLDER]),
      supabase
        .from("memberships")
        .select("user_id, full_name")
        .in("user_id", creatorIds.length ? creatorIds : [PLACEHOLDER]),
      supabase
        .from("generations")
        .select("work_id, credits")
        .in("work_id", workIds.length ? workIds : [PLACEHOLDER]),
    ]);

  const clientNameMap: Record<string, string> = {};
  (clients || []).forEach((c) => {
    clientNameMap[c.id] = c.name;
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
          creatorNameMap={creatorNameMap}
          creditByWork={creditByWork}
        />
      )}
    </div>
  );
}

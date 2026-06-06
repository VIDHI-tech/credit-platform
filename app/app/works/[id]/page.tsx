// app/app/works/[id]/page.tsx — work detail
// LAYOUT (Phase 6+):
//   Top: header, meta cards, [Schedule | SyncAndAssign] (50/50 split)
//   Below the credit-progress bar: 2-column grid (Assigned | Wastage).
// The standalone "Unassigned generations" card has been removed — its
// content moved into the Sync & Assign modal opened from the right column.
import { requireActiveMembership } from "@/lib/auth-helpers";
import { createClient } from "@/lib/supabase-server";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  WORK_STATUS_COLORS,
  WORK_STATUS_LABELS,
  type WorkStatus,
  formatDeadline,
  allowedTransitions,
} from "@/lib/work-helpers";
import { can } from "@/lib/rbac";
import { StatusActionButtons } from "./status-action-buttons";
import { AssignTables } from "./assign-tables";
import { SyncAndAssign } from "./sync-and-assign";
import { InstructionsViewer } from "./instructions-viewer";
import { ScheduleCalendar } from "./schedule-calendar";
import { WorkActions } from "./work-actions";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function WorkDetailPage({ params }: PageProps) {
  const membership = await requireActiveMembership();
  const { id } = await params;
  const supabase = await createClient();

  // Fetch work by ID (RLS policy ensures user has access to this org's work)
  const { data: work } = await supabase
    .from("works")
    .select(
      "id, title, video_type, status, start_date, end_date, start_time, end_time, max_credits, client_id, creator_id, instructions_path, notes",
    )
    .eq("id", id)
    .maybeSingle();

  if (!work) notFound();

  // Fetch client and creator in parallel
  const [{ data: client }, { data: creator }] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name, status")
      .eq("id", work.client_id)
      .maybeSingle(),
    supabase
      .from("memberships")
      .select("full_name")
      .eq("user_id", work.creator_id)
      .maybeSingle(),
  ]);

  // Only fetch generations that belong to THIS work's client — the
  // assigned + wastage tables below the progress bar. (Unassigned ones live
  // in the Sync & Assign modal and are fetched client-side after sync.)
  const { data: assignedToClient } = await supabase
    .from("generations")
    .select(
      "id, display_name, result_url, media_type, credits, hf_created_at, work_id, assigned_at, assigned_by, is_waste, wasted_at, wasted_by, hf_connection_label",
    )
    .eq("client_id", work.client_id)
    .order("hf_created_at", { ascending: false });

  // Batch-fetch statuses for every work referenced by an assigned generation
  // so the AssignTables row can flag a "Rework" tag without an N+1.
  const referencedWorkIds = Array.from(
    new Set(
      (assignedToClient || [])
        .map((g) => g.work_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const { data: relatedWorks } = referencedWorkIds.length
    ? await supabase
        .from("works")
        .select("id, status")
        .in("id", referencedWorkIds)
    : { data: [] as { id: string; status: string }[] };
  const workStatusMap: Record<string, WorkStatus> = Object.fromEntries(
    (relatedWorks || []).map((w) => [w.id, w.status as WorkStatus]),
  );

  // Batch-fetch full_name for every user who has assigned a generation to
  // this client — used by the per-creator stats panel inside Sync & Assign.
  const referencedAssignerIds = Array.from(
    new Set(
      (assignedToClient || [])
        .map((g) => g.assigned_by)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const { data: assignerMemberships } = referencedAssignerIds.length
    ? await supabase
        .from("memberships")
        .select("user_id, full_name")
        .in("user_id", referencedAssignerIds)
    : { data: [] as { user_id: string; full_name: string }[] };
  const creatorNameMap: Record<string, string> = Object.fromEntries(
    (assignerMemberships || []).map((m) => [m.user_id, m.full_name]),
  );

  // Per-creator breakdown for THIS work only.
  // - actualUsage : credits on this work that are NOT wasted
  // - wastage     : credits on this work that ARE wasted
  // - rework      : credits whose work is in 'rework' status (this work counts
  //                 when it's currently in rework, plus generations attributed
  //                 to other works on the same client that are in rework)
  const perCreatorStats: Record<
    string,
    { name: string; actual: number; wastage: number; rework: number }
  > = {};
  for (const g of assignedToClient || []) {
    if (!g.assigned_by) continue;
    const credits = parseFloat(g.credits || "0");
    if (!perCreatorStats[g.assigned_by]) {
      perCreatorStats[g.assigned_by] = {
        name: creatorNameMap[g.assigned_by] || "Unknown",
        actual: 0,
        wastage: 0,
        rework: 0,
      };
    }
    const row = perCreatorStats[g.assigned_by];
    const onThisWork = g.work_id === work.id;
    if (onThisWork) {
      if (g.is_waste) row.wastage += credits;
      else row.actual += credits;
    }
    if (g.work_id && workStatusMap[g.work_id] === "rework") {
      row.rework += credits;
    }
  }
  const creatorStats = Object.entries(perCreatorStats).map(([userId, s]) => ({
    userId,
    ...s,
  }));

  const usedCredits = (assignedToClient || [])
    .filter((g) => g.work_id === work.id)
    .reduce((s, g) => s + parseFloat(g.credits || "0"), 0);

  const status = work.status as WorkStatus;
  const isOwnWork = work.creator_id === membership.user_id;
  const transitions = allowedTransitions(status, membership.role, isOwnWork);
  const maxCredits = work.max_credits ? parseFloat(work.max_credits) : null;
  const canEdit = can(
    membership.role as "master" | "manager" | "creator",
    "works",
    "edit",
  );
  const canDelete = can(
    membership.role as "master" | "manager" | "creator",
    "works",
    "delete",
  );

  return (
    <div className="p-6 text-neutral-100">
      <Link
        href="/app/works"
        className="text-neutral-400 hover:text-white text-sm inline-flex items-center gap-1 mb-4"
      >
        ← Back to Works
      </Link>

      {/* HEADER */}
      <div className="flex items-start justify-between gap-4 mb-2">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-3xl font-bold text-white">
              {work.title || work.video_type || "Untitled Work"}
            </h1>
            <span
              className={`text-xs px-3 py-1 rounded border ${WORK_STATUS_COLORS[status]}`}
            >
              {WORK_STATUS_LABELS[status]}
            </span>
          </div>
          <p className="text-neutral-400">
            <Link
              href={`/app/clients/${work.client_id}`}
              className="text-lime-400 hover:underline"
            >
              {client?.name}
            </Link>
            {" · "}
            Creator: {creator?.full_name || "Unknown"}
            {work.end_date &&
              ` · Due ${formatDeadline(work.end_date, work.end_time)}`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {transitions.length > 0 && (
            <StatusActionButtons workId={work.id} transitions={transitions} />
          )}
          <WorkActions
            work={{
              id: work.id,
              title: work.title,
              creator_id: work.creator_id,
              video_type: work.video_type,
              max_credits: work.max_credits
                ? parseFloat(work.max_credits)
                : null,
              start_date: work.start_date,
              end_date: work.end_date,
              start_time: work.start_time,
              end_time: work.end_time,
              notes: work.notes,
            }}
            canEdit={canEdit}
            canDelete={canDelete}
          />
        </div>
      </div>

      {/* META: Type + Budget */}
      <div className="grid grid-cols-2 gap-4 mt-6 mb-6">
        <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3">
          <div className="text-xs text-neutral-500 uppercase tracking-wider">
            Type
          </div>
          <div className="text-sm text-white mt-1">
            {work.video_type || "—"}
          </div>
        </div>
        <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3">
          <div className="text-xs text-neutral-500 uppercase tracking-wider">
            Budget
          </div>
          <div className="text-sm text-white mt-1">
            {usedCredits.toFixed(1)}
            {maxCredits !== null && (
              <span className="text-neutral-500 text-xs"> / {maxCredits}</span>
            )}
            <span className="text-neutral-500 text-xs"> cr</span>
          </div>
        </div>
      </div>

      {/* 50/50: SCHEDULE (left) + SYNC & ASSIGN (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* SCHEDULE */}
        <section className="bg-neutral-950 border border-neutral-800 rounded-lg overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-white text-sm">Schedule</h2>
              <p className="text-xs text-neutral-500 mt-0.5">
                {work.start_date && work.end_date
                  ? `${new Date(work.start_date).toLocaleDateString("en-US")} → ${new Date(work.end_date).toLocaleDateString("en-US")}`
                  : work.start_date
                    ? `Starts ${new Date(work.start_date).toLocaleDateString("en-US")}`
                    : work.end_date
                      ? `Due ${new Date(work.end_date).toLocaleDateString("en-US")}`
                      : "No dates set"}
              </p>
            </div>
            {(work.start_time || work.end_time) && (
              <div className="text-xs text-neutral-500">
                {work.start_time && <span>Start {work.start_time}</span>}
                {work.start_time && work.end_time && " · "}
                {work.end_time && <span>End {work.end_time}</span>}
              </div>
            )}
          </div>
          <div className="flex-1">
            <ScheduleCalendar
              startDate={work.start_date}
              endDate={work.end_date}
            />
          </div>
        </section>

        {/* SYNC & ASSIGN */}
        <SyncAndAssign
          workId={work.id}
          clientId={work.client_id}
          clientName={client?.name || ""}
          userRole={membership.role as "master" | "manager" | "creator"}
          creatorStats={creatorStats}
        />
      </div>

      {/* CREDIT PROGRESS (if max set) */}
      {maxCredits !== null && maxCredits > 0 && (
        <div className="mb-6">
          <div className="flex justify-between text-xs text-neutral-400 mb-1">
            <span>Credit usage</span>
            <span>
              {usedCredits.toFixed(1)} / {maxCredits} (
              {((usedCredits / maxCredits) * 100).toFixed(0)}%)
            </span>
          </div>
          <div className="w-full bg-neutral-800 rounded-full h-2 overflow-hidden">
            <div
              className={`h-2 transition-all ${usedCredits > maxCredits ? "bg-red-500" : "bg-lime-400"}`}
              style={{
                width: `${Math.min(100, (usedCredits / maxCredits) * 100)}%`,
              }}
            />
          </div>
          {usedCredits > maxCredits && (
            <p className="text-xs text-red-400 mt-1">⚠ Over budget</p>
          )}
        </div>
      )}

      {/* INSTRUCTIONS */}
      {(work.instructions_path || work.notes) && (
        <section className="bg-neutral-950 border border-neutral-800 rounded-lg overflow-hidden mb-6">
          <div className="px-4 py-3 border-b border-neutral-800">
            <h2 className="font-semibold text-white text-sm">Instructions</h2>
          </div>
          {work.instructions_path && (
            <InstructionsViewer path={work.instructions_path} />
          )}
          {work.notes && (
            <div className="px-4 py-3 border-t border-neutral-800">
              <div className="text-[10px] text-neutral-500 uppercase tracking-wider mb-2">
                Notes
              </div>
              <p className="text-sm text-neutral-200 whitespace-pre-wrap font-mono">
                {work.notes}
              </p>
            </div>
          )}
        </section>
      )}

      {/* ASSIGNED + WASTAGE — 2-column below the progress bar */}
      <AssignTables
        workId={work.id}
        clientName={client?.name || ""}
        assignedToClient={(assignedToClient || []) as never}
        workStatusMap={workStatusMap}
        userRole={membership.role as "master" | "manager" | "creator"}
        userId={membership.user_id}
      />
    </div>
  );
}

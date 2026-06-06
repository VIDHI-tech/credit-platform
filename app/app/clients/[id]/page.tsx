// app/app/clients/[id]/page.tsx — client detail: credit summary, works,
// per-work per-user report, assigned + wastage tables.
// Supports ?range=week|month|year — server-side date floor on the
// generations query so every aggregated number on the page respects it.
import { requireActiveMembership } from "@/lib/auth-helpers";
import { createClient } from "@/lib/supabase-server";
import { can } from "@/lib/rbac";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  CLIENT_STATUS_COLORS,
  CLIENT_STATUS_LABELS,
  type ClientStatus,
} from "@/lib/client-helpers";
import {
  WORK_STATUS_COLORS,
  WORK_STATUS_LABELS,
  type WorkStatus,
} from "@/lib/work-helpers";
import { StatusDropdown } from "./status-dropdown";
import { EditClientButton } from "./edit-client-button";
import { DeleteClientButton } from "./delete-client-button";
import { CreateWorkButton } from "./create-work-button";
import { ClientGenerationsTables } from "./client-generations-tables";
import {
  ClientTimeFilter,
  type ClientRange,
} from "./client-time-filter";
import {
  WorkUserReport,
  type WorkReportRow,
  type WorkUserStat,
} from "./work-user-report";

// Clients in these statuses can have new works created against them.
// Outreach/paused/ended cannot — that's the user-facing rule on this page.
const WORK_ALLOWED_STATUSES: ClientStatus[] = ["trial", "ongoing", "in_talk"];

const RANGE_DAYS: Record<ClientRange, number | null> = {
  all: null,
  week: 7,
  month: 30,
  year: 365,
};
const RANGE_LABEL: Record<ClientRange, string> = {
  all: "All time",
  week: "Last 7 days",
  month: "Last 30 days",
  year: "Last 365 days",
};

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ range?: string }>;
}

export default async function ClientDetailPage({
  params,
  searchParams,
}: PageProps) {
  const membership = await requireActiveMembership();
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();

  const rawRange = (sp.range as ClientRange | undefined) || "all";
  const range: ClientRange = (
    ["all", "week", "month", "year"] as const
  ).includes(rawRange as ClientRange)
    ? (rawRange as ClientRange)
    : "all";
  const daysBack = RANGE_DAYS[range];
  const fromIso =
    daysBack === null
      ? null
      : new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();

  const { data: client } = await supabase
    .from("clients")
    .select("id, name, industry, status")
    .eq("id", id)
    .maybeSingle();

  if (!client) notFound();

  // Generations for this client, scoped by the time filter (when set).
  let generationsQuery = supabase
    .from("generations")
    .select(
      "id, display_name, result_url, media_type, credits, hf_created_at, work_id, assigned_at, assigned_by, is_waste, wasted_at, wasted_by, hf_connection_label",
    )
    .eq("client_id", id)
    .order("hf_created_at", { ascending: false });
  if (fromIso) {
    generationsQuery = generationsQuery.gte("hf_created_at", fromIso);
  }
  const { data: generations } = await generationsQuery;

  // Works for this client (NOT time-filtered — we want the full list so the
  // user can see every work even if no activity in the selected range).
  const { data: works } = await supabase
    .from("works")
    .select("id, title, video_type, status, end_date, max_credits, creator_id")
    .eq("client_id", id)
    .order("created_at", { ascending: false });

  // Names for every user who either created a work OR assigned a generation.
  const userIds = new Set<string>();
  (works || []).forEach((w) => userIds.add(w.creator_id));
  (generations || []).forEach((g) => {
    if (g.assigned_by) userIds.add(g.assigned_by);
  });
  const userIdList = Array.from(userIds);
  const { data: users } = await supabase
    .from("memberships")
    .select("user_id, full_name")
    .in(
      "user_id",
      userIdList.length > 0
        ? userIdList
        : ["00000000-0000-0000-0000-000000000000"],
    );
  const userNameMap = new Map(
    (users || []).map((u) => [u.user_id, u.full_name]),
  );

  // creditByWork derives from the same time-filtered generations set so the
  // per-work credit column on the Works list respects the filter.
  const creditByWork = new Map<string, number>();
  (generations || []).forEach((g) => {
    if (g.work_id) {
      creditByWork.set(
        g.work_id,
        (creditByWork.get(g.work_id) || 0) + parseFloat(g.credits || "0"),
      );
    }
  });

  // Per-work, per-user breakdown. Each credit goes into EXACTLY ONE bucket:
  //   - wastage: is_waste = true
  //   - rework : !is_waste AND work.status === 'rework'
  //   - actual : !is_waste AND work.status !== 'rework'
  // So actual + wastage + rework = total credits attributed to the work.
  const workStatusMap = new Map<string, WorkStatus>();
  (works || []).forEach((w) => {
    workStatusMap.set(w.id, w.status as WorkStatus);
  });
  type Bucket = { actual: number; wastage: number; rework: number };
  const perWorkPerUser = new Map<string, Map<string, Bucket>>();
  (generations || []).forEach((g) => {
    if (!g.work_id || !g.assigned_by) return;
    const credits = parseFloat(g.credits || "0");
    if (credits <= 0) return;
    let users = perWorkPerUser.get(g.work_id);
    if (!users) {
      users = new Map();
      perWorkPerUser.set(g.work_id, users);
    }
    let bucket = users.get(g.assigned_by);
    if (!bucket) {
      bucket = { actual: 0, wastage: 0, rework: 0 };
      users.set(g.assigned_by, bucket);
    }
    if (g.is_waste) {
      bucket.wastage += credits;
    } else if (workStatusMap.get(g.work_id) === "rework") {
      bucket.rework += credits;
    } else {
      bucket.actual += credits;
    }
  });
  const reportRows: WorkReportRow[] = (works || []).map((w) => {
    const userMap = perWorkPerUser.get(w.id) || new Map<string, Bucket>();
    const stats: WorkUserStat[] = Array.from(userMap.entries())
      .map(([userId, b]) => ({
        userId,
        name: userNameMap.get(userId) || "Unknown",
        actual: b.actual,
        wastage: b.wastage,
        rework: b.rework,
      }))
      // Sort by total credits descending so the top contributor leads.
      .sort(
        (a, b) =>
          b.actual + b.wastage + b.rework - (a.actual + a.wastage + a.rework),
      );
    return {
      workId: w.id,
      title: w.title || w.video_type || "Untitled work",
      status: w.status as WorkStatus,
      stats,
    };
  });

  const totalCredits = (generations || []).reduce(
    (sum, g) => sum + parseFloat(g.credits || "0"),
    0,
  );

  // work_id → "title or video_type" for the "via {work}" hint inside the
  // Assigned/Wastage tables below.
  const workTitles: Record<string, string> = {};
  (works || []).forEach((w) => {
    workTitles[w.id] = w.title || w.video_type || "Untitled work";
  });

  const status = client.status as ClientStatus;
  const canEdit = can(membership.role, "clients", "edit");
  const canDelete = can(membership.role, "clients", "delete");
  const canCreateWork = can(membership.role, "works", "create");
  const isWorkAllowedStatus = WORK_ALLOWED_STATUSES.includes(status);
  const showCreateWork = canCreateWork && isWorkAllowedStatus;

  return (
    <div className="p-6 max-w-5xl mx-auto text-neutral-100">
      <Link
        href="/app/clients"
        className="text-neutral-400 hover:text-white text-sm inline-flex items-center gap-1 mb-4"
      >
        ← Back to Clients
      </Link>

      <div className="flex items-start justify-between gap-4 mb-2">
        <h1 className="text-3xl font-bold text-white">{client.name}</h1>
        <div className="flex items-center gap-2">
          {canEdit ? (
            <StatusDropdown clientId={client.id} currentStatus={status} />
          ) : (
            <span
              className={`text-xs px-3 py-1 rounded border ${CLIENT_STATUS_COLORS[status]}`}
            >
              {CLIENT_STATUS_LABELS[status]}
            </span>
          )}
          {canEdit && (
            <EditClientButton
              client={{
                id: client.id,
                name: client.name,
                industry: client.industry,
                status,
              }}
            />
          )}
        </div>
      </div>
      <p className="text-neutral-400 mb-6">
        {client.industry || (
          <span className="text-neutral-600 italic">No industry set</span>
        )}
      </p>

      {/* TIME FILTER — drives the credit summary, per-work credits, and the
          per-work per-user report below. */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <div className="text-xs text-neutral-500 uppercase tracking-wider">
            Scope
          </div>
          <div className="text-sm text-white mt-0.5">{RANGE_LABEL[range]}</div>
        </div>
        <ClientTimeFilter current={range} />
      </div>

      {/* CREDIT SUMMARY (within the selected range) */}
      <section className="bg-neutral-950 border border-neutral-800 rounded-lg p-6 mb-6">
        <h2 className="text-xs uppercase tracking-wider font-semibold text-neutral-400 mb-4">
          Credit usage · {RANGE_LABEL[range]}
        </h2>
        <div className="grid grid-cols-3 gap-6">
          <div>
            <div className="text-3xl font-bold text-white">
              {totalCredits.toFixed(1)}
            </div>
            <div className="text-sm text-neutral-500 mt-1">Total credits</div>
          </div>
          <div>
            <div className="text-3xl font-bold text-white">
              {generations?.length || 0}
            </div>
            <div className="text-sm text-neutral-500 mt-1">Generations</div>
          </div>
          <div>
            <div className="text-3xl font-bold text-white">
              {works?.length || 0}
            </div>
            <div className="text-sm text-neutral-500 mt-1">Works (total)</div>
          </div>
        </div>
      </section>

      {/* WORKS — full list, regardless of range. Create Work is gated on
          client status (trial / ongoing / in_talk only). */}
      <section className="bg-neutral-950 border border-neutral-800 rounded-lg overflow-hidden mb-6">
        <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold text-white">Works</h2>
            {canCreateWork && !isWorkAllowedStatus && (
              <p className="text-xs text-neutral-500 mt-0.5">
                Move client to{" "}
                <span className="text-lime-400">Trial</span>,{" "}
                <span className="text-lime-400">Ongoing</span>, or{" "}
                <span className="text-lime-400">In Talks</span> to add a new
                work.
              </p>
            )}
          </div>
          {showCreateWork && (
            <CreateWorkButton clientId={client.id} clientName={client.name} />
          )}
        </div>
        {!works || works.length === 0 ? (
          <div className="p-8 text-center text-neutral-500">
            <p>No works yet for this client.</p>
            {showCreateWork && (
              <p className="text-sm mt-1">
                Use + Create Work above to add one.
              </p>
            )}
            {canCreateWork && !isWorkAllowedStatus && (
              <p className="text-sm mt-1">
                Status is{" "}
                <span className="text-neutral-300">
                  {CLIENT_STATUS_LABELS[status]}
                </span>{" "}
                — works can only be added on Trial / Ongoing / In Talks
                clients.
              </p>
            )}
          </div>
        ) : (
          <div className="divide-y divide-neutral-800">
            {works.map((w) => (
              <Link
                key={w.id}
                href={`/app/works/${w.id}`}
                className="block px-4 py-3 hover:bg-neutral-900/60 transition-colors"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-white">
                        {w.title || w.video_type || "Untitled work"}
                      </span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded border ${WORK_STATUS_COLORS[w.status as WorkStatus]}`}
                      >
                        {WORK_STATUS_LABELS[w.status as WorkStatus]}
                      </span>
                    </div>
                    <div className="text-xs text-neutral-500">
                      {w.video_type && <span>{w.video_type} · </span>}
                      Creator: {userNameMap.get(w.creator_id) || "Unknown"}
                      {w.end_date && (
                        <span>
                          {" "}
                          · Due{" "}
                          {new Date(w.end_date).toLocaleDateString("en-US")}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-white">
                      {(creditByWork.get(w.id) || 0).toFixed(1)}
                      {w.max_credits && (
                        <span className="text-neutral-500 text-xs">
                          {" "}
                          / {w.max_credits}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-neutral-500">
                      credits · {RANGE_LABEL[range]}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* PER-WORK PER-USER REPORT */}
      <WorkUserReport rows={reportRows} rangeLabel={RANGE_LABEL[range]} />

      {/* ASSIGNED + WASTAGE TABLES — same pattern as the work-detail page,
          with the 60s undo window for unassign / mark-useful. */}
      <ClientGenerationsTables
        clientName={client.name}
        generations={(generations || []).map((g) => ({
          id: g.id,
          display_name: g.display_name,
          result_url: g.result_url,
          media_type: g.media_type,
          credits: g.credits,
          hf_created_at: g.hf_created_at,
          work_id: g.work_id,
          assigned_at: g.assigned_at,
          assigned_by: g.assigned_by,
          is_waste: g.is_waste,
          wasted_at: g.wasted_at,
          wasted_by: g.wasted_by,
          hf_connection_label: g.hf_connection_label,
        }))}
        workTitles={workTitles}
        userRole={membership.role as "master" | "manager" | "creator"}
        userId={membership.user_id}
      />

      {canDelete && (
        <section className="bg-red-950/30 border border-red-900 rounded-lg p-6">
          <h2 className="text-xs uppercase tracking-wider font-semibold text-red-400 mb-2">
            Danger zone
          </h2>
          <p className="text-neutral-400 text-sm mb-3">
            Deleting this client also deletes all its works and unassigns its
            generations.
          </p>
          <DeleteClientButton clientId={client.id} clientName={client.name} />
        </section>
      )}
    </div>
  );
}

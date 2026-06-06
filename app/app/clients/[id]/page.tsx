// app/app/clients/[id]/page.tsx — client detail: credit summary, works, generations.
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

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ClientDetailPage({ params }: PageProps) {
  const membership = await requireActiveMembership();
  const { id } = await params;
  const supabase = await createClient();

  const { data: client } = await supabase
    .from("clients")
    .select("id, name, industry, status")
    .eq("id", id)
    .maybeSingle();

  if (!client) notFound();

  const { data: generations } = await supabase
    .from("generations")
    .select(
      "id, display_name, result_url, media_type, credits, hf_created_at, work_id, assigned_at, assigned_by, is_waste, wasted_at, wasted_by, hf_connection_label",
    )
    .eq("client_id", id)
    .order("hf_created_at", { ascending: false });

  const { data: works } = await supabase
    .from("works")
    .select("id, title, video_type, status, end_date, max_credits, creator_id")
    .eq("client_id", id)
    .order("created_at", { ascending: false });

  const creatorIds = [...new Set((works || []).map((w) => w.creator_id))];
  const { data: creators } = await supabase
    .from("memberships")
    .select("user_id, full_name")
    .in(
      "user_id",
      creatorIds.length > 0
        ? creatorIds
        : ["00000000-0000-0000-0000-000000000000"],
    );
  const creatorNameMap = new Map(
    (creators || []).map((c) => [c.user_id, c.full_name]),
  );

  const workIds = (works || []).map((w) => w.id);
  const { data: workCredits } = await supabase
    .from("generations")
    .select("work_id, credits")
    .in(
      "work_id",
      workIds.length > 0 ? workIds : ["00000000-0000-0000-0000-000000000000"],
    );

  const creditByWork = new Map<string, number>();
  (workCredits || []).forEach((row) => {
    if (row.work_id) {
      creditByWork.set(
        row.work_id,
        (creditByWork.get(row.work_id) || 0) + parseFloat(row.credits || "0"),
      );
    }
  });

  const totalCredits = (generations || []).reduce(
    (sum, g) => sum + parseFloat(g.credits || "0"),
    0,
  );

  // work_id → "title or video_type" for the "via {work}" hint per row.
  const workTitles: Record<string, string> = {};
  (works || []).forEach((w) => {
    workTitles[w.id] = w.title || w.video_type || "Untitled work";
  });

  const status = client.status as ClientStatus;
  const canEdit = can(membership.role, "clients", "edit");
  const canDelete = can(membership.role, "clients", "delete");
  const canCreateWork = can(membership.role, "works", "create");

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
      <p className="text-neutral-400 mb-8">
        {client.industry || (
          <span className="text-neutral-600 italic">No industry set</span>
        )}
      </p>

      {/* CREDIT SUMMARY */}
      <section className="bg-neutral-950 border border-neutral-800 rounded-lg p-6 mb-6">
        <h2 className="text-xs uppercase tracking-wider font-semibold text-neutral-400 mb-4">
          Credit Usage
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
            <div className="text-sm text-neutral-500 mt-1">Works</div>
          </div>
        </div>
      </section>

      {/* WORKS */}
      <section className="bg-neutral-950 border border-neutral-800 rounded-lg overflow-hidden mb-6">
        <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between">
          <h2 className="font-semibold text-white">Works</h2>
          {canCreateWork && (
            <CreateWorkButton clientId={client.id} clientName={client.name} />
          )}
        </div>
        {!works || works.length === 0 ? (
          <div className="p-8 text-center text-neutral-500">
            <p>No works yet for this client.</p>
            {canCreateWork && (
              <p className="text-sm mt-1">
                Use + Create Work above to add one.
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
                      Creator: {creatorNameMap.get(w.creator_id) || "Unknown"}
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
                    <div className="text-xs text-neutral-500">credits</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

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

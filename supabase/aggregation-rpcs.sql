-- aggregation-rpcs.sql — OPTIONAL performance migration.
-- Paste into the Supabase SQL Editor AFTER running all prior migrations.
-- These RPCs aggregate generations server-side in Postgres instead of
-- fetching all rows to Node. Not required for correctness — the app
-- works without them — but they dramatically improve performance once
-- the generations table grows past ~10k rows.
--
-- All functions use SECURITY INVOKER so existing RLS policies apply.

-- 1. Dashboard: total / unassigned credits + generation count.
CREATE OR REPLACE FUNCTION dashboard_generation_stats()
RETURNS TABLE(
  total_credits numeric,
  unassigned_credits numeric,
  generation_count bigint
)
LANGUAGE sql STABLE SECURITY INVOKER
AS $$
  SELECT
    COALESCE(SUM(credits::numeric), 0),
    COALESCE(SUM(CASE WHEN client_id IS NULL THEN credits::numeric ELSE 0 END), 0),
    COUNT(*)
  FROM generations;
$$;

-- 2. Dashboard: credits consumed by a set of work IDs (for "my credits used").
CREATE OR REPLACE FUNCTION credits_for_works(p_work_ids uuid[])
RETURNS numeric
LANGUAGE sql STABLE SECURITY INVOKER
AS $$
  SELECT COALESCE(SUM(credits::numeric), 0)
  FROM generations
  WHERE work_id = ANY(p_work_ids);
$$;

-- 3. Client detail: credit total + generation count within an optional date range.
CREATE OR REPLACE FUNCTION client_generation_stats(
  p_client_id uuid,
  p_from_date timestamptz DEFAULT NULL
)
RETURNS TABLE(
  total_credits numeric,
  generation_count bigint
)
LANGUAGE sql STABLE SECURITY INVOKER
AS $$
  SELECT
    COALESCE(SUM(credits::numeric), 0),
    COUNT(*)
  FROM generations
  WHERE client_id = p_client_id
    AND (p_from_date IS NULL OR hf_created_at >= p_from_date);
$$;

-- 4. Work detail: per-creator actual / wastage / rework credit breakdown.
CREATE OR REPLACE FUNCTION work_creator_stats(
  p_client_id uuid,
  p_work_id uuid
)
RETURNS TABLE(
  assigned_by uuid,
  actual_credits numeric,
  wastage_credits numeric,
  rework_credits numeric
)
LANGUAGE sql STABLE SECURITY INVOKER
AS $$
  SELECT
    g.assigned_by,
    COALESCE(SUM(CASE
      WHEN g.work_id = p_work_id AND NOT COALESCE(g.is_waste, false)
      THEN g.credits::numeric ELSE 0 END), 0),
    COALESCE(SUM(CASE
      WHEN g.work_id = p_work_id AND COALESCE(g.is_waste, false)
      THEN g.credits::numeric ELSE 0 END), 0),
    COALESCE(SUM(CASE
      WHEN w.status = 'rework' THEN g.credits::numeric ELSE 0 END), 0)
  FROM generations g
  LEFT JOIN works w ON w.id = g.work_id
  WHERE g.client_id = p_client_id
    AND g.assigned_by IS NOT NULL
  GROUP BY g.assigned_by;
$$;

-- 5. Work detail: total credits used on a single work.
CREATE OR REPLACE FUNCTION work_total_credits(p_work_id uuid)
RETURNS numeric
LANGUAGE sql STABLE SECURITY INVOKER
AS $$
  SELECT COALESCE(SUM(credits::numeric), 0)
  FROM generations
  WHERE work_id = p_work_id;
$$;

-- 6. Recommended indexes for the above RPCs.
-- Only create if they don't already exist.
CREATE INDEX IF NOT EXISTS idx_generations_client_id ON generations(client_id);
CREATE INDEX IF NOT EXISTS idx_generations_work_id ON generations(work_id);
CREATE INDEX IF NOT EXISTS idx_generations_assigned_by ON generations(assigned_by);
CREATE INDEX IF NOT EXISTS idx_generations_hf_created_at ON generations(hf_created_at);

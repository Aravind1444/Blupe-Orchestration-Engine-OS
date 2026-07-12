-- Optional: add trigger source tracking to run_history (used by Cloud Run runner)
-- Safe to re-run.
ALTER TABLE public.run_history
  ADD COLUMN IF NOT EXISTS triggered_by TEXT;

COMMENT ON COLUMN public.run_history.triggered_by IS
  'Source of the run: Manual, Webhook, Schedule, Direct, Cloud, Resume, Public Runner, etc.';

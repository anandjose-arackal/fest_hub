-- Some feasts are run entirely outside this app (paper scoring, a different
-- system, etc.) but their shakha points still need to count toward the
-- overall cross-feast standings. is_external marks a feast whose points are
-- entered directly by an admin instead of computed from competitions —
-- see src/actions/results.ts's saveExternalFeastPoints and
-- src/app/admin/feasts/[id]/external-points/page.tsx.
-- Idempotent: safe to re-run.

alter table feasts add column if not exists is_external boolean not null default false;

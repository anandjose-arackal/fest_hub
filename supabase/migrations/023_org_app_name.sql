-- Product/app display name shown as the Fest Portal dashboard's headline
-- (feast-landing.tsx), distinct from org_name_en (used elsewhere, e.g. logo
-- alt text) and org_name_local (the gradient subheading beneath it).
-- Idempotent: safe to re-run.

alter table org_settings add column if not exists app_name text not null default 'Fest Hub Admin';

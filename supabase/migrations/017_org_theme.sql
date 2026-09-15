-- Portal color theme: an admin-configurable choice among a fixed set of
-- palettes for the public Fest Portal (never the /admin back-office, which
-- keeps its own fixed look). Applied via a `data-fp-theme` attribute on the
-- root layout, which the CSS variables in globals.css key off — see
-- src/components/feast/feast-shared.tsx's `theme` export.
-- Idempotent: safe to re-run.

alter table org_settings add column if not exists theme text not null default 'violet';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'org_settings_theme_check'
  ) then
    alter table org_settings add constraint org_settings_theme_check
      check (theme in ('violet', 'ocean', 'sunset'));
  end if;
end $$;

-- Adds "emerald" — a second dark theme (teal/green instead of midnight's
-- purple) — as an 8th org_settings.theme value (see globals.css's
-- [data-fp-theme="emerald"] block).
-- Idempotent: safe to re-run.

do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'org_settings_theme_check'
  ) then
    alter table org_settings drop constraint org_settings_theme_check;
  end if;
  alter table org_settings add constraint org_settings_theme_check
    check (theme in ('violet', 'ocean', 'sunset', 'aurora', 'carnival', 'amethyst', 'midnight', 'emerald'));
end $$;
